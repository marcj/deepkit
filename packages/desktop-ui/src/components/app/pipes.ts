/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */

import { ChangeDetectorRef, OnDestroy, Pipe, PipeTransform } from '@angular/core';
import { Observable, Subscription } from 'rxjs';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { humanBytes } from '@deepkit/core';

/**
 * Almost the same as |async pipe, but renders directly (detectChanges() instead of marking it only(markForCheck())
 * on ChangeDetectorRef.
 *
 * @deprecated Do not use this pipe anymore, it is not necessary. Use the async pipe instead.
 */
@Pipe({ name: 'asyncRender', pure: false })
export class AsyncRenderPipe implements OnDestroy, PipeTransform {
    protected subscription?: Subscription;
    protected lastValue?: any;
    protected lastReturnedValue?: any;

    constructor(
        protected cd: ChangeDetectorRef) {
    }

    ngOnDestroy(): void {
        if (this.subscription) this.subscription.unsubscribe();
    }

    transform<T>(value?: Observable<T> | Promise<T>): T | undefined {
        if (this.lastValue !== value) {
            if (this.subscription) this.subscription.unsubscribe();
            this.lastReturnedValue = undefined;
            this.lastValue = value;

            if (value instanceof Promise) {
                value.then((v) => {
                    this.lastReturnedValue = v;
                    this.cd.detectChanges();
                });
            } else if (value) {
                this.subscription = value.subscribe((next) => {
                    this.lastReturnedValue = next;
                    this.cd.detectChanges();
                });
            }
        }

        return this.lastReturnedValue;
    }
}

@Pipe({ name: 'objectURL' })
export class ObjectURLPipe implements PipeTransform, OnDestroy {
    protected lastUrl?: string;

    constructor(private sanitizer: DomSanitizer) {
    }

    ngOnDestroy(): void {
        if (this.lastUrl) URL.revokeObjectURL(this.lastUrl);
    }

    transform(buffer?: ArrayBuffer | ArrayBufferView, mimeType?: string): SafeUrl | undefined {
        if (buffer) {
            if (this.lastUrl) URL.revokeObjectURL(this.lastUrl);
            this.lastUrl = URL.createObjectURL(new Blob([buffer as BlobPart], { type: mimeType }));
            return this.sanitizer.bypassSecurityTrustResourceUrl(this.lastUrl);
        }
    }
}

@Pipe({ name: 'fileSize' })
export class HumanFileSizePipe implements PipeTransform {
    transform(bytes: number, si: boolean = false): string {
        return humanBytes(bytes, si);
    }
}
