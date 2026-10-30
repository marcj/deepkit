/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */
import { NgTemplateOutlet } from '@angular/common';
import {
    AfterViewInit,
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    ContentChildren,
    Input,
    OnChanges,
    QueryList,
    SimpleChanges,
    TemplateRef,
    ViewChild,
} from '@angular/core';
import { Node, graphlib, layout } from 'dagre';

import { BrowserText } from '@deepkit/desktop-ui';
import { Workflow } from '@deepkit/framework-debug-api';

@Component({
    selector: 'app-workflow-card',
    changeDetection: ChangeDetectionStrategy.Eager,
    template: '<ng-template #templateRef><ng-content></ng-content></ng-template>',
})
export class WorkflowCardComponent {
    /**
     * The name of the field of T.
     */
    @Input() name!: string;

    @Input() class!: string;

    @ViewChild('templateRef', { static: false }) template!: TemplateRef<any>;
}

@Component({
    selector: 'app-workflow',
    template: `
        <div class="nodes" [style.width.px]="graphWidth" [style.height.px]="graphHeight">
            <svg [style.width.px]="graphWidth" [style.height.px]="graphHeight">
                @for (edge of edges; track edge) {
                    <path [attr.d]="edge"></path>
                }
            </svg>

            @for (node of nodes; track node) {
                <div
                    [style.left.px]="node.x - node.width / 2"
                    [style.top.px]="node.y - node.height / 2"
                    [style.width.px]="node.width"
                    [style.height.px]="node.height"
                    class="node {{ cardMap[node.label!] ? cardMap[node.label!].class : '' }}"
                >
                    <div class="label">
                        {{ node.label }}
                        @if (cardMap[node.label!]) {
                            <ng-container
                                [ngTemplateOutlet]="cardMap[node.label!].template"
                                [ngTemplateOutletContext]="{ $implicit: node }"
                            ></ng-container>
                        }
                    </div>
                </div>
            }
        </div>
    `,
    styleUrls: ['./workflow.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [NgTemplateOutlet],
})
export class WorkflowComponent implements OnChanges, AfterViewInit {
    @Input() workflow?: Workflow;

    public nodes: Node[] = [];
    public edges: string[] = [];
    public graphWidth = 0;
    public graphHeight = 0;

    public cardMap: { [name: string]: WorkflowCardComponent } = {};

    protected browserText = new BrowserText();

    @ContentChildren(WorkflowCardComponent) cards?: QueryList<WorkflowCardComponent>;

    constructor(protected cd: ChangeDetectorRef) {}

    ngOnChanges(changes: SimpleChanges): void {
        if (changes.workflow) this.loadGraph();
    }

    ngAfterViewInit(): void {
        if (!this.cards) return;
        this.cards.changes.subscribe(cards => {
            this.loadCards(cards);
        });
        this.loadCards(this.cards.toArray());
    }

    protected loadCards(cards: WorkflowCardComponent[]) {
        for (const card of cards) {
            this.cardMap[card.name] = card;
        }
        this.cd.detectChanges();
    }

    protected loadGraph() {
        if (!this.workflow) return;

        const g = new graphlib.Graph({ directed: true, compound: true, multigraph: false });
        g.setGraph({
            nodesep: 10,
            ranksep: 25,
            rankdir: 'LR',
            // ranker: 'longest-path'
        });
        g.setDefaultEdgeLabel(() => {
            return { labelpos: 'c', labeloffset: 0 };
        });

        for (const node of this.workflow.places) {
            const dim = this.browserText.getDimensions(node);
            g.setNode(node, { label: node, width: Math.max(90, dim.width + 30), height: Math.max(40, dim.height) });
        }

        for (const transition of this.workflow.transitions) {
            g.setEdge(transition.from, transition.to);
        }

        try {
            layout(g);
        } catch (error) {
            console.error('Could not calc layout for graph', error);
        }

        // dagre calcs sometimes edges with minus coordinates. We forbid that and
        // offset everything back
        let offsetX = 0;
        let offsetY = 0;
        this.graphWidth = g.graph().width || 0;
        this.graphHeight = g.graph().height || 0;

        for (const edge of g.edges()) {
            const points = g.edge(edge).points;
            if (!points) continue;
            for (const item of points) {
                if (item.x < offsetX) offsetX = item.x;
                if (item.y < offsetY) offsetY = item.y;
            }
        }
        offsetX = offsetX * -1;
        offsetY = offsetY * -1;

        // now adjust everything
        if (offsetX !== 0 || offsetY !== 0) {
            this.graphWidth += offsetX;
            this.graphHeight += offsetY;

            // console.log('node offset', node.id, offsetX, offsetY);
            for (const edge of g.edges()) {
                const points = g.edge(edge).points;
                if (!points) continue;
                for (const item of points) {
                    item.x += offsetX;
                    item.y += offsetY;
                }
            }

            for (const nodeId of g.nodes()) {
                const node = g.node(nodeId);
                node.x += offsetX;
                node.y += offsetY;
            }
        }

        for (const nodeName of g.nodes()) {
            const node = g.node(nodeName);
            // if (node.width + (node.x - (width / 2)) > this.graphWidth) {
            //   this.graphWidth = node.width + (node.x - (width / 2));
            // }
            // if (node.height + (node.y - (height / 2)) > this.graphHeight) {
            //   this.graphHeight = node.height + (node.y - (height / 2));
            // }
            this.nodes.push(node);
        }

        for (const edge of g.edges()) {
            const points = g.edge(edge).points;
            const d: string[] = [];
            d.push('M ' + (points[0].x + 0.5) + ',' + (points[0].y + 0.5));
            if (points[0].y > this.graphHeight) this.graphHeight = points[0].y + 1;

            for (let i = 1; i < points.length; i++) {
                if (points[i].y > this.graphHeight) this.graphHeight = points[i].y + 1;
                d.push('L ' + (points[i].x + 0.5) + ',' + (points[i].y + 0.5));
            }
            this.edges.push(d.join(' '));
        }
    }
}
