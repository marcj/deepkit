import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component } from '@angular/core';

import { ButtonComponent, IndicatorComponent } from '@deepkit/desktop-ui';
import { EventDispatcher } from '@deepkit/event';
import { ClientProgress } from '@deepkit/rpc';

import { ControllerClient } from '../client';
import { FileToUpload, State, fileQueuedEvent, fileUploadedEvent } from '../state';

@Component({
    selector: 'app-file-uploader',
    styles: [
        `
            :host {
                display: block;
                margin-right: 10px;
            }
        `,
    ],
    template: `
        @if (filesToUpload.length) {
            Upload {{ currentIndex }} of {{ state.volatile.filesToUpload.length }}:
            @if (upload && upload.progress && upload.progress.upload | async; as upload) {
                <dui-indicator [step]="upload.progress"></dui-indicator>
            }
            <dui-button small (click)="cancel()">Cancel</dui-button>
        }
    `,
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [AsyncPipe, ButtonComponent, IndicatorComponent],
})
export class FileUploaderComponent {
    upload?: FileToUpload;

    constructor(
        private events: EventDispatcher,
        private cd: ChangeDetectorRef,
        public state: State,
        private client: ControllerClient,
    ) {
        events.listen(fileQueuedEvent, () => {
            this.checkNext();
        });
    }

    get filesToUpload(): FileToUpload[] {
        return this.state.volatile.filesToUpload.filter(v => !v.done && !v.errored);
    }

    get currentIndex(): number {
        if (!this.upload) return 0;
        return this.state.volatile.filesToUpload.indexOf(this.upload) + 1;
    }

    cancel() {}

    checkNext() {
        if (this.upload && !this.upload.done) return;

        const files = this.filesToUpload;
        if (!files.length) return;
        const file = files[0];
        console.log('next', file);
        if (!file) return;

        this.upload = file;
        file.progress = ClientProgress.track();
        this.cd.detectChanges();
        this.client.media.addFile(file.filesystem, file.name, file.dir, file.data).then(
            () => {
                file.done = true;
                this.cd.detectChanges();
                this.checkNext();
                this.events.dispatch(fileUploadedEvent);
            },
            error => {
                file.errored = true;
                this.checkNext();
                console.log('error', error);
                this.cd.detectChanges();
                this.events.dispatch(fileUploadedEvent);
            },
        );
    }
}
