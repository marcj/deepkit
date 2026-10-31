import { DOCUMENT } from '@angular/common';
import { inject, Injectable, signal } from '@angular/core';
import { Meta } from '@angular/platform-browser';
import { NavigationEnd, Router } from '@angular/router';
import { Translation } from '@app/app/components/translation.js';
import { ogImagePath, siteUrl } from '@app/common/seo.js';


/**
 * Sets the tags search engines need to tell the languages of a page apart: `<html lang>`, the canonical URL and the
 * `hreflang` alternates of the translated versions (docs and start page). The blog exists in English only, its posts
 * have the English URL as canonical in all languages.
 */
@Injectable({ providedIn: 'root' })
export class Seo {
    protected document = inject(DOCUMENT);
    protected translation = inject(Translation);
    protected meta = inject(Meta);

    /**
     * The language the content of the current page is actually in, if it differs from the URL,
     * e.g. a doc page without translation that shows the English text under /de/documentation.
     */
    contentLanguage = signal<string | undefined>(undefined);
    /** languages the current page exists in, if it reported them */
    protected pageLanguages?: string[];
    protected contentLanguageUrl = '';

    constructor() {
        inject(Router).events.subscribe(event => {
            if (!(event instanceof NavigationEnd)) return;
            // the page may have reported its content language before the navigation ended (e.g. in SSR)
            if (this.contentLanguageUrl !== this.pathOf(event.urlAfterRedirects)) {
                this.contentLanguage.set(undefined);
                this.pageLanguages = undefined;
            }
            this.update(event.urlAfterRedirects);
        });
    }

    /** Called by pages that know their content falls back to another language. */
    setContentLanguage(lang: string | undefined, url: string, languages?: string[]) {
        this.contentLanguage.set(lang);
        this.pageLanguages = languages;
        this.contentLanguageUrl = this.pathOf(url);
        this.update(url);
    }

    protected pathOf(url: string): string {
        return url.split(/[?#]/)[0] || '/';
    }

    protected update(url: string) {
        const path = this.pathOf(url);
        const lang = this.translation.lang();
        const content = this.contentLanguage();
        const routes = this.translationRoutes(path);

        // Desktop UI pages exist in English only, under every language prefix
        const englishOnly = /^\/[a-z]{2}\/documentation\/desktop-ui(\/|$)/.test(path);
        this.document.documentElement.lang = englishOnly ? 'en' : content || lang;

        let canonical = path;
        let alternates: Record<string, string> | undefined;
        if (englishOnly || /^\/[a-z]{2}\/blog(\/|$)/.test(path)) {
            canonical = routes.en;
        } else if (this.isTranslated(path)) {
            if (content && content !== lang) {
                // not translated: the original is the canonical version
                canonical = routes[content] || routes.en;
            } else {
                alternates = routes;
                if (this.pageLanguages) {
                    alternates = {};
                    for (const code of this.pageLanguages) if (routes[code]) alternates[code] = routes[code];
                }
            }
        }

        this.setLink('canonical', siteUrl + canonical);
        this.meta.updateTag({ property: 'og:url', content: siteUrl + canonical });

        // generated from the content of the page, see SeoController.ogImage
        const image = siteUrl + ogImagePath(canonical);
        this.meta.updateTag({ property: 'og:image', content: image });
        this.meta.updateTag({ property: 'og:image:width', content: '1200' });
        this.meta.updateTag({ property: 'og:image:height', content: '630' });
        this.meta.updateTag({ name: 'twitter:card', content: 'summary_large_image' });
        this.meta.updateTag({ name: 'twitter:image', content: image });

        for (const link of Array.from(this.document.head.querySelectorAll('link[rel="alternate"][hreflang], link[rel="alternate"][type="text/markdown"]'))) link.remove();
        // the page as markdown for LLMs and coding agents, see LlmsController
        if (/^\/[a-z]{2}\/documentation(\/|$)/.test(path) && !path.includes('/desktop-ui')) {
            const link = this.document.createElement('link');
            link.setAttribute('rel', 'alternate');
            link.setAttribute('type', 'text/markdown');
            link.setAttribute('href', siteUrl + path.replace(/\/$/, '') + '.md');
            this.document.head.appendChild(link);
        }
        if (alternates && Object.keys(alternates).length > 1) {
            for (const [code, route] of Object.entries(alternates)) this.addAlternate(code, siteUrl + route);
            this.addAlternate('x-default', siteUrl + alternates.en);
        }
    }

    /** Start pages and docs exist in all languages. */
    protected isTranslated(path: string): boolean {
        const codes = this.translation.languages.map(v => v.code);
        if (path === '/' || codes.some(code => path === '/' + code)) return true;
        return codes.some(code => path.startsWith(`/${code}/documentation`));
    }

    protected translationRoutes(path: string): Record<string, string> {
        const codes = this.translation.languages.map(v => v.code);
        let rest = path;
        for (const code of codes) {
            if (path === '/' + code) rest = '';
            else if (path.startsWith('/' + code + '/')) rest = path.substring(code.length + 1);
        }
        if (rest === '/') rest = '';
        const routes: Record<string, string> = {};
        for (const code of codes) routes[code] = rest ? `/${code}${rest}` : code === 'en' ? '/' : `/${code}`;
        return routes;
    }

    protected setLink(rel: string, href: string) {
        let link = this.document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
        if (!link) {
            link = this.document.createElement('link');
            link.setAttribute('rel', rel);
            this.document.head.appendChild(link);
        }
        link.setAttribute('href', href);
    }

    protected addAlternate(hreflang: string, href: string) {
        const link = this.document.createElement('link');
        link.setAttribute('rel', 'alternate');
        link.setAttribute('hreflang', hreflang);
        link.setAttribute('href', href);
        this.document.head.appendChild(link);
    }
}
