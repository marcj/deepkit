import { Component, ElementRef, OnInit, signal } from '@angular/core';
import { ButtonComponent, DuiStyleComponent, WindowComponent, WindowContentComponent } from '@deepkit/desktop-ui';
import { RouterOutlet } from '@angular/router';
import { RpcCollector } from './collector';

declare var chrome: any;

@Component({
    selector: 'app-root',
    styles: `
      ::ng-deep html,
      ::ng-deep body {
        height: 100%;
        padding: 0;
        margin: 0;
      }

      .center {
        height: 100%;
        display: flex;
        justify-content: center;
        align-items: center;
      }
    `,
    template: `
      <dui-style normalize-style />
      <dui-window>
        <dui-window-content class="no-padding text-selection">
          @switch (status()) {
            @case ('pending') {
              <div class="center">
                <div>Loading...</div>
              </div>
            }
            @case ('no-permission') {
              <div class="center">
                <dui-button (click)="request()">Request permission</dui-button>
              </div>
            }
            @case ('reload-needed') {
              <div class="center">
                <div>Permission granted. Please reload the page to enable injecting into website data.</div>
              </div>
            }
            @case ('ready') {
              <router-outlet></router-outlet>
            }
          }
        </dui-window-content>
      </dui-window>
    `,
    imports: [
        RouterOutlet,
        WindowComponent,
        WindowContentComponent,
        ButtonComponent,
        DuiStyleComponent,
    ],
    styleUrls: ['./app.component.scss'],
})
export class AppComponent implements OnInit {
    status = signal<'pending' | 'no-permission' | 'checking' | 'reload-needed' | 'ready'>('pending');

    constructor(
        public host: ElementRef<HTMLElement>,
        private collector: RpcCollector,
    ) {
    }

    checkCommunication() {
        this.status.set('checking');
        const port = chrome.runtime.connect({
            name: `${chrome.devtools.inspectedWindow.tabId}`,
        });
        port.postMessage({ type: 'ping' });
        port.onMessage.addListener((message: any) => {
            if (message.type === 'pong') {
                this.status.set('ready');
                this.collector.start(port);
            }
        });
        port.onDisconnect.addListener(() => {
            console.log('ping port disconnected');
            setTimeout(() => {
                this.checkCommunication();
            }, 1000);
            if (this.status() === 'checking') {
                this.status.set('reload-needed');
            }
        });
    }

    registerContentScript(origin: string) {
        chrome.scripting.getRegisteredContentScripts((scripts: any[]) => {
            console.log('scripts', scripts);
            const alreadyRegistered = scripts.find(s => s.id === 'deepkit-devtools-' + origin);
            if (alreadyRegistered) {
                this.checkCommunication();
                console.log('Content script already registered for', origin);
                return;
            }

            chrome.scripting.registerContentScripts([{
                id: 'deepkit-devtools-' + origin,
                matches: [origin + '/*'],
                js: ['content.js'],
                runAt: 'document_start',
            }], () => {
                if (chrome.runtime.lastError) {
                    console.error('Failed to register content script:', chrome.runtime.lastError);
                } else {
                    console.log('Content script registered for', origin);
                }
            });
            this.checkCommunication();
        });
    }

    ngOnInit() {
        chrome.devtools.inspectedWindow.eval('window.location.origin', (origin: string) => {
            chrome.permissions.contains({
                permissions: ['scripting'],
                origins: [origin + '/*'],
            }, (granted: boolean) => {
                console.log('permission request', granted);
                if (granted) {
                    this.registerContentScript(origin);
                } else {
                    this.status.set('no-permission');
                }
            });
        });
    }

    request() {
        chrome.devtools.inspectedWindow.eval('window.location.origin', (origin: string) => {
            chrome.permissions.contains({
                permissions: ['scripting'],
                origins: [origin + '/*'],
            }, (granted: boolean) => {
                console.log('permission request', granted);
                if (granted) {
                    this.registerContentScript(origin);
                } else {
                    chrome.permissions.request({
                        permissions: ['scripting'],
                        origins: [origin + '/*'],
                    }, (granted: any) => {
                        console.log('permission request', origin, granted);
                        if (granted) {
                            this.registerContentScript(origin);
                        } else {
                            this.status.set('no-permission');
                        }
                    });
                }
            });
        });
    }
}
