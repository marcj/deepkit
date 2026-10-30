import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ButtonComponent, CheckboxComponent, DuiDialog, InputComponent } from '@deepkit/desktop-ui';
import { DatabaseInfo, EntityPropertySeed, FakerTypes, SeedDatabase } from '@deepkit/orm-browser-api';
import { ReflectionClass } from '@deepkit/type';

import { BrowserState } from '../browser-state';
import { ControllerClient } from '../client';
import { trackBySchema } from '../utils';
import { DatabaseSeedPropertiesComponent } from './database-seed-properties.component';
import { FakerTypeDialogComponent } from './dialog/faker-type-dialog.component';

@Component({
    selector: 'orm-browser-seed',
    template: `
        <div class="actions">
            <dui-button [disabled]="seeding" (click)="seed()">Seed</dui-button>
        </div>
        @if (database && fakerTypes) {
            <div class="entities">
                @for (entity of database.getClassSchemas(); track trackBySchema($index, entity)) {
                    <div class="entity">
                        @if (state.getSeedSettings(fakerTypes, database.name, entity.getName()); as settings) {
                            <h3>
                                <dui-checkbox [(ngModel)]="settings.active">{{ entity.getClassName() }}</dui-checkbox>
                            </h3>
                            @if (settings.active) {
                                <div class="settings">
                                    <dui-input
                                        lightFocus
                                        round
                                        type="number"
                                        [(ngModel)]="settings.amount"
                                        placeholder="amount"
                                    ></dui-input>
                                    <dui-checkbox style="margin-left: 5px;" [(ngModel)]="settings.truncate"
                                        >Delete all before seeding</dui-checkbox
                                    >
                                </div>
                                <orm-browser-seed-properties
                                    [fakerTypes]="fakerTypes"
                                    [entity]="entity"
                                    [properties]="settings.properties"
                                    (changed)="typeChanged(entity)"
                                ></orm-browser-seed-properties>
                            }
                        }
                    </div>
                }
            </div>
        }
    `,
    styleUrls: ['./database-seed.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [ButtonComponent, CheckboxComponent, FormsModule, InputComponent, DatabaseSeedPropertiesComponent],
})
export class DatabaseSeedComponent implements OnChanges {
    @Input() database!: DatabaseInfo;
    fakerTypes?: FakerTypes;
    fakerTypesArray?: { name: string; type: string }[];
    trackBySchema = trackBySchema;

    seeding: boolean = false;

    constructor(
        protected controllerClient: ControllerClient,
        protected cd: ChangeDetectorRef,
        protected duiDialog: DuiDialog,
        public state: BrowserState,
    ) {}

    async ngOnChanges() {
        await this.load();
    }

    protected async load() {
        try {
            this.fakerTypes = await this.controllerClient.browser.getFakerTypes();
            this.fakerTypesArray = [];
            for (const [name, info] of Object.entries(this.fakerTypes)) {
                this.fakerTypesArray.push({ name, type: info.type });
            }
        } finally {
        }
        this.cd.detectChanges();
    }

    chooseType(entity: ReflectionClass<any>, propertyName: string) {
        if (!this.fakerTypes) return;
        const settings = this.state.getSeedSettings(this.fakerTypes, this.database.name, entity.getName());
        const property = (settings.properties[propertyName] ||= new EntityPropertySeed(propertyName));

        const { component } = this.duiDialog.open(FakerTypeDialogComponent, {
            fakerTypes: this.fakerTypes,
            selected: property.faker,
        });

        component.chosen.subscribe((value: string) => {
            property.faker = value;
            this.cd.detectChanges();
        });
    }

    typeChanged(entity: ReflectionClass<any>) {
        this.state.storeSeedSettings(this.database.name, entity.getName());
    }

    async seed() {
        if (
            !(await this.duiDialog.confirm(
                'Seed now?',
                'You are about to seed your database. All content may be lost.',
            ))
        )
            return;

        this.seeding = true;
        this.cd.detectChanges();

        try {
            const dbSeeding: SeedDatabase = { entities: {} };
            for (const entity of this.database.getClassSchemas()) {
                const key = this.state.getStoreKey(this.database.name, entity.getName());
                const settings = this.state.seedSettings[key];
                if (!settings || !settings.active) continue;

                dbSeeding.entities[entity.getName()] = settings;
            }
            await this.controllerClient.browser.seed(this.database.name, dbSeeding);
        } catch (error: any) {
            await this.duiDialog.alert('Error seeding', String(error));
        }

        this.state.onDataChange.emit();
        this.seeding = false;
        this.cd.detectChanges();
    }
}
