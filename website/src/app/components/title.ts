import { ChangeDetectionStrategy, Component, Injectable, Input, OnChanges, OnDestroy, OnInit } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';

import { arrayRemoveItem } from '@deepkit/core';

type Type = { type: string; value?: any };

@Injectable()
export class AppMetaStack {
    stack: Type[] = [];

    constructor(
        private title: Title,
        private meta: Meta,
    ) {}

    register(appTitle: Type) {
        this.stack.push(appTitle);
        this.update();
    }

    unregister(appTitle: Type) {
        arrayRemoveItem(this.stack, appTitle);
        this.update();
    }

    update() {
        const titles = this.stack.filter(v => v.type === 'title');
        const descriptions = this.stack.filter(v => v.type === 'description');

        const title = titles
            .map(v => v.value)
            .filter(v => v)
            .reverse();
        const description = descriptions
            .map(v => v.value)
            .filter(v => v)
            .reverse();
        this.title.setTitle(title.join(' // '));

        this.meta.updateTag({ property: 'og:description', content: description.join(' // ') });
        this.meta.updateTag({ property: 'og:title', content: title.join(' // ') });
    }
}

@Component({
    selector: 'app-title',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.Eager,
    template: ``,
})
export class AppTitle implements OnChanges, OnInit, OnDestroy {
    @Input() value?: string | any;
    type = 'title';

    constructor(private stack: AppMetaStack) {}

    ngOnInit() {
        this.stack.register(this);
    }

    ngOnDestroy() {
        this.stack.unregister(this);
    }

    ngOnChanges() {
        this.stack.update();
    }
}

@Component({
    selector: 'app-description',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.Eager,
    template: ``,
})
export class AppDescription implements OnChanges, OnInit, OnDestroy {
    @Input() value?: string | any;
    type = 'description';

    constructor(private stack: AppMetaStack) {}

    ngOnInit() {
        this.stack.register(this);
    }

    ngOnDestroy() {
        this.stack.unregister(this);
    }

    ngOnChanges() {
        this.stack.update();
    }
}
