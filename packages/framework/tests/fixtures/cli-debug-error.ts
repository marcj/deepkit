// Run as a separate process by debug-shutdown.spec.ts: a failing command with debug enabled.
import { App } from '@deepkit/app';
import { FrameworkModule } from '@deepkit/framework';

const app = new App({ imports: [new FrameworkModule({ debug: true, varPath: process.env.DK_DEBUG_VAR_PATH! })] });
app.command('fail', () => {
    throw new Error('visible error from the command');
});
void app.run();
