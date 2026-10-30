import { TestBed } from '@angular/core/testing';
import { InputComponent } from './input.component';

describe('InputComponent', () => {
    async function inputValue(type: string, value: any): Promise<string> {
        const fixture = TestBed.createComponent(InputComponent);
        fixture.componentRef.setInput('type', type);
        fixture.componentInstance.value.set(value);
        fixture.detectChanges();
        await fixture.whenStable(); // ngModel writes asynchronously
        return (fixture.nativeElement.querySelector('input') as HTMLInputElement).value;
    }

    it('writes datetime-local values with a 24-hour clock', async () => {
        // was formatted with hh (12-hour clock, no AM/PM), so 15:04 became 03:04
        expect(await inputValue('datetime-local', new Date(2026, 0, 2, 15, 4, 5))).toBe('2026-01-02T15:04:05');
    });

    it('writes date values', async () => {
        expect(await inputValue('date', new Date(2026, 0, 2, 15, 4, 5))).toBe('2026-01-02');
    });

    it('formats with LOCALE_ID, not the browser language', async () => {
        // the browser language (here de-DE) has no registered locale data, formatDate used to throw NG0701 with it
        const language = Object.getOwnPropertyDescriptor(Navigator.prototype, 'language')!;
        Object.defineProperty(Navigator.prototype, 'language', { configurable: true, get: () => 'de-DE' });
        try {
            expect(await inputValue('date', new Date(2026, 0, 2))).toBe('2026-01-02');
        } finally {
            Object.defineProperty(Navigator.prototype, 'language', language);
        }
    });
});
