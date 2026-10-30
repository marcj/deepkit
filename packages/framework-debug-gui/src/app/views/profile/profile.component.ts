import { DatePipe, DecimalPipe, JsonPipe } from '@angular/common';
import {
    AfterViewInit,
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    ElementRef,
    HostListener,
    OnDestroy,
    OnInit,
    ViewChild,
} from '@angular/core';
import { Application, Container, Graphics, InteractionEvent, Rectangle, Text, TextStyle } from 'pixi.js';
import { Subject } from 'rxjs';

import {
    ButtonComponent,
    ButtonGroupComponent,
    DragDirective,
    DuiDragEvent,
    WindowToolbarComponent,
} from '@deepkit/desktop-ui';
import { decodeFrameData, decodeFrames } from '@deepkit/framework-debug-api';
import { ClientProgress } from '@deepkit/rpc';
import { FrameCategory, FrameEnd, FrameStart } from '@deepkit/stopwatch';

import { ControllerClient } from '../../client';
import { ChangeFeed, Crunch, FrameItem, FrameParser, ViewState, formatTime, getFrameX } from './frame';
import { CrunchContainer, FrameContainer } from './frame-container';

interface FrameData {
    cid: number;
    data: Uint8Array;
}

class ProfilerContainer extends Container {
    protected headerLines = new Graphics();
    protected selectedLines = new Graphics();
    protected headerText = new Container();
    protected frameContainer = new Container();
    // protected crunchContainer = new Container();
    // protected offsetText: Text;
    protected textStyle = { fontSize: 12, fill: 0xdddddd } as TextStyle;

    protected hoverMenu?: Container;

    public selected?: FrameItem;

    public ignoreNextClick: boolean = false;
    protected inactiveAlpha = 0.6;

    protected parserSub = this.parser.subscribe(this.onUpdate.bind(this), this.viewState);

    constructor(
        public parser: FrameParser,
        public viewState: ViewState,
        public onSelect: (frame?: FrameItem) => void,
    ) {
        super();
        this.addChild(this.headerLines);
        this.addChild(this.headerText);
        // this.addChild(this.crunchContainer);
        this.addChild(this.frameContainer);
        this.addChild(this.selectedLines);
        // this.offsetText = new Text('0', this.textStyle);
        // this.addChild(this.offsetText);
        // this.offsetText.x = 0;
        // this.offsetText.y = 13;

        this.hitArea = new Rectangle(0, 0, this.viewState.width, this.viewState.height);

        this.interactive = true;
        this.on('click', () => {
            if (this.ignoreNextClick) {
                this.ignoreNextClick = false;
                return;
            }
            this.setSelected(undefined);
        });

        this.frameContainer.y = 15;
        // this.crunchContainer.y = 15;
    }

    onUpdate(frames: ChangeFeed<FrameItem>, crunches: ChangeFeed<Crunch>) {
        // console.log('create', create, remove);

        for (const item of crunches.remove || []) {
            if (!item.container) continue;
            this.frameContainer.removeChild(item.container);
            item.container = undefined;
        }

        for (const item of frames.remove || []) {
            if (!item.container) continue;
            this.frameContainer.removeChild(item.container);
            item.container = undefined;
        }

        for (const item of crunches.create || []) {
            const container = (item.container = new CrunchContainer(item, this.viewState));
            this.frameContainer.addChild(container);
        }

        const add: Container[] = [];
        for (const item of frames.create || []) {
            const container = (item.container = new FrameContainer(item, 0, this.viewState));

            container.rectangle.interactive = true;

            container.rectangle.addListener('click', event => {
                if (this.ignoreNextClick) {
                    //the bg click resets it
                    return;
                }
                event.stopPropagation();
                this.setSelected(item);
            });

            container.rectangle.addListener('mouseover', event => {
                this.onHover(container, event);
            });

            container.rectangle.addListener('mousemove', event => {
                this.onHoverMove(container, event);
            });

            container.rectangle.addListener('mouseout', event => {
                this.onHoverOut(container, event);
            });

            if (this.selected) {
                container.rectangle.alpha =
                    container.item.frame.cid === this.selected.frame.cid ? 1 : this.inactiveAlpha;
                container.text.alpha = container.item.frame.cid === this.selected.frame.cid ? 1 : this.inactiveAlpha;
            }

            add.push(container);

            // this.containers.push(container);
            // console.log('children[0].item.x > item.x', children[0] ? children[0].item.frame.label : '', children[0] ? children[0].item.x : '', item.x, item.frame.label);
            // if (children.length) {
            //     if (children[0].item.x > item.x) {
            //         this.frameContainer.addChildAt(container, 0);
            //     // } else if (children[children.length-1].item.x < item.x) {
            //     } else {
            //         this.frameContainer.addChild(container);
            //     }
            // } else {
            //     this.frameContainer.addChild(container);
            // }
        }

        // console.log(children.map(v => v.item.frame.label));
        if (add.length) {
            this.frameContainer.addChild(...add);
            this.containers.sort((a, b) => {
                return a.item.x - b.item.x;
            });
        }
        // this.updateTransform();
    }

    xToViewX(x: number): number {
        return (x - this.viewState.scrollX) / this.viewState.zoom;
    }

    // protected setWindow() {
    //     // const padding = (this.viewState.width * 0.05) * this.viewState.zoom;
    //     const padding = 1;
    //     const start = (this.viewState.scrollX) - padding;
    //     const end = start + ((this.viewState.width) * this.viewState.zoom) + padding;
    //     this.parserSub.setWindow({ start, end });
    //     // console.log('setWindow', start, end, this.viewState);
    // }

    viewChanged() {
        this.parserSub.checkWindow();
        this.update();
    }

    addFrames(frames: (FrameStart | FrameEnd)[]) {
        this.parserSub.checkWindow();

        this.parser.feed(frames);
    }

    get containers(): (FrameContainer | CrunchContainer)[] {
        return this.frameContainer.children as (FrameContainer | CrunchContainer)[];
    }

    setSelected(frame?: FrameItem) {
        if (this.selected && this.selected === frame) {
            this.selected = undefined;
        } else {
            this.selected = frame;
        }

        for (const container of this.containers) {
            if (!(container instanceof FrameContainer)) continue;

            if (this.selected) {
                container.rectangle.alpha =
                    container.item.frame.cid === this.selected.frame.cid ? 1 : this.inactiveAlpha;
                container.text.alpha = container.item.frame.cid === this.selected.frame.cid ? 1 : this.inactiveAlpha;
            } else {
                container.rectangle.alpha = 1;
                container.text.alpha = 1;
            }
        }
        this.renderSelectedLines();
        this.onSelect(this.selected);
    }

    protected onHover(container: FrameContainer, event: InteractionEvent) {
        if (this.hoverMenu) return;

        this.hoverMenu = new Container();
        const prefix = container.item.frame.category ? '[' + FrameCategory[container.item.frame.category] + '] ' : '';
        const message = new Text(
            prefix + container.item.frame.label + ' (' + formatTime(container.item.took, 3) + ')',
            this.textStyle,
        );
        this.hoverMenu.addChild(message);

        this.hoverMenu.x = event.data.global.x;
        this.hoverMenu.y = event.data.global.y + 20;
        this.addChild(this.hoverMenu);
    }

    protected onHoverMove(container: FrameContainer, event: InteractionEvent) {
        if (!this.hoverMenu) return;
        this.hoverMenu.x = event.data.global.x;
        this.hoverMenu.y = event.data.global.y + 20;
    }

    protected onHoverOut(container: FrameContainer, event: InteractionEvent) {
        if (!this.hoverMenu) return;
        this.removeChild(this.hoverMenu);
        this.hoverMenu = undefined;
    }

    forward() {
        const scrollX = this.selected ? this.selected.x : this.viewState.scrollX;
        for (const frame of this.frameContainer.children as FrameContainer[]) {
            if (frame.item.x > scrollX) {
                // this.viewState.scrollX = frame.frame.x;
                this.setSelected(frame.item);
                this.update();
                return;
            }
        }
    }

    update() {
        for (const layer of this.containers) {
            layer.update();
        }
        // for (const layer of this.crunchContainer.children as CrunchContainer[]) {
        //     layer.update();
        // }
        // this.renderHeaderLines();
        this.renderSelectedLines();
        // this.crunchContainer.x = -this.viewState.scrollX / this.viewState.zoom;
        this.hitArea = new Rectangle(0, 0, this.viewState.width, this.viewState.height);
    }

    protected renderSelectedLines() {
        this.selectedLines.clear();
        if (this.selected) {
            this.selectedLines.beginFill(0xeeeeee, 0.5);
            // this.selectedLines.lineStyle(1, 0x73AB77);
            this.selectedLines.drawRect(this.xToViewX(this.selected.x), 0, 1, this.viewState.height);
            if (this.selected.took) {
                this.selectedLines.drawRect(
                    this.xToViewX(this.selected.x + (this.selected.took - this.selected.crunch)),
                    0,
                    1,
                    this.height,
                );
            }
        }
        this.selectedLines.endFill();
    }

    protected renderHeaderLines() {
        let padding = 10 / this.viewState.zoom;
        while (padding < 5) padding += 10 / this.viewState.zoom;

        const jumpSize = 10 * padding;

        this.headerLines.clear();
        this.headerLines.lineStyle(1, 0xffffff, 0.7);

        for (const text of this.headerText.children) {
            text.visible = false;
        }

        const offsetTime = this.viewState.scrollX;
        // this.offsetText.text = (offsetTime > 0 ? '+' : '') + formatTime(offsetTime);

        const maxLines = (this.viewState.width + jumpSize) / padding;

        for (let i = 0; i < maxLines; i++) {
            const x = i * padding;
            this.headerLines.moveTo(x, 0);
            this.headerLines.lineStyle(i % 10 === 0 ? 2 : 1, 0xffffff, 0.7);
            this.headerLines.lineTo(x, i % 10 === 0 ? 12 : i % 5 === 0 ? 7 : 5);

            if (i % 10 === 0 && x > 0) {
                let text = this.headerText.children[i] as Text;
                if (!this.headerText.children[i]) {
                    text = new Text(formatTime(x * this.viewState.zoom), { fontSize: 12, fill: 0xdddddd } as TextStyle);
                    this.headerText.addChild(text);
                }
                text.x = x;
                text.y = 13;
                text.visible = true;
                text.text = formatTime(x * this.viewState.zoom);
            }
        }
    }
}

@Component({
    template: `
        <dui-window-toolbar for="main">
            <dui-button-group>
                <!--                <dui-button textured icon="arrow_right" (click)="forward()"></dui-button>-->
                <dui-button textured icon="garbage" (click)="resetProfilerFrames()"></dui-button>
            </dui-button-group>

            <div>{{ profiler.parser.frames }} frames, {{ profiler.parser.rootItems.length }} contexts</div>
        </dui-window-toolbar>

        <!--        <div class="top-frames">-->

        <!--        </div>-->

        <div class="canvas" (duiDrag)="onDrag($event)" (duiDragStart)="onDragStart($event)" #canvas></div>

        <!--        <profile-timeline [parser]="parser" [selected]="selectedFrameChildrenStats.contextStart" (selectItem)="timelineSelect($event)"></profile-timeline>-->

        @if (selectedFrame) {
            <div class="inspector text-selection">
                <h3>{{ selectedFrame.frame.label }}</h3>
                <div style="margin-bottom: 10px;">
                    <label>Type</label>
                    {{ FrameCategory[selectedFrame.frame.category] }}
                </div>
                <div style="margin-bottom: 10px;">
                    <label>debug</label>
                    x: {{ selectedFrame.x }} ({{ getFrameX(selectedFrame, viewState) }}, end:
                    {{ getFrameX(selectedFrame, viewState) + selectedFrame.took }}) y: {{ selectedFrame.y }} crunches:
                    {{ selectedFrame.context.allCrunches }}
                </div>
                <div style="margin-bottom: 10px;">
                    <label>took</label>
                    {{ selectedFrame.took }} ({{ selectedFrame.x + selectedFrame.took }})
                </div>
                @if (selectedFrameChildrenStats.contextStart) {
                    <div>
                        <label>Context</label>
                        {{ FrameCategory[selectedFrameChildrenStats.contextStart.frame.category] }} (#{{
                            selectedFrameChildrenStats.contextStart.frame.context
                        }})
                        {{ selectedFrameChildrenStats.contextStart.frame.label }}
                    </div>
                    <div>
                        <label>Time from start of context</label>
                        {{ formatTime(selectedFrame.x - selectedFrameChildrenStats.contextStart.x, 3) }}
                    </div>
                }
                <div>
                    <label style="width: 70px;">Started</label>
                    <ng-container>
                        {{ selectedFrame.frame.timestamp / 1000 | date: 'HH:mm:ss.SSS' }}
                    </ng-container>
                </div>
                <div>
                    <label style="width: 70px;">Ended</label>
                    @if (selectedFrame.took) {
                        {{ (selectedFrame.frame.timestamp + selectedFrame.took) / 1000 | date: 'HH:mm:ss.SSS' }}
                    }
                    @if (!selectedFrame.took) {
                        Pending
                    }
                </div>
                <div>
                    <label style="width: 70px;">Total time</label>
                    @if (selectedFrame.took) {
                        {{ formatTime(selectedFrame.took, 3) }}
                    }
                    @if (!selectedFrame.took) {
                        Pending
                    }
                </div>
                @if (selectedFrame.frame.category === FrameCategory.http) {
                    <div>
                        <label>Method</label>
                        {{ selectedFrameData.method }}
                    </div>
                    <div>
                        <label>Client IP</label>
                        {{ selectedFrameData.clientIp }}
                    </div>
                    <div>
                        <label>Response Status</label>
                        {{ selectedFrameData.responseStatus || 'pending' }}
                    </div>
                }
                @if (selectedFrame.frame.category === FrameCategory.database) {
                    <div>
                        <label>Entity</label>
                        {{ selectedFrameData.className }}
                    </div>
                    <div style="padding: 10px 0;">
                        <label class="header">SQL</label>
                        @for (item of selectedFrameChildren; track item) {
                            @if (item.data && item.frame.category === FrameCategory.databaseQuery) {
                                <div>
                                    {{ item.data.sql }}<br />
                                    {{ item.data.sqlParams | json }}
                                </div>
                            }
                        }
                    </div>
                }
                @if (selectedFrame.frame.category === FrameCategory.databaseQuery) {
                    <div style="padding: 10px 0;">
                        <label class="header">SQL</label>
                        {{ selectedFrameData.sql }}<br />
                        {{ selectedFrameData.sqlParams | json }}
                    </div>
                }
                @if (selectedFrameChildren.length) {
                    <h4 style="margin-top: 10px;">Child frames ({{ selectedFrameChildren.length }})</h4>
                    <div class="child">
                        <label>Self time</label>
                        <div class="bar">
                            <div
                                class="bg"
                                [style.width.%]="
                                    ((selectedFrame.took - selectedFrameChildrenStats.totalTime) / selectedFrame.took) *
                                    100
                                "
                            ></div>
                            <div class="text">
                                {{ formatTime(selectedFrame.took - selectedFrameChildrenStats.totalTime, 3) }}
                                ({{
                                    ((selectedFrame.took - selectedFrameChildrenStats.totalTime) / selectedFrame.took) *
                                        100 | number: '2.2-2'
                                }}%)
                            </div>
                        </div>
                    </div>
                    @for (item of selectedFrameChildren; track item) {
                        <div class="child">
                            <label>{{ item.frame.label }}</label>
                            <div class="bar">
                                <div class="bg" [style.width.%]="(item.took / selectedFrame.took) * 100"></div>
                                <div class="text">
                                    {{ formatTime(item.took, 3) }}
                                    ({{ (item.took / selectedFrame.took) * 100 | number: '2.2-2' }}%)
                                </div>
                            </div>
                        </div>
                    }
                }
                <!--            <div>-->
                <!--                {{selectedFrameData|json}}-->
                <!--            </div>-->
            </div>
        }
    `,
    styleUrls: ['./profile.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [
        DatePipe,
        JsonPipe,
        DecimalPipe,
        WindowToolbarComponent,
        ButtonGroupComponent,
        ButtonComponent,
        DragDirective,
    ],
})
export class ProfileComponent implements OnInit, OnDestroy, AfterViewInit {
    getFrameX = getFrameX;
    FrameCategory = FrameCategory;
    formatTime = formatTime;

    protected app = new Application({
        width: 500,
        height: 500,
        antialias: true,
        autoDensity: true,
        transparent: true,
        resolution: window.devicePixelRatio,
    });

    protected frameData: FrameData[] = [];

    public selectedFrame?: FrameItem;
    public selectedFrameChildrenStats: { totalTime: number; contextStart?: FrameItem } = { totalTime: 0 };
    public selectedFrameChildren: FrameItem[] = [];
    public selectedFrameData: { [name: string]: any } = {};

    protected viewState = new ViewState();

    public parser = new FrameParser();

    public profiler: ProfilerContainer = new ProfilerContainer(this.parser, this.viewState, this.onSelect.bind(this));

    public frameSub?: Subject<Uint8Array>;
    public frameDataSub?: Subject<Uint8Array>;

    @ViewChild('canvas', { read: ElementRef }) canvas?: ElementRef;

    constructor(
        protected client: ControllerClient,
        protected cd: ChangeDetectorRef,
    ) {}

    timelineSelect(item: FrameItem) {
        this.viewState.scrollX = item.x - (this.viewState.width * this.viewState.zoom) / 3;

        this.profiler.viewChanged();
        this.profiler.setSelected(item);
        this.profiler.update();
    }

    onSelect(item?: FrameItem) {
        this.selectedFrame = item;
        this.selectedFrameData = {};

        if (item) {
            for (const data of this.frameData) {
                if (data.cid === item.frame.cid) {
                    Object.assign(this.selectedFrameData, data.data);
                }
            }
            this.selectedFrameChildren = [];

            const map: { [id: number]: FrameItem } = {};
            const end = item.x + item.took;

            this.selectedFrameChildrenStats.totalTime = 0;
            this.selectedFrameChildrenStats.contextStart = undefined;

            let contextStartFound: boolean = false;
            const targetY = item.y + 1;

            for (const child of this.profiler.parser.items) {
                if (!child) continue;

                if (!contextStartFound && child.frame.context === item.frame.context) {
                    contextStartFound = true;
                    this.selectedFrameChildrenStats.contextStart = child;
                }

                if (
                    child.frame.context === item.frame.context &&
                    child.x > item.x &&
                    child.x < end &&
                    child.y === targetY
                ) {
                    this.selectedFrameChildrenStats.totalTime += child.took;
                    this.selectedFrameChildren.push(child);

                    for (const data of this.frameData) {
                        if (data.cid === child.frame.cid) {
                            if (!child.data) child.data = {};
                            Object.assign(child.data, data.data);
                        }
                    }
                }
            }
        }
        // console.log('selectedFrameChildren', this.selectedFrameChildren);
        this.cd.detectChanges();
    }

    ngOnDestroy() {
        this.app.destroy(true);
        if (this.frameSub) this.frameSub.unsubscribe();
        if (this.frameDataSub) this.frameDataSub.unsubscribe();
    }

    forward() {
        //todo: use this.topLevelFrames
        // console.log('this.viewState', this.viewState);
        for (const frame of this.profiler.parser.rootItems) {
            if (this.selectedFrame && frame.x <= this.selectedFrame.x) continue;
            if (frame.x > this.viewState.scrollX) {
                this.viewState.scrollX = frame.x;
                this.profiler.viewChanged();
                this.profiler.setSelected(frame);
                this.profiler.update();
                return;
            }
        }
        // this.profiler.forward();
    }

    @HostListener('window:resize')
    onResize() {
        if (!this.canvas) return;

        this.app.renderer.resize(this.canvas.nativeElement.clientWidth, this.canvas.nativeElement.clientHeight);
        this.viewState.width = this.canvas.nativeElement.clientWidth;
        this.viewState.height = this.canvas.nativeElement.clientHeight;
        this.profiler.update();
    }

    async ngAfterViewInit() {
        this.createCanvas();
        await this.loadFrames();
        this.cd.detectChanges();
    }

    async ngOnInit() {}

    async resetProfilerFrames() {
        this.parser.reset();
        this.frameData = [];
        await this.client.debug.resetProfilerFrames();
    }

    protected async loadFrames() {
        console.time('download');

        const trackFrames = ClientProgress.track();
        const [framesBuffer, dataBuffer, analyticsBuffer] = await this.client.debug.getProfilerFrames();

        console.timeEnd('download');

        console.time('parse');
        const frames: (FrameStart | FrameEnd)[] = [];
        decodeFrames(framesBuffer, frame => frames.push(frame));
        this.frameData = [];
        decodeFrameData(dataBuffer, data => this.frameData.push(data));
        console.timeEnd('parse');

        // console.log('this.frames', frames);
        // console.log('this.frameData', this.frameData);

        console.time('addFrames');
        this.profiler.addFrames(frames);
        console.timeEnd('addFrames');
        this.profiler.update();

        // const lastRoot = this.profiler.parser.rootItems[this.profiler.parser.rootItems.length - 1];
        // if (lastRoot) {
        //     this.timelineSelect(lastRoot);
        // }

        const frameSub = (this.frameSub = await this.client.debug.subscribeStopwatchFrames());
        frameSub.subscribe(next => {
            decodeFrames(next, frame => this.profiler.addFrames([frame]));
            this.profiler.update();
        });

        const frameDataSub = (this.frameDataSub = await this.client.debug.subscribeStopwatchFramesData());
        frameDataSub.subscribe(next => {
            const item = this.selectedFrame;
            decodeFrameData(next, data => {
                this.frameData.push(data);
                if (item && data.cid === item.frame.cid) {
                    Object.assign(this.selectedFrameData, data.data);
                }
            });
            this.cd.detectChanges();
        });
    }

    protected offsetXStart = 0;
    protected onDragStart(event: DuiDragEvent) {
        this.offsetXStart = this.viewState.scrollX;
    }

    protected onDrag(event: DuiDragEvent) {
        this.viewState.scrollX = this.offsetXStart - event.deltaX * this.viewState.zoom;
        this.profiler.viewChanged();
    }

    protected createCanvas() {
        // The application will create a canvas element for you that you
        // can then insert into the DOM.
        if (!this.canvas) return;

        this.canvas.nativeElement.appendChild(this.app.view);
        this.app.renderer.view.style.position = 'absolute';
        this.app.renderer.view.style.display = 'block';
        this.app.renderer.view.style.width = '100%';
        this.app.renderer.view.style.height = '100%';
        this.app.renderer.resize(this.canvas.nativeElement.clientWidth, this.canvas.nativeElement.clientHeight);

        this.viewState.width = this.canvas.nativeElement.clientWidth;
        this.viewState.height = this.canvas.nativeElement.clientHeight;

        this.app.stage.addChild(this.profiler);

        this.app.renderer.view.addEventListener('wheel', event => {
            const newZoom = Math.min(
                1000000,
                Math.max(0.1, this.viewState.zoom - Math.min((event.deltaY * -1) / 500, 0.3) * this.viewState.zoom),
            );
            const ratio = newZoom / this.viewState.zoom;

            let eventOffsetX = event.clientX - this.app.renderer.view.getBoundingClientRect().x;

            const x = this.viewState.scrollX + eventOffsetX * this.viewState.zoom;
            let foundCrunches = 0;
            for (const item of this.profiler.containers) {
                if (item instanceof FrameContainer) {
                    if (!item.item.context || getFrameX(item.item, this.viewState) > x) break;
                    foundCrunches = Math.max(foundCrunches, item.item.context.allCrunches);
                }
            }

            const crunchOffset = 80 * foundCrunches;
            eventOffsetX -= crunchOffset;

            const move = eventOffsetX * this.viewState.zoom * (ratio - 1);
            this.viewState.scrollX -= move;
            this.viewState.zoom = newZoom;

            event.preventDefault();
            this.profiler.viewChanged();
        });
    }
}
