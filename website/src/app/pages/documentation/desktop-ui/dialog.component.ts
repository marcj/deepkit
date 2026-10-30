import { ChangeDetectionStrategy, Component } from '@angular/core';
import { AppTitle } from '@app/app/components/title.js';
import { ApiDocComponent } from '@app/app/pages/documentation/desktop-ui/api-doc.component.js';
import { CodeFrameComponent } from '@app/app/pages/documentation/desktop-ui/code-frame.component.js';

import {
    ButtonComponent,
    ButtonGroupComponent,
    CloseDialogDirective,
    DialogActionsComponent,
    DialogComponent,
    DialogDirective,
    DuiDialogConfirmDirective,
} from '@deepkit/desktop-ui';
import { CodeHighlightComponent } from '@deepkit/ui-library';

@Component({
    host: { ngSkipHydration: 'true' },
    imports: [
        CodeHighlightComponent,
        CodeFrameComponent,
        DialogComponent,
        DialogActionsComponent,
        ButtonComponent,
        DialogDirective,
        ButtonGroupComponent,
        ApiDocComponent,
        DuiDialogConfirmDirective,
        CloseDialogDirective,
        AppTitle,
    ],
    changeDetection: ChangeDetectionStrategy.Eager,
    template: `
        <div class="app-content normalize-text">
            <div class="app-pre-headline">Desktop UI</div>
            <h1>Dialog</h1>
            <app-title value="Dialog"></app-title>

            <doc-code-frame>
                <div>
                    <dui-dialog [(visible)]="showDialog" title="Cool modal" normalize-style>
                        <h3>Hi this is a new window</h3>

                        <p>
                            There are many variations of passages of Lorem Ipsum available, but the majority have
                            suffered alteration in some form, by injected humour, or randomised words which don't look
                            even slightly believable. If you are going to use a passage of Lorem Ipsum, you need to be
                            sure there isn't anything embarrassing hidden in the middle of text. All the Lorem Ipsum
                            generators on the Internet tend to repeat predefined chunks as necessary, making this the
                            first true generator on the Internet. It uses a dictionary of over 200 Latin words, combined
                            with a handful of model sentence structures, to generate Lorem Ipsum which looks reasonable.
                            The generated Lorem Ipsum is therefore always free from repetition, injected humour, or
                            non-characteristic words etc.
                        </p>

                        <p>
                            There are many variations of passages of Lorem Ipsum available, but the majority have
                            suffered alteration in some form, by injected humour, or randomised words which don't look
                            even slightly believable. If you are going to use a passage of Lorem Ipsum, you need to be
                            sure there isn't anything embarrassing hidden in the middle of text. All the Lorem Ipsum
                            generators on the Internet tend to repeat predefined chunks as necessary, making this the
                            first true generator on the Internet. It uses a dictionary of over 200 Latin words, combined
                            with a handful of model sentence structures, to generate Lorem Ipsum which looks reasonable.
                            The generated Lorem Ipsum is therefore always free from repetition, injected humour, or
                            non-characteristic words etc.
                        </p>

                        <dui-dialog-actions>
                            <dui-button closeDialog>Close</dui-button>
                            <dui-button closeDialog primary>Ok</dui-button>
                        </dui-dialog-actions>
                    </dui-dialog>

                    <dui-dialog #dialog normalize-style>
                        <h3>Are you sure?</h3>

                        <p>Please confirm</p>

                        <dui-dialog #anotherOne [maxWidth]="500">
                            <h3>No worries</h3>
                            <p>
                                There are many variations of passages of Lorem Ipsum available, but the majority have
                                suffered alteration in some form, by injected humour.
                            </p>
                            <dui-dialog-actions>
                                <dui-button closeDialog>Ok, I'm sure now</dui-button>
                            </dui-dialog-actions>
                        </dui-dialog>

                        <dui-button (click)="anotherOne.show()">Not sure</dui-button>

                        <dui-dialog-actions>
                            <dui-button closeDialog>Close</dui-button>
                        </dui-dialog-actions>
                    </dui-dialog>

                    <dui-dialog #dialog2 [minHeight]="250" [minWidth]="500" normalize-style>
                        <ng-container *dialogContainer>
                            <div
                                style="position: absolute;left: 0; right: 0; top: 0; bottom: 0; border: 2px solid red;"
                            >
                                I'm absolute
                            </div>
                            <dui-dialog-actions>
                                <dui-button closeDialog>Close</dui-button>
                            </dui-dialog-actions>
                        </ng-container>
                    </dui-dialog>

                    <dui-button-group>
                        <dui-button textured (click)="showDialog = !showDialog">
                            {{ showDialog ? 'Close' : 'Open' }} Dialog
                        </dui-button>
                        <dui-button textured (click)="dialog.show()">Open sureness</dui-button>
                        <dui-button textured confirm="Really delete?" (click)="confirmed = confirmed + 1"
                            >Confirm please {{ confirmed }}</dui-button
                        >
                        <dui-button textured (click)="dialog2.show()">Absolute dialog</dui-button>
                    </dui-button-group>
                </div>
                <code-highlight lang="html" [code]="code" />
            </doc-code-frame>

            <api-doc component="DialogComponent"></api-doc>
            <api-doc component="DialogDirective"></api-doc>
            <api-doc component="CloseDialogDirective"></api-doc>
            <api-doc component="OpenDialogDirective"></api-doc>
            <api-doc component="DuiDialogConfirmDirective"></api-doc>
        </div>
    `,
})
export class DocDesktopUIDialogComponent {
    showDialog = false;
    confirmed = 0;

    code = `
<dui-dialog [(visible)]="showDialog" title="Cool modal">
    <h3>Hi this is a new window</h3>

    <p>
        There are many variations of passages of Lorem Ipsum available, but the majority have suffered alteration in some form, by
        injected humour,
        or randomised words which don't look even slightly believable. If you are going to use a passage of Lorem Ipsum, you need to
        be sure there
        isn't anything embarrassing hidden in the middle of text. All the Lorem Ipsum generators on the Internet tend to repeat
        predefined chunks
        as necessary, making this the first true generator on the Internet. It uses a dictionary of over 200 Latin words, combined
        with a handful of
        model sentence structures, to generate Lorem Ipsum which looks reasonable.
        The generated Lorem Ipsum is therefore always free from repetition, injected humour, or non-characteristic words etc.
    </p>

    <p>
        There are many variations of passages of Lorem Ipsum available, but the majority have suffered alteration in some form, by
        injected humour,
        or randomised words which don't look even slightly believable. If you are going to use a passage of Lorem Ipsum, you need to
        be sure there
        isn't anything embarrassing hidden in the middle of text. All the Lorem Ipsum generators on the Internet tend to repeat
        predefined chunks
        as necessary, making this the first true generator on the Internet. It uses a dictionary of over 200 Latin words, combined
        with a handful of
        model sentence structures, to generate Lorem Ipsum which looks reasonable.
        The generated Lorem Ipsum is therefore always free from repetition, injected humour, or non-characteristic words etc.
    </p>

    <dui-dialog-actions>
        <dui-button closeDialog>Close</dui-button>
        <dui-button closeDialog primary>Ok</dui-button>
    </dui-dialog-actions>
</dui-dialog>

<dui-dialog #dialog>
    <h3>Are you sure?</h3>

    <dui-dialog #anotherOne [maxWidth]="500">
        <h3>No worries</h3>
        <p>
            There are many variations of passages of Lorem Ipsum available,
            but the majority have suffered alteration in some form, by injected humour.
        </p>
        <dui-dialog-actions>
            <dui-button closeDialog>Ok, I'm sure now</dui-button>
        </dui-dialog-actions>
    </dui-dialog>

    <dui-button (click)="anotherOne.show()">Not sure</dui-button>

    <dui-dialog-actions>
        <dui-button closeDialog>Close</dui-button>
    </dui-dialog-actions>
</dui-dialog>

<dui-dialog #dialog2 [minHeight]="250" [minWidth]="500">
    <ng-container *dialogContainer>
        <div style="position: absolute;left: 0; right: 0; top: 0; bottom: 0; border: 2px solid red;">
            I'm absolute
        </div>
        <dui-dialog-actions>
            <dui-button closeDialog>Close</dui-button>
        </dui-dialog-actions>
    </ng-container>
</dui-dialog>

<dui-button-group>
    <dui-button textured (click)="showDialog=!showDialog">
        {{showDialog ? 'Close' : 'Open'}} Dialog
    </dui-button>
    <dui-button textured (click)="dialog.show()">Open sureness</dui-button>
    <dui-button textured confirm="Really delete?" (click)="confirmed = confirmed+1">Confirm please {{confirmed}}</dui-button>
    <dui-button textured (click)="dialog2.show()">Absolute dialog</dui-button>
</dui-button-group>
    `;
}
