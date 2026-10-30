import { ChangeDetectionStrategy, Component, Input, OnChanges } from '@angular/core';

import { IconComponent } from '@deepkit/desktop-ui';
import { ModuleApi, ModuleImportedService, ModuleService } from '@deepkit/framework-debug-api';
import { stringifyType } from '@deepkit/type';
import { CodeHighlightComponent, DeepkitBoxComponent } from '@deepkit/ui-library';

@Component({
    selector: 'module-detail-service',
    template: `
        <span [class.exported]="service.exported" [class.for-root]="service.forRoot">
            {{ service.token }}
        </span>

        @if (service.instantiations) {
            <span class="instantiated">
                @if (service.scope) {
                    ({{ service.instantiations }} instantiations)
                }
                @if (!service.scope) {
                    (instantiated)
                }
            </span>
        }

        @if (service.scope) {
            <span class="scope">[scope: {{ service.scope }}]</span>
        }
    `,
    changeDetection: ChangeDetectionStrategy.Eager,
    styles: [
        `
            :host {
                display: block;
                font-size: 12px;
                overflow: hidden;
                text-overflow: ellipsis;
                padding: 0 3px;
            }

            :host:hover {
                border-radius: 3px;
                background-color: rgba(128, 128, 128, 0.24);
            }

            .exported {
                color: var(--dui-color-orange);
            }

            .for-root {
                color: var(--color-for-root);
            }

            .instantiated {
                color: var(--dui-color-green);
                opacity: 0.6;
            }

            .scope {
                color: var(--dui-text-light);
            }
        `,
    ],
})
export class ModuleDetailServiceComponent {
    @Input() service!: ModuleService;
}

@Component({
    selector: 'module-detail',
    template: `
        <deepkit-box
            [toggleAble]="true"
            [title]="m.className"
            class="module"
            [class.no-imports]="m.imports.length === 0"
        >
            <div class="name">
                Name: {{ m.name || 'unnamed' }} #{{ m.id }} — This name can be used for environment configuration
                loader.
            </div>
            @if (m.getConfigSchema(); as schema) {
                <div class="config">
                    <div class="ts">
                        <code-highlight [code]="schemaCode"></code-highlight>
                    </div>
                </div>
            }

            <div class="sections text-selection">
                @if (services.length) {
                    <div class="services">
                        <div class="section-title">Services</div>
                        <div class="entries">
                            @if (services.length === 0) {
                                <div class="no-entries">No services</div>
                            }
                            @for (service of services; track $index) {
                                <module-detail-service [service]="service"></module-detail-service>
                            }
                        </div>
                    </div>
                }
                @if (controllers.length) {
                    <div class="controllers">
                        <div class="section-title">Controllers</div>
                        <div class="entries">
                            @if (controllers.length === 0) {
                                <div class="no-entries">No controllers</div>
                            }
                            @for (service of controllers; track $index) {
                                <module-detail-service [service]="service"></module-detail-service>
                            }
                        </div>
                    </div>
                }
                @if (listeners.length) {
                    <div class="listeners">
                        <div class="section-title">Listeners</div>
                        <div class="entries">
                            @if (listeners.length === 0) {
                                <div class="no-entries">No listeners</div>
                            }
                            @for (service of listeners; track $index) {
                                <module-detail-service [service]="service"></module-detail-service>
                            }
                        </div>
                    </div>
                }
            </div>
            @if (importedServices.length) {
                <div class="imported-services">
                    <div class="title" (click)="showImportedServices = !showImportedServices">
                        <dui-icon clickable [name]="showImportedServices ? 'arrow_down' : 'arrow_right'"></dui-icon>
                        Imported services ({{ importedServices.length }})
                    </div>
                    @if (showImportedServices) {
                        <div class="description">
                            The following services have been exported by a module that {{ m.className }} imported.
                        </div>
                    }
                    @if (showImportedServices) {
                        <div class="imported-services-grid text-selection">
                            @for (service of importedServices; track $index) {
                                <div>
                                    <span>{{ service.token }}</span>
                                    <span class="module-name">({{ service.fromModule }})</span>
                                </div>
                            }
                        </div>
                    }
                </div>
            }
        </deepkit-box>

        @if (m.imports.length) {
            <div class="imports">
                <div class="line-top"></div>
                @for (child of m.imports; track $index; let i = $index; let last = $last) {
                    <div class="import">
                        <div class="line-left"></div>
                        @if (last) {
                            <div class="line-left-last"></div>
                        }
                        <module-detail [m]="child" [class.margin-bottom]="!last"></module-detail>
                    </div>
                }
            </div>
        }
    `,
    styleUrls: ['./module-detail.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [DeepkitBoxComponent, CodeHighlightComponent, ModuleDetailServiceComponent, IconComponent],
})
export class ModuleDetailComponent implements OnChanges {
    @Input() m!: ModuleApi;

    showImportedServices: boolean = false;

    public schemaCode: string = '';
    public services: ModuleService[] = [];
    public controllers: ModuleService[] = [];
    public listeners: ModuleService[] = [];
    public importedServices: ModuleImportedService[] = [];

    ngOnChanges(): void {
        this.services = this.m.services.filter(v => v.type === 'service');
        this.controllers = this.m.services.filter(v => v.type === 'controller');
        this.listeners = this.m.services.filter(v => v.type === 'listener');
        this.importedServices = this.m.importedServices;

        const schema = this.m.getConfigSchema();
        if (schema) {
            this.schemaCode = stringifyType(schema, {
                showDefaults: true,
                showFullDefinition: true,
                defaultValues: this.m.config,
            });
        }
    }
}
