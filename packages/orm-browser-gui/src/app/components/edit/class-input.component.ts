import {
    AfterViewInit,
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    ElementRef,
    EventEmitter,
    Input,
    OnChanges,
    OnDestroy,
    Optional,
    Output,
    SkipSelf,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import { arrayRemoveItem } from '@deepkit/core';
import {
    ButtonComponent,
    CloseDialogDirective,
    DialogActionsComponent,
    DialogComponent,
    DuiDialog,
    InputComponent,
} from '@deepkit/desktop-ui';
import {
    ReflectionClass,
    ReflectionKind,
    Type,
    deserialize,
    getPrimaryKeyHashGenerator,
    isNullable,
    isOptional,
    isReferenceType,
    resolveClassType,
    serialize,
} from '@deepkit/type';

import { BrowserState } from '../../browser-state';
import { getParentProperty } from '../../utils';
import { DatabaseBrowserComponent } from '../../views/database-browser.component';

@Component({
    template: `
        @if (jsonEditor) {
            <dui-dialog
                class="class-field-dialog"
                noPadding
                [visible]="true"
                (closed)="done.emit()"
                [backDropCloses]="true"
                [minWidth]="450"
                [minHeight]="350"
            >
                <div class="json-editor">
                    <h3>JSON</h3>
                    <dui-input type="textarea" [(ngModel)]="jsonContent"></dui-input>
                </div>
                <dui-dialog-actions>
                    <dui-button closeDialog>Cancel</dui-button>
                    <dui-button (click)="jsonDone()">Ok</dui-button>
                </dui-dialog-actions>
            </dui-dialog>
        }
        @if (!parent && open) {
            {{ browserStack.length }}
            <dui-dialog
                class="class-field-dialog"
                noPadding
                [backDropCloses]="true"
                [visible]="browserStack.length > 0"
                (closed)="dialogClosed()"
                minWidth="80%"
                minHeight="75%"
            >
                <div class="layout">
                    @if (schema) {
                        <div class="header">
                            @for (browser of browserStack; track browser) {
                                <span> &raquo; {{ browser.schema?.getClassName() }} </span>
                            }
                        </div>
                    }
                    @for (browser of browserStack; track browser) {
                        @if (state.database && browser.schema) {
                            <orm-browser-database-browser
                                [class.hidden]="
                                    browserStack.length > 0 && browser !== browserStack[browserStack.length - 1]
                                "
                                [dialog]="true"
                                [withBack]="browser !== browserStack[0]"
                                (back)="popBrowser()"
                                [selectedPkHashes]="browser.selectedPkHashes"
                                [multiSelect]="isArrayType(browser.type)"
                                (select)="browser.onSelect($event)"
                                [database]="state.database"
                                [entity]="browser.schema"
                            ></orm-browser-database-browser>
                        }
                    }
                </div>
            </dui-dialog>
        }
    `,
    host: {
        '(click)': 'open = true',
        '[attr.tabIndex]': '1',
    },
    styles: [
        `
            .json-editor {
                height: 100%;
                padding: 0 12px;
                display: flex;
                flex-direction: column;
            }

            .json-editor dui-input {
                margin-top: 15px;
                width: 100%;
                flex: 1;
            }

            .layout {
                height: 100%;
                display: flex;
                flex-direction: column;
            }

            ::ng-deep dui-window-content > div.class-field-dialog {
                padding: 0 !important;
                padding-top: 10px !important;
            }

            .header {
                flex: 0 0 18px;
                padding: 0 15px;
                padding-top: 4px;
            }

            orm-browser-database-browser {
                flex: 1;
            }

            .hidden {
                display: none;
            }
        `,
    ],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [
        DialogComponent,
        InputComponent,
        FormsModule,
        DialogActionsComponent,
        ButtonComponent,
        CloseDialogDirective,
        DatabaseBrowserComponent,
    ],
})
export class ClassInputComponent implements AfterViewInit, OnChanges, OnDestroy {
    @Input() model: any;
    @Output() modelChange = new EventEmitter();
    @Input() row: any;

    @Input() type!: Type;
    @Input() autoOpen: boolean = true;

    open = false;
    jsonEditor = false;
    jsonContent = '';

    selectedPkHashes: string[] = [];

    @Output() done = new EventEmitter<void>();
    @Output() keyDown = new EventEmitter<KeyboardEvent>();

    browserStack: ClassInputComponent[] = [];

    schema?: ReflectionClass<any>;

    isArrayType(type: Type): boolean {
        return type.kind === ReflectionKind.array;
    }

    dialogClosed() {
        this.done.emit();
        this.open = false;
    }

    getLastBrowser(): ClassInputComponent | undefined {
        if (!this.browserStack.length) return undefined;
        return this.browserStack[this.browserStack.length - 1];
    }

    constructor(
        protected duiDialog: DuiDialog,
        public host: ElementRef,
        public state: BrowserState,
        public cd: ChangeDetectorRef,
        @Optional() @SkipSelf() public parent: ClassInputComponent,
    ) {
        this.browserStack.push(this);
    }

    jsonDone() {
        try {
            const obj = JSON.parse(this.jsonContent);
            this.model = deserialize(obj, undefined, undefined, undefined, this.type);
            this.modelChange.emit(this.model);

            this.jsonEditor = false;
            this.done.emit();
        } catch (error: any) {
            this.duiDialog.alert('Invalid JSON: ' + error);
        }
    }

    popBrowser() {
        const last = this.browserStack[this.browserStack.length - 1];
        if (!last) return;

        last.closeAndDone();
    }

    closeAndDone() {
        this.done.emit();
    }

    registerBrowser(child: ClassInputComponent) {
        this.browserStack.push(child);
        this.browserStack = this.browserStack.slice();
        this.cd.detectChanges();
    }

    deregisterBrowser(child: ClassInputComponent) {
        arrayRemoveItem(this.browserStack, child);
        this.cd.detectChanges();
    }

    ngOnDestroy() {
        this.done.emit(); //make sure that the column is disabled editing when this is destroyed
        if (this.parent) this.parent.deregisterBrowser(this);
    }

    ngOnChanges() {
        this.load();
    }

    load() {
        this.schema = resolveClassType(this.type);
        if (isReferenceType(this.type)) {
            this.open = this.autoOpen;
            this.loadSelection();
        } else {
            this.jsonEditor = true;
            if (this.model !== undefined) {
                this.jsonContent = JSON.stringify(serialize(this.model, undefined, undefined, undefined, this.type));
            } else {
                this.jsonContent = '';
            }
        }
        this.cd.detectChanges();
    }

    loadSelection() {
        if (!this.schema) return;
        this.selectedPkHashes = [];

        if (this.model !== undefined) {
            if (this.state.isIdWrapper(this.model)) {
                this.selectedPkHashes.push(this.state.extractHashFromIdWrapper(this.model));
            } else {
                this.selectedPkHashes.push(getPrimaryKeyHashGenerator(this.schema)(this.model));
            }
        }
    }

    onSelect(event: { items: any[]; pkHashes: string[] }) {
        if (!this.schema) return;

        const selected = event.items[0];
        if (selected) {
            if (this.state.isNew(selected)) {
                const property = getParentProperty(this.type);
                if (property) {
                    this.state.connectNewItem(selected, this.row, property);
                }
                this.model = this.state.getNewItemIdWrapper(selected);
            } else {
                this.model = this.schema.extractPrimaryKey(selected);
            }
        } else if (this.type.parent && isOptional(this.type.parent)) {
            this.model = undefined;
        } else if (isOptional(this.type) || isNullable(this.type)) {
            this.model = isNullable(this.type) ? null : undefined;
        }
        this.modelChange.emit(this.model);

        setTimeout(() => {
            this.popBrowser();
        }, 60);
    }

    ngAfterViewInit() {
        this.load();
        if (isReferenceType(this.type)) {
            this.loadSelection();
            if (this.parent) {
                this.parent.registerBrowser(this);
            }
        }
    }
}
