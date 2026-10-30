// Run as a separate process by debug-shutdown.spec.ts: a failing command with debug enabled.
import { App } from '@deepkit/app';
import { FrameworkModule } from '@deepkit/framework';

const app = new App({ imports: [new FrameworkModule({ debug: true, varPath: process.argv[3] })] });
app.command('fail', () => {
    throw new Error('visible error from the command');
});
void app.run();
