import { BootstrapContext, bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { config } from './app/app.config.server';
import { mergeApplicationConfig } from '@angular/core';

export { platformServer } from '@angular/platform-server';
export { Router } from '@angular/router';

// the server passes a BootstrapContext with the platform of the current request
export const bootstrap = (context: BootstrapContext) => {
    return bootstrapApplication(AppComponent, mergeApplicationConfig(config, {
        providers: [
        ],
    }), context);
};

export default bootstrap;
