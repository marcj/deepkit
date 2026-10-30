import { Component, provideZonelessChangeDetection } from '@angular/core';
import { expect, test } from '@jest/globals';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';

TestBed.initTestEnvironment(
    BrowserTestingModule,
    platformBrowserTesting(),
    {
        errorOnUnknownElements: true,
        errorOnUnknownProperties: true,
    },
);

@Component({
    template: `Hi there`,
})
class ComponentA {
}

test('renders a component', () => {
    TestBed.configureTestingModule({
        providers: [provideZonelessChangeDetection()],
    });
    const fixture = TestBed.createComponent(ComponentA);
    expect(fixture.nativeElement.textContent).toBe('Hi there');
});
