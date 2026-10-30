import { expect, jest, test } from '@jest/globals';
import { transpile } from './utils.js';

// isJSDocImportTag was added in TypeScript 5.5. Without it the transformer crashed on every file
// with "isJSDocImportTag is not a function", although typescript is a peer dependency with any version.
jest.mock('typescript', () => {
    const actual = jest.requireActual<typeof import('typescript')>('typescript');
    return { ...actual, default: { ...actual, isJSDocImportTag: undefined }, isJSDocImportTag: undefined };
});

test('works with TypeScript versions without isJSDocImportTag', () => {
    const res = transpile({
        'app': `
            import { Logger } from './logger';
            function fn(logger: Logger) {}
        `,
        'logger': `export class Logger {}`
    });

    expect(res.app).toContain('() => logger_1.Logger');
    expect(res.logger).toContain('Logger.__type =');
});
