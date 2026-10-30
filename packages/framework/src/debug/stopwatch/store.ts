import { decodeCompoundKey, encodeCompoundKey, FrameEnd, FrameStart, FrameType, incrementCompoundKey, StopwatchStore } from '@deepkit/stopwatch';
import { existsSync, mkdirSync, readFileSync, unlinkSync } from 'fs';
import { appendFile } from 'fs/promises';
import { join } from 'path';
import { decodeFrames, encodeAnalytic, encodeFrameData, encodeFrames } from '@deepkit/framework-debug-api';
import { formatError, Mutex } from '@deepkit/core';
import { FrameworkConfig } from '../../module.config.js';
import { Zone } from '../../zone.js';
import cluster from 'cluster';
import { performance } from 'perf_hooks';
import { DebugBrokerBus } from '../broker.js';
import { BrokerBusChannel } from '@deepkit/broker';
import { Logger } from '@deepkit/logger';

export class FileStopwatchStore extends StopwatchStore {
    protected lastSync?: any;
    protected syncMutex = new Mutex;

    protected lastId: number = -1;
    protected lastContext: number = -1;

    public frameChannel: BrokerBusChannel<Uint8Array> | undefined;
    public frameDataChannel: BrokerBusChannel<Uint8Array> | undefined;

    protected framesPath: string = join(this.config.varPath, this.config.debugStorePath, 'frames.bin');
    protected framesDataPath: string = join(this.config.varPath, this.config.debugStorePath, 'frames-data.bin');
    protected analyticsPath: string = join(this.config.varPath, this.config.debugStorePath, 'analytics.bin');

    protected ended = false;
    protected folderCreated = false;
    protected publishFailed = false;

    constructor(
        protected config: Pick<FrameworkConfig, 'varPath' | 'debugStorePath'>,
        protected broker: DebugBrokerBus,
        protected logger: Logger,
    ) {
        super();
        this.frameChannel = broker.channel<Uint8Array>('_debug/frames');
        this.frameDataChannel = broker.channel<Uint8Array>('_debug/frames-data');
    }

    removeAll() {
        // truncate all files
        for (const file of [this.framesPath, this.framesDataPath, this.analyticsPath]) {
            try {
                unlinkSync(file);
            } catch {
            }
        }
        this.lastId = -1;
        this.lastContext = -1;
    }

    async close() {
        //last sync, then stop everything
        try {
            // close() is called onAppExecuted so it must not throw
            await this.syncNow();
        } catch (error) {
            this.logger.error('Could not sync debug store', formatError(error));
        }
        this.ended = true;
    }

    run<T>(data: { [name: string]: any }, cb: () => Promise<T>): Promise<T> {
        return Zone.run(data, cb);
    }

    getZone(): { [name: string]: any } | undefined {
        return Zone.current();
    }

    add(frame: FrameStart | FrameEnd): void {
        const [id, worker] = decodeCompoundKey(frame.cid);
        frame.cid = encodeCompoundKey(id, cluster.isWorker ? cluster.worker!.id : 0);
        frame.timestamp = Math.floor(performance.timeOrigin * 1_000 + performance.now() * 1_000);
        super.add(frame);
    }

    protected async loadLastNumberRange() {
        if (this.lastId >= 0) return;

        if (existsSync(this.framesPath)) {
            const data = readFileSync(this.framesPath);

            if (data.byteLength === 0) {
                this.lastId = 0;
                this.lastContext = 0;
                return;
            }

            let last: FrameStart | undefined;

            decodeFrames(data, (frame) => {
                if (frame.type === FrameType.start) {
                    last = frame;
                }
            });

            if (last) {
                this.lastId = decodeCompoundKey(last.cid)[0];
                this.lastContext = last.context;
            }
        } else {
            this.lastId = 0;
        }
    }

    protected sync() {
        if (this.lastSync) return;
        this.lastSync = setTimeout(() => {
            this.syncNow().catch(error => this.logger.error('Could not sync debug store', formatError(error)));
        }, 250);
    }

    protected ensureVarDebugFolder() {
        if (this.folderCreated) return;
        mkdirSync(join(this.config.varPath, this.config.debugStorePath), { recursive: true });
        this.folderCreated = true;
    }

    protected async syncNow() {
        if (this.ended) return;

        await this.syncMutex.lock();
        try {
            await this.loadLastNumberRange();

            const frames = this.frameQueue.slice();
            const frameData = this.dataQueue.slice();
            const analytics = this.analytics.slice();
            this.frameQueue = [];
            this.dataQueue = [];
            this.analytics = [];

            for (const frame of frames) {
                frame.cid = incrementCompoundKey(frame.cid, this.lastId);
                if (frame.type === FrameType.start) frame.context += this.lastContext;
            }

            for (const frame of frameData) {
                frame.cid = incrementCompoundKey(frame.cid, this.lastId);
            }

            const frameBytes = encodeFrames(frames);
            const dataBytes = encodeFrameData(frameData);
            const analyticsBytes = encodeAnalytic(analytics);

            try {
                this.ensureVarDebugFolder();
                if (frameBytes.byteLength) await appendFile(this.framesPath, frameBytes);
                if (dataBytes.byteLength) await appendFile(this.framesDataPath, dataBytes);
                if (analyticsBytes.byteLength) await appendFile(this.analyticsPath, analyticsBytes);
            } catch (error) {
                this.logger.error('Could not write to debug store', String(error));
            }

            if (!this.ended) {
                //when we ended, broker connection already closed. So we just write to disk.
                try {
                    if (frameBytes.byteLength && this.frameChannel) await this.frameChannel.publish(frameBytes);
                    if (dataBytes.byteLength && this.frameDataChannel) await this.frameDataChannel.publish(dataBytes);
                    this.publishFailed = false;
                } catch (error) {
                    // Frames are on disk already; the broker only streams them live to the debugger.
                    if (!this.publishFailed) {
                        this.logger.warn('Could not send debug frames to the broker, the debugger shows no live updates', formatError(error));
                        this.publishFailed = true;
                    }
                }
            }
        } finally {
            this.lastSync = undefined;
            this.syncMutex.unlock();
        }

        const more = this.dataQueue.length || this.frameQueue.length || this.analytics.length;
        if (more) this.sync();
    }
}
