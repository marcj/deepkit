import { DOCUMENT } from '@angular/common';
import { computed, inject, Injectable, Pipe, PipeTransform, Signal, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { ControllerClient } from '@app/app/client';
import { TranslatableText } from '@app/common/docs.js';
import { languages } from '@app/common/languages.js';
import { derivedAsync } from 'ngxtension/derived-async';
import { pendingTask } from '@deepkit/desktop-ui';


@Injectable({ providedIn: 'root' })
export class Translation {
    languages = languages;

    routes = computed(() => {
        const routes: Record<string, string> = {};
        const labels = this.labels();
        let path = this.url();

        const firstSlash = path.indexOf('/', 1);
        if (firstSlash !== -1) {
            const lang = path.substring(1, firstSlash === -1 ? path.length : firstSlash);
            if (labels[lang]) {
                path = path.substring(firstSlash);
            }
        } else {
            path = '';
        }

        // remove query string
        const queryIndex = path.indexOf('?');
        if (queryIndex !== -1) {
            path = path.substring(0, queryIndex);
        }

        for (const lang of this.languages) {
            routes[lang.code] = `/${lang.code}${path}`;
        }
        if (routes['en'] === '/en') routes['en'] = '/';
        return routes;
    });

    labels = computed(() => {
        const labels: Record<string, string> = {};
        for (const lang of this.languages) {
            labels[lang.code] = lang.label;
        }
        return labels;
    });

    router = inject(Router);

    // the requested URL from the start, also in SSR, so the first translation request is already for the right language
    url = signal(inject(DOCUMENT).location?.pathname || '/');

    lang = computed(() => {
        const lang = this.url().replace(/^\//, '').split('/')[0] || 'en';
        return this.labels()[lang] ? lang : 'en';
    });

    client = inject(ControllerClient);

    basics = this.translations('basics');
    ready = computed(() => this.basics() !== undefined);

    constructor() {
        // only the finished navigation: during one, router.url is still the previous URL
        this.router.events.subscribe(event => {
            if (event instanceof NavigationEnd) this.url.set(event.urlAfterRedirects);
        });
    }

    async getTranslation(name: string): Promise<Record<string, string>> {
        const lang = this.lang();
        // English is the original, there is nothing to load
        if (lang === 'en') return {};
        return await this.client.main.getTranslation(lang, name);
    }

    translations(name: string): Signal<Record<string, string> | undefined> {
        return derivedAsync(pendingTask(async () => {
            return await this.getTranslation(name);
        }));
    }

    translate(key: TranslatableText): string {
        const translations = this.basics() || {};
        return translations[key] || key;
    }
}

@Pipe({ name: 'translate', pure: false })
export class TranslatePipe implements PipeTransform {
    translation = inject(Translation);

    transform(key: TranslatableText): string {
        return this.translation.translate(key);
    }
}


@Pipe({ name: 'i18nRoute' })
export class i18nRoutePipe implements PipeTransform {
    translation = inject(Translation);

    transform(route: string[] | string): string[] {
        const lang = this.translation.lang();
        if (typeof route === 'string') {
            route = route.split('/').filter((v) => v.length > 0);
        }
        return ['/' + lang, ...route];
    }
}
