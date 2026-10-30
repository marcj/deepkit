import {
    AfterViewInit,
    ChangeDetectionStrategy,
    Component,
    ContentChildren,
    Injectable,
    Input,
    QueryList,
    computed,
    forwardRef,
    inject,
    input,
    signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ContentRenderComponent } from '@app/app/components/content-render.component.js';
import { MarkdownParser } from '@app/common/markdown.js';
import { derivedAsync } from 'ngxtension/derived-async';

import {
    ButtonGroupComponent,
    InputComponent,
    TabButtonComponent,
    TableCellDirective,
    TableColumnDirective,
    TableComponent,
    pendingTask,
} from '@deepkit/desktop-ui';
import { CodeHighlightComponent } from '@deepkit/ui-library';

@Component({
    selector: 'doc-code-frame',
    template: `
        <div>
            <div style="margin-bottom: 10px;">
                <dui-button-group>
                    <dui-tab-button (click)="showPage('')" [active]="show === ''">Preview</dui-tab-button>
                    @if (hasType('html')) {
                        <dui-tab-button (click)="showPage('html')" [active]="show === 'html'">HTML </dui-tab-button>
                    }
                    @if (hasType('typescript')) {
                        <dui-tab-button (click)="showPage('typescript')" [active]="show === 'typescript'"
                            >TS
                        </dui-tab-button>
                    }
                    @if (hasType('scss')) {
                        <dui-tab-button (click)="showPage('scss')" [active]="show === 'scss'">SCSS </dui-tab-button>
                    }
                </dui-button-group>
            </div>
            @if (show === 'html') {
                <div>
                    <ng-content select="code-highlight[lang=html]"></ng-content>
                </div>
            }
            @if (show === 'typescript') {
                <div>
                    <ng-content select="code-highlight[lang=typescript]"></ng-content>
                </div>
            }
            @if (show === 'scss') {
                <div>
                    <ng-content select="code-highlight[lang=scss]"></ng-content>
                </div>
            }
            @if (show === '') {
                <div
                    class="dui-body dui-normalized"
                    style="background: var(--dui-window-content-bg-trans); padding: 5px; border-radius: 3px;"
                >
                    <ng-content></ng-content>
                </div>
            }
        </div>
    `,
    styles: [
        `
            :host {
                display: block;
                position: relative;
            }

            dui-theme-switcher {
                position: absolute;
                right: 5px;
                top: 0px;
            }
        `,
    ],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [ButtonGroupComponent, TabButtonComponent],
})
export class CodeFrameComponent implements AfterViewInit {
    @ContentChildren(CodeHighlightComponent) highlighter!: QueryList<CodeHighlightComponent>;

    @Input() height = 300;

    show: '' | 'html' | 'typescript' | 'scss' = '';

    showPage(show: '' | 'html' | 'typescript' | 'scss') {
        this.show = show;
    }

    public hasType(name: string): boolean {
        return Boolean(this.getHighlightForType(name));
    }

    ngAfterViewInit(): void {}

    public getHighlightForType(name: string): CodeHighlightComponent | undefined {
        for (const h of this.highlighter.toArray()) {
            if (h.lang() === name || (name === 'typescript' && !h.lang())) {
                return h;
            }
        }

        return;
    }
}

type ApiDocFlags = {
    isProtected?: true;
    isPrivate?: true;
    isExported?: true;
};

type ApiDocGroups = { title: string; kind: number; children: number[] }[];
type ApiDocSources = { fileName: string; line: number; character: number; url?: string }[];

function getGitUrl(sources?: ApiDocSources): string {
    const entry = sources?.find(v => v.url);
    return entry?.url || '';
}

type ApiDocTypeDeclarationType = {
    kind: 65536; // type literal
    signatures?: ApiDocTypeDeclaration[];
    children?: ApiDocTypeDeclarationVariable[];
};

type ApiDocTypeDeclarationCallSignature = {
    kind: 4096; // call signature
    parameters: ApiDocTypeDeclarationParameter[];
    type: ApiDocType;
};

type ApiDocTypeDeclarationParameter = {
    kind: 32768; // Parameter
    kindString: 'Parameter';
    name: string;
    type: ApiDocType;
};
type ApiDocTypeDeclarationVariable = {
    kind: 32; // Parameter
    kindString: 'Variable';
    name: string;
    type: ApiDocType;
};

type ApiDocTypeDeclaration =
    | ApiDocTypeDeclarationType
    | ApiDocTypeDeclarationCallSignature
    | ApiDocTypeDeclarationParameter;
// type ApiDocTypeDeclaration = {
//     kind: number
//     kindString: string
//     signatures: Array(1)
//     flags: { isExported: true }
//     id: 709
//     kind: 4096
//     kindString: 'Call signature'
//     name: '__call'
//     parameters: Array(1)
//     0: { id: 710, name: 'bla', kind: 32768, kindString: 'Parameter', flags: { … }, … }
//     length: 1
//     __proto__: Array(0)
//     type: { type: 'union', types: Array(2) }
// };
type ApiDocType =
    | { type: 'array'; elementType: ApiDocType }
    | { type: 'literal'; value: any }
    | { type: 'intrinsic'; name: string }
    | { type: 'union'; types: ApiDocType[] }
    | { type: 'reference'; name: string; typeArguments?: ApiDocType[] }
    | { type: 'typeParameter'; name: string }
    | { type: 'reflection'; declaration: ApiDocTypeDeclaration };
// |{ type: string, name: string, types?: ApiDocType[], typeArguments?: ApiDocType[] }

interface ApiDocItemDecorator {
    name: string;
    arguments?: { [name: string]: any };
    type?: { type: string; name: string };
    selector?: string;
}

type ApiDocComment = { shortText?: string; summary?: { text: string }[] };

type ApiDocDecorators = ApiDocItemDecorator[];

function getComment(comment?: ApiDocComment): string {
    if (!comment) return '';
    let text = comment.shortText || '';
    if (comment.summary) {
        for (const s of comment.summary) {
            text += '\n' + s.text;
        }
    }
    return text;
}

function isFormsCompatible(doc?: ApiDocItemChildClass): boolean {
    if (!doc || !doc.extendedTypes) return false;
    return doc.extendedTypes.some(v => v.type === 'reference' && v.name === 'ValueAccessorBase');
}

interface ApiDocItemClassChildConstructor {
    id: number;
    kind: 512;
    name: 'constructor';
    kindString: 'Constructor';
    flags: ApiDocFlags;
    signature: any[];
    sources: ApiDocSources;
    decorators: undefined;
}

interface ApiDocItemClassChildMethod {
    id: number;
    name: string;
    kind: 2048;
    kindString: 'Method';

    // todo really?
    comment?: ApiDocComment;

    inheritedFrom?: {
        type: string;
        name: string;
        id: number;
    };

    signatures: {
        id: number;
        name: string;
        kind: number;
        kindString: string;
        flags: ApiDocFlags;
        parameters?: ApiDocTypeDeclarationParameter[];
        type: ApiDocType;
    }[];
    flags: ApiDocFlags;
    decorators?: ApiDocDecorators;

    sources: ApiDocSources;
    type?: ApiDocType;
    defaultValue: string;
}

interface ApiDocItemClassChildProperty {
    id: number;
    name: string;
    kind: 1024;
    kindString: 'Property';
    input?: {
        required: boolean;
        alias?: string;
    };

    comment?: ApiDocComment;

    flags: ApiDocFlags;
    decorators?: ApiDocDecorators;

    sources: ApiDocSources;
    type?: ApiDocType;
    defaultValue: string;
}

interface ApiDocItemChildClass {
    id: number;
    name: string;
    kind: 128;
    kindString: 'Class';
    extendedTypes?: ApiDocType[];

    comment?: ApiDocComment;

    flags: ApiDocFlags;
    decorators: ApiDocDecorators;
    children?: (ApiDocItemClassChildProperty | ApiDocItemClassChildConstructor | ApiDocItemClassChildMethod)[];

    groups: ApiDocGroups;
    sources: ApiDocSources;
}

interface ApiDocModule {
    id: number;
    name: string;
    kind: 1;
    kindString: 'External module';
    flags: ApiDocFlags;
    originalName: string;
    children: ApiDocItemChildClass[];

    groups: ApiDocGroups;
    sources: ApiDocSources;
}

interface ApiDocPackage {
    id: number;
    name: string;
    kind: number;
    flags: ApiDocFlags;

    children: ApiDocItemChildClass[];
    groups: ApiDocGroups;
}

export function isOptional(type?: ApiDocType) {
    if (!type) {
        return false;
    }

    if (type.type === 'union') {
        return type.types.some(v => v.type === 'intrinsic' && v.name === 'undefined');
    }
    return false;
}

export function typeToString(type?: ApiDocType, d: number = 0): string {
    if (!type) {
        return '';
    }

    if (type.type === 'literal') {
        return `'${type.value}'`;
    }

    if (type.type === 'union') {
        if (d === 0) {
            return type.types
                .filter(v => !(v.type === 'intrinsic' && v.name === 'undefined'))
                .map(v => typeToString(v, d + 1))
                .join(' | ');
        }
        return '(' + type.types.map(v => typeToString(v, d + 1)).join(' | ') + ')';
    }

    if (type.type === 'array') {
        return typeToString(type.elementType, d + 1) + '[]';
    }

    if (type.type === 'intrinsic') {
        return type.name;
    }

    if (type.type === 'reference') {
        if (type.typeArguments) {
            return `${type.name}<${type.typeArguments.map(typeToString).join(', ')}>`;
        }
        return type.name;
    }

    if (type.type === 'typeParameter') {
        return type.name;
    }

    if (type.type === 'reflection' && type.declaration.kind === 65536) {
        if (type.declaration.children) {
            // object signature
            const vars: string[] = [];
            for (const c of type.declaration.children) {
                vars.push(c.name + (isOptional(c.type) ? '?' : '') + ': ' + typeToString(c.type));
            }
            return `{${vars.join(', ')}}`;
        }

        if (type.declaration.signatures) {
            // function signature
            for (const sig of type.declaration.signatures) {
                if (sig.kind === 4096) {
                    const params: string[] = [];
                    if (sig.parameters) {
                        for (const p of sig.parameters) {
                            params.push(p.name + (isOptional(p.type) ? '?' : '') + ': ' + typeToString(p.type));
                        }
                    }

                    return `(${params.join(', ')}) => ` + typeToString(sig.type, 1);
                }
            }
        }
    }

    return '';
}

const docs = import('@deepkit/desktop-ui/docs.json');

@Injectable({ providedIn: 'root' })
export class ApiDocProvider {
    parser = new MarkdownParser();

    async getDocs(): Promise<ApiDocPackage> {
        return docs as any;
    }

    async findDocForComponent(component: string): Promise<ApiDocItemChildClass> {
        const docs = await this.getDocs();

        for (const child of docs.children) {
            if (child.name === component) return child;
            // if (child.name === module) {
            //
            //     // for (const compChild of child.children) {
            //     //     if (compChild.name === component && compChild.kind === 128) {
            //     //         return compChild;
            //     //     }
            //     // }
            //
            //     console.debug('available components', child.children.map(v => v.name));
            //     throw new Error(`No component ${component} found in ${module}.`);
            // }
        }

        console.log(
            'available modules',
            docs.children.map(v => v.name),
        );
        throw new Error(`No component ${component} found.`);
    }
}

interface TableRow {
    name: string;
    type: 'input' | 'output' | 'method' | 'property';
    alias?: string;
    required?: boolean;
    dataType: string;
    comment: string;
}

@Component({
    selector: 'api-doc',
    template: `
        <div>
            <div class="title">
                <h2>
                    API
                    <code>{{ title() }}</code>
                    @if (url(); as url) {
                        <small>(<a [href]="url" target="_blank">source</a>)</small>
                    }
                </h2>
                @if (tableData().length) {
                    <dui-input icon="search" placeholder="Search" [(ngModel)]="filterQuery" clearer></dui-input>
                }
            </div>
            @if (formsCompatible()) {
                <div class="forms-compatible">
                    This component is compatible with Angular Forms. You can use <code>[(ngModel)]</code> or
                    <code>formControlName</code> with it.
                </div>
            }
            @if (comment(); as content) {
                <!--          <p [innerHTML]="comment()"></p>-->
                <app-render-content [content]="content.body"></app-render-content>
            }
            @if (tableData().length) {
                <dui-table
                    [virtualScrolling]="false"
                    [items]="tableData()"
                    [filterQuery]="filterQuery()"
                    [filterFields]="['name', 'type', 'dataType', 'comment']"
                    no-focus-outline
                    text-selection
                >
                    <dui-table-column name="name" header="Name" [width]="450">
                        <ng-container *duiTableCell="let row">
                            <code-highlight lang="typescript" inline [code]="code(row)" />
                        </ng-container>
                    </dui-table-column>
                    <!--            <dui-table-column name="dataType" header="Type" [width]="150"></dui-table-column>-->
                    <dui-table-column name="comment" header="Description" [width]="350"></dui-table-column>
                </dui-table>
            }
        </div>
    `,
    styleUrls: ['./api-doc.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [
        TableComponent,
        TableColumnDirective,
        InputComponent,
        FormsModule,
        TableCellDirective,
        forwardRef(() => ContentRenderComponent),
        CodeHighlightComponent,
    ],
})
export class ApiDocComponent {
    component = input.required<string>();

    title = signal('');
    filterQuery = signal('');
    apiDocProvider = inject(ApiDocProvider);

    formsCompatible = computed(() => isFormsCompatible(this.apiDoc()));

    apiDoc = derivedAsync(pendingTask(() => this.apiDocProvider.findDocForComponent(this.component())));

    comment = derivedAsync(
        pendingTask(async () => {
            const docs = this.apiDoc();
            if (!docs) return undefined;
            const comment = getComment(docs.comment);
            if (!comment) return undefined;
            return this.apiDocProvider.parser.loadAndParse(comment);
        }),
    );

    url = computed(() => getGitUrl(this.apiDoc()?.sources));

    code(row: TableRow) {
        let prefix = row.alias || row.name;
        if (row.type === 'input') {
            prefix = '@Input() ' + prefix;
            if (!row.required) prefix += '?';
        } else if (row.type === 'output') {
            prefix = '@Output() ' + prefix + '?';
        }

        return prefix + ': ' + row.dataType;
    }

    tableData = derivedAsync(
        pendingTask(async () => {
            const tableData: TableRow[] = [];
            const docs = this.apiDoc();
            if (!docs) return [];

            for (const decorator of docs.decorators) {
                if (decorator.name === 'Component' || decorator.name === 'Directive') {
                    // const match = decorator.arguments.obj.match(/['"]?selector['"]?\s?:\s?['"]+([^'"]+)['"]+/i);
                    const selector = decorator.selector || '';
                    if (!selector.startsWith('[')) {
                        this.title.set('<' + selector.replace(/,/g, '>, <') + '>');
                    } else {
                        this.title.set(selector);
                    }
                }
            }

            if (!this.title()) {
                this.title.set(docs.name);
            }

            const ignoreProperties = [
                'registerOnChange',
                'registerOnTouched',
                'setDisabledState',
                'writeValue',
                'touch',
            ];

            if (docs.children) {
                for (const prop of docs.children) {
                    if (
                        (prop.kindString === 'Property' || prop.kindString === 'Method') &&
                        ignoreProperties.includes(prop.name)
                    )
                        continue;

                    if (
                        prop.kindString === 'Property' &&
                        prop.type?.type === 'reference' &&
                        (prop.type?.name === 'InputSignal' ||
                            prop.type?.name === 'InputSignalWithTransform' ||
                            prop.type?.name === 'ModelSignal')
                    ) {
                        const type = prop.type.typeArguments?.[0];
                        tableData.push({
                            name: prop.name,
                            type: 'input',
                            alias: prop.input?.alias,
                            required: prop.input?.required,
                            dataType: typeToString(type),
                            comment: getComment(prop.comment),
                        });

                        if (prop.type?.name === 'ModelSignal') {
                            tableData.push({
                                name: prop.name + 'Change',
                                type: 'output',
                                alias: prop.input?.alias,
                                required: prop.input?.required,
                                dataType: typeToString(type),
                                comment: '',
                            });
                        }
                    } else if (
                        prop.kindString === 'Property' &&
                        prop.type?.type === 'reference' &&
                        prop.type?.name === 'OutputEmitterRef'
                    ) {
                        const type = prop.type.typeArguments?.[0];
                        tableData.push({
                            name: prop.name,
                            type: 'output',
                            dataType: typeToString(type),
                            comment: getComment(prop.comment),
                        });
                    } else if (prop.kindString === 'Property') {
                        if (prop.decorators) {
                            for (const decorator of prop.decorators) {
                                if (decorator.name === 'Input') {
                                    tableData.push({
                                        name: prop.name,
                                        type: 'input',
                                        alias: prop.input?.alias,
                                        required: prop.input?.required,
                                        dataType: typeToString(prop.type),
                                        comment: getComment(prop.comment),
                                    });
                                }

                                if (decorator.name === 'Output') {
                                    tableData.push({
                                        name: prop.name,
                                        type: 'output',
                                        dataType: typeToString(prop.type),
                                        comment: getComment(prop.comment),
                                    });
                                }
                            }
                        } else {
                            const hidden =
                                prop.name === 'constructor' || prop.flags.isPrivate || prop.flags.isProtected;
                            if (!hidden) {
                                tableData.push({
                                    name: prop.name,
                                    type: 'property',
                                    dataType: typeToString(prop.type),
                                    comment: getComment(prop.comment),
                                });
                            }
                        }
                    } else if (prop.kindString === 'Method' && !prop.flags.isProtected && !prop.flags.isPrivate) {
                        if (prop.name.startsWith('ng')) {
                            continue;
                        }

                        const params: string[] = !prop.signatures[0].parameters
                            ? []
                            : prop.signatures[0].parameters.map(
                                  (v: any) => v.name + (isOptional(v.type) ? '?' : '') + ': ' + typeToString(v.type),
                              );

                        tableData.push({
                            name: prop.name + '(' + params.join(', ') + ')',
                            type: 'method',
                            dataType: typeToString(prop.signatures[0].type, 1),
                            comment: getComment(prop.comment),
                        });
                    }
                }
            }

            tableData.sort((a, b) => {
                //first order by type: input required, input, output, method. then by name
                const typeOrder: { [key: string]: number } = {
                    'input required': 1,
                    input: 2,
                    output: 3,
                    property: 4,
                    method: 5,
                };
                const typeA = a.type + (a.required ? ' required' : '');
                const typeB = b.type + (b.required ? ' required' : '');
                if (typeOrder[typeA] !== typeOrder[typeB]) {
                    return typeOrder[typeA] - typeOrder[typeB];
                }
                return a.name.localeCompare(b.name);
            });
            return tableData;
        }),
        { behavior: 'concat', initialValue: [] },
    );
}
