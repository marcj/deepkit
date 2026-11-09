import { expect, test } from '@jest/globals';

import { getPermanentRedirect, isMalformedUrl } from '@app/server/controller/seo.controller';

test('double slashes redirect to the collapsed path and keep the query', () => {
    expect(getPermanentRedirect('/en/documentation//rpc')).toBe('/en/documentation/rpc');
    expect(getPermanentRedirect('/en//documentation///rpc?a=1')).toBe('/en/documentation/rpc?a=1');
});

test('a double slash at the start can not redirect to another host', () => {
    expect(getPermanentRedirect('//example.com/page')).toBe('/example.com/page');
    expect(getPermanentRedirect('///example.com')).toBe('/example.com');
});

test('api paths are not redirected', () => {
    expect(getPermanentRedirect('/api//v1/main')).toBe(undefined);
});

test('a slash in the query is no double slash', () => {
    expect(getPermanentRedirect('/benchmarks?next=//a')).toBe(undefined);
});

test('malformed percent-encoding', () => {
    expect(isMalformedUrl('/%')).toBe(true);
    expect(isMalformedUrl('/en/documentation/%E0%A4%A')).toBe(true);
    expect(isMalformedUrl('/en/documentation/rpc')).toBe(false);
    expect(isMalformedUrl('/search?q=%')).toBe(false);
    expect(isMalformedUrl('/a%20b')).toBe(false);
});

test('the CLI documentation moved to App', () => {
    expect(getPermanentRedirect('/en/documentation/cli')).toBe('/en/documentation/app');
    expect(getPermanentRedirect('/de/documentation/cli/getting-started')).toBe('/de/documentation/app');
    expect(getPermanentRedirect('/en/documentation/cli/events')).toBe('/en/documentation/app/events');
    expect(getPermanentRedirect('/en/documentation/cli.md')).toBe('/en/documentation/app.md');
});
