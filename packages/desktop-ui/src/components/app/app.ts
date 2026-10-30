import { DOCUMENT } from '@angular/common';
import {
    ApplicationRef,
    ChangeDetectionStrategy,
    Component,
    Directive,
    HostBinding,
    Inject,
    Injectable,
    Optional,
    Renderer2,
    RendererFactory2,
    input,
    signal,
} from '@angular/core';
import { Router } from '@angular/router';

import { arrayRemoveItem } from '@deepkit/core';

import { Electron } from '../../core/utils';
import { WindowRegistry } from '../window/window-state';

if ('undefined' !== typeof window && 'undefined' === typeof (window as any)['global']) {
    (window as any).global = window;
}

@Directive()
export class BaseComponent {
    disabled = input<boolean>();

    @HostBinding('class.disabled')
    get isDisabled() {
        return this.disabled() === true;
    }
}

@Component({
    selector: 'ui-component',
    template: ` {{ name() }} disabled={{ isDisabled }} `,
    styles: [
        `
            :host {
                display: inline-block;
            }

            :host.disabled {
                border: 1px solid red;
            }
        `,
    ],
    changeDetection: ChangeDetectionStrategy.Eager,
    host: {
        '[class.is-textarea]': 'name() === "textarea"',
    },
})
export class UiComponentComponent extends BaseComponent {
    name = input<string>('');
}

export class OverlayStackItem {
    constructor(
        public level: number,
        public host: HTMLElement,
        public component: any,
        public close: () => void,
        protected stack: OverlayStackItem[],
        public release: () => void,
    ) {}

    getAllAfter(): OverlayStackItem[] {
        const result: OverlayStackItem[] = [];

        let flip = false;
        for (let i = 0; i < this.stack.length; i++) {
            if (flip) result.push(this.stack[i]);
            if (this.stack[i] === this) flip = true;
        }
        return result;
    }

    getPrevious(): OverlayStackItem | undefined {
        const before = this.getAllBefore();
        return before.length ? before[before.length - 1] : undefined;
    }

    isLast(): boolean {
        return this.getAllAfter().length === 0;
    }

    getAllBefore(): OverlayStackItem[] {
        const result: OverlayStackItem[] = [];

        for (let i = 0; i < this.stack.length; i++) {
            if (this.stack[i] === this) return result;
            result.push(this.stack[i]);
        }
        return result;
    }
}

@Injectable({ providedIn: 'root' })
export class OverlayStack {
    public stack: OverlayStackItem[] = [];

    public register(host: HTMLElement, component: any, onClose: () => void): OverlayStackItem {
        const item = new OverlayStackItem(this.getCurrentLevel(), host, component, onClose, this.stack, () => {
            const before = item.getPrevious();
            if (before) before.host.focus();
            arrayRemoveItem(this.stack, item);
        });
        this.stack.push(item);
        return item;
    }

    forEach(callback: (item: OverlayStackItem) => void): void {
        for (const item of this.stack.slice()) {
            callback(item);
        }
    }

    getCurrentLevel() {
        return this.stack.length;
    }

    getLevel(item: OverlayStackItem): number {
        return this.stack.indexOf(item);
    }

    getForComponent(component: any): OverlayStackItem | undefined {
        return this.stack.find(item => item.component === component);
    }
}

@Injectable({ providedIn: 'root' })
export class Storage {
    getItem(key: string): any {
        return 'undefined' === typeof localStorage ? undefined : localStorage.getItem(key);
    }

    setItem(key: string, value: any): void {
        if ('undefined' === typeof localStorage) return;
        localStorage.setItem(key, value);
    }

    removeItem(key: string): void {
        if ('undefined' === typeof localStorage) return;
        localStorage.removeItem(key);
    }
}

@Injectable({ providedIn: 'root' })
export class DuiApp {
    darkMode = signal<boolean | undefined>(undefined);
    platform = signal<'web' | 'darwin' | 'linux' | 'win32'>('darwin');
    themeDetection: boolean = true;

    protected render: Renderer2;

    constructor(
        protected app: ApplicationRef,
        @Inject(DOCUMENT) protected document: Document,
        rendererFactory: RendererFactory2,
        protected storage: Storage,
        @Optional() protected windowRegistry?: WindowRegistry,
        @Optional() protected router?: Router,
    ) {
        this.render = rendererFactory.createRenderer(null, null);
        if ('undefined' !== typeof window) {
            (window as any)['DuiApp'] = this;
        }
        this.start();
        if (document && Electron.isAvailable()) {
            document.addEventListener('click', (event: MouseEvent) => {
                if (event.target) {
                    const target = event.target as HTMLElement;
                    if (target.tagName.toLowerCase() === 'a') {
                        event.preventDefault();
                        event.stopPropagation();
                        Electron.getRemote().shell.openExternal((target as any).href);
                    }
                }
            });
        }
    }

    start() {
        if (Electron.isAvailable()) {
            this.render.addClass(this.document.body, 'electron');

            const remote = Electron.getRemote();

            this.setPlatform(remote.process.platform);
        } else {
            this.setPlatform('web');
        }

        if (this.themeDetection) {
            let overwrittenDarkMode = this.storage.getItem('duiApp/darkMode');
            if (overwrittenDarkMode) {
                this.setDarkMode(JSON.parse(overwrittenDarkMode));
            } else {
                this.setDarkMode();
            }

            if ('undefined' !== typeof window) {
                const mm = window.matchMedia('(prefers-color-scheme: dark)');
                const setTheme = () => {
                    if (!this.themeDetection) return;
                    if (this.storage.getItem('duiApp/darkMode') === null) {
                        this.setAutoDarkMode();
                    }
                };
                if (mm.addEventListener) {
                    mm.addEventListener('change', setTheme);
                } else {
                    //ios
                    mm.addListener(setTheme);
                }
            }
        }
    }

    setPlatform(platform: 'web' | 'darwin' | 'linux' | 'win32') {
        this.platform.set(platform);
        //deprecate these
        this.render.removeClass(this.document.body, 'platform-linux');
        this.render.removeClass(this.document.body, 'platform-darwin');
        this.render.removeClass(this.document.body, 'platform-win32');
        this.render.removeClass(this.document.body, 'platform-native');
        this.render.removeClass(this.document.body, 'platform-web');

        this.render.removeClass(this.document.body, 'dui-platform-linux');
        this.render.removeClass(this.document.body, 'dui-platform-darwin');
        this.render.removeClass(this.document.body, 'dui-platform-win32');
        this.render.removeClass(this.document.body, 'dui-platform-native');
        this.render.removeClass(this.document.body, 'dui-platform-web');

        if (this.platform() !== 'web') {
            this.render.addClass(this.document.body, 'platform-native'); //todo: deprecate
            this.render.addClass(this.document.body, 'dui-platform-native');
        }
        this.render.addClass(this.document.body, 'platform-' + platform); //todo: deprecate
        this.render.addClass(this.document.body, 'dui-platform-' + platform);
    }

    getPlatform(): string {
        return this.platform();
    }

    isDarkMode(): boolean {
        return this.darkMode() === true;
    }

    setAutoDarkMode(): void {
        this.setDarkMode();
    }

    get theme(): 'auto' | 'light' | 'dark' {
        if (this.isDarkModeOverwritten()) {
            return this.isDarkMode() ? 'dark' : 'light';
        }

        return 'auto';
    }

    set theme(theme: 'auto' | 'light' | 'dark') {
        if (theme === 'auto') {
            this.setAutoDarkMode();
            return;
        }

        this.setDarkMode(theme === 'dark');
    }

    isDarkModeOverwritten(): boolean {
        return this.storage.getItem('duiApp/darkMode') !== null;
    }

    setGlobalDarkMode(darkMode: boolean): void {
        if (Electron.isAvailable()) {
            const remote = Electron.getRemote();
            for (const win of remote.BrowserWindow.getAllWindows()) {
                win.webContents.executeJavaScript(`DuiApp.setDarkMode(${darkMode})`);
            }
        }
    }

    getVibrancy(): 'ultra-dark' | 'light' {
        return this.darkMode() ? 'ultra-dark' : 'light';
    }

    disableThemeDetection() {
        this.render.removeClass(this.document.body, 'dui-theme-dark');
        this.render.removeClass(this.document.body, 'dui-theme-light');
        this.themeDetection = false;
    }

    setDarkMode(darkMode?: boolean) {
        if (darkMode === undefined) {
            this.darkMode.set(this.isPreferDarkColorSchema());
            this.storage.removeItem('duiApp/darkMode');
        } else {
            this.storage.setItem('duiApp/darkMode', JSON.stringify(darkMode));
            this.darkMode.set(darkMode);
        }

        if (this.windowRegistry) {
            for (const win of this.windowRegistry.getAllElectronWindows()) {
                win.setVibrancy(this.getVibrancy());
            }
        }

        this.render.removeClass(this.document.body, 'dui-theme-dark');
        this.render.removeClass(this.document.body, 'dui-theme-light');
        this.render.addClass(this.document.body, this.darkMode() ? 'dui-theme-dark' : 'dui-theme-light');

        if ('undefined' !== typeof window) window.dispatchEvent(new Event('theme-changed'));
    }

    protected isPreferDarkColorSchema() {
        if ('undefined' === typeof window) return true;
        return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
}
