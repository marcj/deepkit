// A server or load process of a library, started by harness.ts.
// Usage: load-process.ts <file of the target> <server|load> <config as JSON>
import { PerformanceObserver } from 'perf_hooks';
import { pathToFileURL } from 'url';

import { LatencyHistogram, LoadCalls, LoadReport, LoadTarget, ProcessStats } from './harness.js';

const [targetFile, role, configJson] = process.argv.slice(2);
const options = JSON.parse(configJson);
const { target } = (await import(pathToFileURL(targetFile).href)) as { target: LoadTarget };

const send = (message: object): void => void process.send!(message);

// ---- statistics of this process -----

let gcMs = 0;
const observer = new PerformanceObserver(list => {
    for (const entry of list.getEntries()) gcMs += entry.duration;
});
observer.observe({ entryTypes: ['gc'] });

let measureStart = 0;
let cpuStart = process.cpuUsage();

function startMeasuring(): void {
    observer.takeRecords();
    gcMs = 0;
    measureStart = performance.now();
    cpuStart = process.cpuUsage();
}

function stats(): ProcessStats & { seconds: number } {
    const seconds = (performance.now() - measureStart) / 1000;
    const cpu = process.cpuUsage(cpuStart);
    for (const entry of observer.takeRecords()) gcMs += entry.duration;
    return {
        seconds,
        cpuPercent: ((cpu.user + cpu.system) / 1e6 / seconds) * 100,
        gcMs,
        gcPercent: (gcMs / 1000 / seconds) * 100,
        rssMb: process.resourceUsage().maxRSS / 1024,
    };
}

function onMessage(type: string, handler: (message: any) => void | Promise<void>): void {
    process.on('message', (message: any) => {
        if (message.type !== type) return;
        Promise.resolve()
            .then(() => handler(message))
            .catch(error =>
                send({ type: 'failed', error: error instanceof Error ? error.stack || error.message : String(error) }),
            );
    });
}

async function server(): Promise<void> {
    if (!target.serve) throw new Error('This target has no server');
    await target.serve(options);
    onMessage('measure', startMeasuring);
    onMessage('report', () => send({ type: 'report', ...stats() }));
    send({ type: 'ready' });
}

function load(): void {
    const { config, processIndex } = options;
    const clients: LoadCalls[] = [];

    let run = 0;
    let histogram = new LatencyHistogram();
    let ops = 0;
    let errors = 0;
    let firstError: string | undefined;
    let sliceOps = 0;
    let lastMark = 0;
    let slices: number[] = [];
    let callers: Promise<void>[] = [];

    function mark(): void {
        const now = performance.now();
        slices.push(((ops - sliceOps) / (now - lastMark)) * 1000);
        sliceOps = ops;
        lastMark = now;
    }

    let lastYield = performance.now();

    async function caller(id: number, call: (i: number) => Promise<unknown>, offset: number): Promise<void> {
        let i = offset;
        while (run === id) {
            const start = performance.now();
            try {
                await call(i++);
            } catch (error) {
                if (run !== id) return;
                errors++;
                firstError ??= error instanceof Error ? error.message : String(error);
                await new Promise(resolve => setTimeout(resolve, 1));
                continue;
            }
            const end = performance.now();
            if (run !== id) return;
            histogram.record(end - start);
            ops++;
            // Synchronous drivers never reach the event loop without this, and the messages of the harness wouldn't arrive
            if (end - lastYield > 5) {
                lastYield = end;
                await new Promise(resolve => setImmediate(resolve));
            }
        }
    }

    // clients are only added: the higher level reuses those of the lower one and connects the rest
    onMessage('connect', async ({ clients: count }) => {
        while (clients.length < count) clients.push(await target.connect(config));
        send({ type: 'connected' });
    });

    onMessage('start', ({ workload, clients: clientCount, callers: callerCount }) => {
        const id = ++run;
        callers = [];
        histogram = new LatencyHistogram();
        ops = errors = 0;
        for (let clientIndex = 0; clientIndex < clientCount; clientIndex++) {
            const call = clients[clientIndex][workload];
            if (!call) throw new Error(`Workload ${workload} is not defined`);
            for (let c = 0; c < callerCount; c++)
                callers.push(caller(id, call, processIndex * 1_000_000 + clientIndex * 7919 + c * 104_729));
        }
    });

    onMessage('measure', () => {
        histogram = new LatencyHistogram();
        ops = sliceOps = errors = 0;
        firstError = undefined;
        slices = [];
        lastMark = performance.now();
        startMeasuring();
    });

    onMessage('mark', mark);

    onMessage('report', () => {
        mark();
        const { seconds, ...processStats } = stats();
        const report: LoadReport = { ops, seconds, errors, firstError, histogram, slices, stats: processStats };
        send({ type: 'report', ...report });
    });

    onMessage('stop', async () => {
        run = 0;
        // a call that never returns must not block the next workload
        await Promise.race([Promise.allSettled(callers), new Promise(resolve => setTimeout(resolve, 5000))]);
        send({ type: 'stopped' });
    });

    send({ type: 'ready' });
}

try {
    if (role === 'server') await server();
    else load();
} catch (error) {
    send({ type: 'failed', error: error instanceof Error ? error.stack || error.message : String(error) });
    setTimeout(() => process.exit(1), 100);
}
