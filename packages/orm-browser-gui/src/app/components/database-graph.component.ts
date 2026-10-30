/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */
import {
    AfterViewInit,
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    ElementRef,
    Input,
    OnChanges,
    SimpleChanges,
    ViewChild,
} from '@angular/core';
import { graphlib, layout } from 'dagre';
import panzoom from 'panzoom';

import { DatabaseInfo } from '@deepkit/orm-browser-api';
import {
    ReflectionClass,
    ReflectionKind,
    Type,
    TypeProperty,
    TypePropertySignature,
    isAutoIncrementType,
    isBackReferenceType,
    isPrimaryKeyType,
    isReferenceType,
    isSetType,
    resolveClassType,
    stringifyType,
} from '@deepkit/type';

import { BrowserText } from './browser-text';

type EdgeNode = { d: string; class?: string };
type DKNode = {
    entity: ReflectionClass<any>;
    properties: (TypeProperty | TypePropertySignature)[];
    height: number;
    width: number;
    x: number;
    y: number;
};

@Component({
    selector: 'database-graph',
    template: `
        <div
            class="nodes"
            (dblclick)="zoomToFit()"
            #graph
            [style.width.px]="graphWidth"
            [style.height.px]="graphHeight"
        >
            <svg [style.width.px]="graphWidth" [style.height.px]="graphHeight">
                @for (edge of edges; track edge) {
                    <path [attr.d]="edge.d" [class]="edge.class"></path>
                }
            </svg>

            @for (node of nodes; track node) {
                <div
                    [style.left.px]="node.x - node.width / 2"
                    [style.top.px]="node.y - node.height / 2"
                    [style.width.px]="node.width"
                    [style.height.px]="node.height"
                    class="node"
                >
                    @if (node.property) {
                        {{ node.property.name }}
                    }
                    @if (node.entity && node.properties) {
                        <div class="header">
                            {{ node.entity.getClassName() }}
                        </div>
                        @for (property of node.properties; track property) {
                            <div>
                                {{ propertyLabel(property) }}
                            </div>
                        }
                    }
                </div>
            }
        </div>
    `,
    changeDetection: ChangeDetectionStrategy.Eager,
    styleUrls: ['./database-graph.component.scss'],
})
export class DatabaseGraphComponent implements OnChanges, AfterViewInit {
    @Input() database?: DatabaseInfo;

    nodes: any[] = [];
    edges: EdgeNode[] = [];

    svg?: any;
    inner?: any;
    zoom?: any;
    width: number = 1000;
    height: number = 500;

    graphWidth: number = 500;
    graphHeight: number = 500;

    browserText = new BrowserText();

    @ViewChild('graph') graphElement?: ElementRef<HTMLDivElement>;
    graphPanZoom?: ReturnType<typeof panzoom>;

    constructor(
        protected cd: ChangeDetectorRef,
        protected host: ElementRef<HTMLElement>,
    ) {}

    ngOnChanges(changes: SimpleChanges): void {
        if (changes.database) this.loadGraph();
    }

    ngAfterViewInit(): void {
        //   if (!this.cards) return;
        //   this.cards.changes.subscribe((cards) => {
        //     this.loadCards(cards);
        //   });
        //   this.loadCards(this.cards.toArray());
        setTimeout(() => this.loadGraph(), 100);
    }

    // protected loadCards(cards: WorkflowCardComponent[]) {
    //   for (const card of cards) {
    //     this.cardMap[card.name] = card;
    //   }
    //   this.cd.detectChanges();
    // }

    public propertyLabel(property: TypeProperty | TypePropertySignature): string {
        let type = stringifyType(property.type, { showFullDefinition: false });
        if (isPrimaryKeyType(property.type)) {
            type += ' & PrimaryKey';
        }
        if (isAutoIncrementType(property.type)) {
            type += ' & AutoIncrement';
        }
        if (isReferenceType(property.type)) {
            type += ' & Reference';
        }
        if (isBackReferenceType(property.type)) {
            type += ' & BackReference';
        }
        // if (property.isReference) type = 'Reference<' + type + '>';
        // if (property.backReference) type = 'BackReference<' + type + '>';
        // if (isPrim property.isId) type = 'Primary<' + type + '>';
        return String(property.name) + (property.optional ? '?' : '') + ': ' + type;
    }

    protected loadGraph() {
        if (!this.database) return;

        const g = new graphlib.Graph({ directed: true, compound: true, multigraph: false });
        g.setGraph({
            nodesep: 50,
            ranksep: 50,
            rankdir: 'LR',
            align: 'DL',
            // rankdir: 'LR',
            // ranker: 'longest-path'
        });
        g.setDefaultEdgeLabel(() => {
            return { labelpos: 'c', labeloffset: 0 };
        });

        this.nodes = [];
        this.edges = [];

        const propertyHeight = 16;
        const propertyListOffset = 28;

        // for (const node of this.workflow.places) {
        //   g.setNode(node, { label: node, width, height });
        // }

        for (const entity of this.database.getClassSchemas()) {
            const properties = [...entity.getProperties()].map(v => v.property);
            let maxWidth = this.browserText.getDimensions(entity.getClassName()).width + 25;
            for (const property of properties) {
                const w = this.browserText.getDimensions(this.propertyLabel(property)).width + 25;
                if (w > maxWidth) maxWidth = w;
            }

            g.setNode(entity.getName(), {
                entity: entity,
                properties,
                width: maxWidth,
                height: propertyListOffset + entity.getProperties().length * propertyHeight,
            });
        }

        function addEdge(entity: ReflectionClass<any>, rootType: Type, property: Type) {
            if (property.kind === ReflectionKind.array) {
                addEdge(entity, rootType, property.type);
            } else if (isSetType(property) && property.typeArguments) {
                addEdge(entity, rootType, property.typeArguments[0]);
            } else if (property.kind === ReflectionKind.class || property.kind === ReflectionKind.objectLiteral) {
                g.setEdge(entity.getName(), ReflectionClass.from(property).getName());
            }
        }

        for (const entity of this.database.getClassSchemas()) {
            for (const property of entity.getProperties()) {
                addEdge(entity, property.type, property.type);
            }
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

        offsetX = offsetX * -1;
        offsetY = offsetY * -1;

        // now adjust everything
        if (offsetX !== 0 || offsetY !== 0) {
            this.graphWidth += offsetX;
            this.graphHeight += offsetY;

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

        const nodeMap: { [name: string]: DKNode } = {};
        for (const nodeName of g.nodes()) {
            const node = g.node(nodeName);
            if (!node) continue;
            nodeMap[nodeName] = node as any;
            // if (node.width + (node.x - (width / 2)) > this.graphWidth) {
            //   this.graphWidth = node.width + (node.x - (width / 2));
            // }
            // if (node.height + (node.y - (height / 2)) > this.graphHeight) {
            //   this.graphHeight = node.height + (node.y - (height / 2));
            // }
            this.nodes.push(node as any);
        }

        const extractEdges = (
            i: number,
            node: DKNode,
            rootProperty: TypePropertySignature | TypeProperty,
            type: Type,
        ) => {
            if (type.kind === ReflectionKind.array) {
                extractEdges(i, node, rootProperty, type.type);
            } else if (isSetType(type) && type.typeArguments) {
                extractEdges(i, node, rootProperty, type.typeArguments[0]);
            } else if (type.kind === ReflectionKind.class || type.kind === ReflectionKind.objectLiteral) {
                const schema = resolveClassType(type);
                const toNode = nodeMap[schema.getName()];
                if (!toNode) return;

                let from = { x: node.x - Math.floor(node.width / 2), y: node.y - Math.floor(node.height / 2) };
                let to = {
                    x: toNode.x - Math.floor(toNode.width / 2),
                    y: toNode.y - Math.floor(toNode.height / 2) + Math.floor(propertyListOffset / 2),
                };

                if (to.x > from.x) {
                    from.x += node.width;
                } else if (from.x > to.x) {
                    to.x += toNode.width;
                }

                from.y += propertyListOffset + i * propertyHeight + Math.floor(propertyHeight / 2);

                if (from.x > to.x) {
                    const t = from;
                    from = to;
                    to = t;
                }
                const middleX = to.x - Math.floor(Math.abs(to.x - from.x) / 2);

                const edge: EdgeNode = {
                    d: `M ${from.x} ${from.y} C ${middleX} ${from.y} ${middleX} ${to.y} ${to.x} ${to.y}`,
                };
                if (isBackReferenceType(rootProperty.type)) {
                    edge.class = 'back-reference';
                } else if (!isReferenceType(rootProperty.type)) {
                    edge.class = 'embedded';
                }

                this.edges.push(edge);
            }
        };

        for (const nodeName of g.nodes()) {
            const node = nodeMap[nodeName];
            if (!node) continue;
            for (let i = 0; i < node.properties.length; i++) {
                const property = node.properties[i];
                extractEdges(i, node, property, property.type);
            }
        }

        // for (const edge of g.edges()) {
        //   const points = g.edge(edge).points;
        //   const d: string[] = [];
        //   d.push('M ' + (points[0].x + 0.5) + ',' + (points[0].y + 0.5));
        //   if (points[0].y > this.graphHeight) this.graphHeight = points[0].y + 1;

        //   for (let i = 1; i < points.length; i++) {
        //     if (points[i].y > this.graphHeight) this.graphHeight = points[i].y + 1;
        //     d.push('L ' + (points[i].x + 0.5) + ',' + (points[i].y + 0.5));
        //   }
        //   this.edges.push(d.join(' '));
        // }

        this.cd.detectChanges();

        if (this.graphElement) {
            if (!this.graphPanZoom) {
                this.graphPanZoom = panzoom(this.graphElement.nativeElement, {
                    bounds: true,
                    zoomSpeed: 0.065,
                    zoomDoubleClickSpeed: 1,
                });
                this.zoomToFit(true);
            } else if (true) {
                this.zoomToFit(true);
            }
        }

        this.cd.detectChanges();
    }

    zoomToFit(force: boolean = false) {
        this._zoomToFit();
        requestAnimationFrame(() => this._zoomToFit(force));
    }

    _zoomToFit(force: boolean = false) {
        try {
            if (this.graphElement && this.graphPanZoom) {
                const svg = this.graphElement.nativeElement;

                const rectParent = this.host.nativeElement.getBoundingClientRect();
                const rectScene = svg.getBoundingClientRect();

                const xys = this.graphPanZoom.getTransform();
                const originWidth = rectScene.width / xys.scale;
                const originHeight = rectScene.height / xys.scale;
                const zoomX = (rectParent.width - 20) / originWidth;
                const zoomY = (rectParent.height - 20) / originHeight;

                let targetScale = zoomX < zoomY ? zoomX : zoomY;

                if (!force) {
                    if (xys.scale > 1.001) {
                        //zoom back to 100% first before to bigpicture
                        this.graphPanZoom.smoothZoomAbs(rectParent.width / 2, rectParent.height / 2, 1);
                        return;
                    } else if (Math.abs(targetScale - xys.scale) < 0.005) {
                        //when target scale is the same as currently, we reset back to 100%, so it acts as toggle.
                        //reset to 100%
                        targetScale = 1;
                    }
                }

                targetScale = Math.min(1, targetScale);

                const targetWidth = originWidth * xys.scale;
                const targetHeight = originHeight * xys.scale;
                const newX =
                    targetWidth > rectParent.width
                        ? -(targetWidth / 2) + rectParent.width / 2
                        : rectParent.width / 2 - targetWidth / 2;
                const newY =
                    targetHeight > rectParent.height
                        ? -(targetHeight / 2) + rectParent.height / 2
                        : rectParent.height / 2 - targetHeight / 2;

                //we need to cancel current running animations
                this.graphPanZoom.pause();
                this.graphPanZoom.resume();

                this.graphPanZoom.moveBy(Math.floor(newX - xys.x), Math.floor(newY - xys.y), false);

                //correct way to zoom with center of graph as origin when scaled
                this.graphPanZoom.smoothZoomAbs(
                    Math.floor(xys.x + (originWidth * xys.scale) / 2),
                    Math.floor(xys.y + (originHeight * xys.scale) / 2),
                    1,
                );
            }
        } catch (error) {
            console.log('error zooming', error);
        }
    }
}
