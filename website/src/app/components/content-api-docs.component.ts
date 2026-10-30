import { ChangeDetectionStrategy, Component, computed, forwardRef, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HighlightCodeComponent } from '@app/app/components/highlight-code.component.js';
import { MarkdownParser } from '@app/common/markdown.js';
import { derivedAsync } from 'ngxtension/derived-async';

import { pendingTask } from '@deepkit/desktop-ui';

import type { ApiType } from '../../../api-docs';
import { ContentRenderComponent } from './content-render.component';

const docs = require('../../../api-docs.json');
const markdownParser = new MarkdownParser();

@Component({
    selector: 'app-content-api-package-summary',
    template: `
        <ul>
            @for (type of types(); track $index) {
                <li>
                    <a [routerLink]="[]" [fragment]="type.name">{{ type.name }}</a>
                </li>
            }
        </ul>
    `,
    imports: [RouterLink],
    changeDetection: ChangeDetectionStrategy.Eager,
    styles: `
        li {
            white-space: nowrap;
        }
    `,
})
export class ApiContentApiPackageDocs {
    types = input.required<ApiType[]>();
}

@Component({
    selector: 'app-content-api-type',
    template: `
        @let type = this.type();
        <a name="{{ type.name }}"></a>
        <div class="header">
            <span class="name">{{ type.name }}</span>
            <span class="link">
                [<a
                    href="https://github.com/deepkit/deepkit-framework/tree/master/{{ type.source.file }}#L{{
                        type.source.line
                    }}"
                    target="_blank"
                    rel="noopener noreferrer"
                    >source</a
                >]
            </span>
        </div>
        <highlight-code class="main" [code]="type.type" lang="typescript" />

        @if (comment(); as content) {
            <app-render-content [content]="content.body" />
        }
    `,
    imports: [HighlightCodeComponent, forwardRef(() => ContentRenderComponent)],
    changeDetection: ChangeDetectionStrategy.Eager,
    styles: `
        :host {
            display: flex;
            flex-direction: column;
            gap: 6px;
            margin-bottom: 12px;
        }

        .main ::ng-deep pre {
            padding: 0 !important;
            background: transparent !important;
            box-shadow: unset !important;
        }

        .header {
            display: flex;
            align-items: center;
            gap: 4px;

            .name {
                font-weight: bold;
            }

            .link {
                font-size: 0.9em;
                color: var(--color-grey);
            }
        }
    `,
})
export class ApiContentApiType {
    type = input.required<ApiType>();

    comment = derivedAsync(
        pendingTask(async () => {
            const description = this.type().description;
            if (!description) return undefined;
            return markdownParser.loadAndParse(description);
        }),
    );
}

@Component({
    selector: 'app-content-api-docs',
    template: `
        <div class="summary">
            @for (group of groups(); track $index) {
                <div class="box">
                    <div class="title">{{ kindLabels[group.kind] }}{{ group.group ? ' - ' + group.group : '' }}</div>
                    <app-content-api-package-summary [types]="group.types" />
                </div>
            }
        </div>

        @if (classes().length) {
            <h2 id="classes">Classes</h2>

            @for (type of classes(); track $index) {
                <app-content-api-type [type]="type" />
            }
        }

        @if (events().length) {
            <h2 id="events">Events</h2>
            @for (type of events(); track $index) {
                <app-content-api-type [type]="type" />
            }
        }

        @if (errors().length) {
            <h2 id="errors">Errors</h2>
            @for (type of errors(); track $index) {
                <app-content-api-type [type]="type" />
            }
        }

        @if (variables().length) {
            <h2 id="const">Const</h2>
            @for (type of variables(); track $index) {
                <app-content-api-type [type]="type" />
            }
        }

        @if (functions().length) {
            <h2 id="functions">Functions</h2>
            @for (type of functions(); track $index) {
                <app-content-api-type [type]="type" />
            }
        }

        @if (types().length) {
            <h2 id="types">Types</h2>
            @for (type of types(); track $index) {
                <app-content-api-type [type]="type" />
            }
        }
    `,
    imports: [ApiContentApiPackageDocs, ApiContentApiType],
    changeDetection: ChangeDetectionStrategy.Eager,
    styles: `
        :host {
            display: block;
        }

        .summary {
            column-count: 2;
            column-gap: 1rem;
        }

        .box {
            break-inside: avoid;
            margin-bottom: 1rem;

            .title {
                font-weight: bold;
            }
        }

        app-content-api-type {
            border-bottom: 1px solid rgba(135, 135, 135, 0.1);
        }
    `,
})
export class ContentApiDocsComponent {
    kindLabels: { [key: string]: string } = {
        class: 'Classes',
        function: 'Functions',
        type: 'Types',
        variable: 'Const',
        event: 'Events',
        error: 'Errors',
    };

    package = input.required<string>();

    api = computed<ApiType[]>(() => docs[this.package()] || []);

    classes = computed(() => this.api().filter(api => api.kind === 'class'));
    functions = computed(() => this.api().filter(api => api.kind === 'function'));
    types = computed(() => this.api().filter(api => api.kind === 'type'));
    variables = computed(() => this.api().filter(api => api.kind === 'variable'));
    events = computed(() => this.api().filter(api => api.kind === 'event'));
    errors = computed(() => this.api().filter(api => api.kind === 'error'));

    groups = computed(() => {
        // We group per kind + optionally, group, so that kind=classes with empty group comes first, then kind=classes with group=x
        // We want a map of kind+group: ApiType[]
        const result: { [key: string]: { types: ApiType[]; kind: string; group: string } } = {};
        for (const type of this.api()) {
            const key = `${type.kind}+${type.group || ''}`;
            if (!result[key]) {
                result[key] = { types: [], kind: type.kind, group: type.group || '' };
            }
            result[key].types.push(type);
        }

        // sort types in each by name
        for (const key in result) {
            result[key].types.sort((a, b) => a.name.localeCompare(b.name));
        }

        const kindSort: { [key: string]: number } = {
            event: -10,
            error: -5,
            class: 0,
            function: 1,
            type: 2,
            variable: 3,
        };

        // Sort groups by kind, then group name
        return Object.values(result).sort((a, b) => {
            if (a.kind !== b.kind) {
                return kindSort[a.kind] - kindSort[b.kind];
            }
            return a.group.localeCompare(b.group);
        });
    });
}
