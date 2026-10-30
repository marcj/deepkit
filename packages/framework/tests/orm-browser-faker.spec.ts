import { expect, test } from '@jest/globals';

import { findFaker, getType } from '@deepkit/orm-browser-api';
import { ReflectionClass, typeOf } from '@deepkit/type';

import { fakers } from '../src/orm-browser/faker.js';

function ibanValid(iban: string): boolean {
    const numeric = (iban.slice(4) + iban.slice(0, 4)).replace(/[A-Z]/g, c => String(c.charCodeAt(0) - 55));
    let remainder = 0;
    for (const digit of numeric) remainder = (remainder * 10 + Number(digit)) % 97;
    return remainder === 1;
}

test('all fakers generate values', () => {
    for (const [name, fake] of Object.entries(fakers)) {
        for (let i = 0; i < 20; i++) {
            const value = fake();
            expect(getType(value)).not.toBe('any');
            if (typeof value === 'string' && !name.startsWith('random.alpha') && name !== 'random.hexaDecimal') expect(value.length).toBeGreaterThan(0);
        }
    }
});

test('faker types', () => {
    expect(getType(fakers['date.past']())).toBe('date');
    expect(fakers['date.past']().getTime()).toBeLessThanOrEqual(Date.now());
    expect(fakers['date.future']().getTime()).toBeGreaterThanOrEqual(Date.now());
    expect(getType(fakers['random.number']())).toBe('number');
    expect(getType(fakers['random.boolean']())).toBe('boolean');
    expect(fakers['random.uuid']()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(fakers['internet.email']()).toMatch(/^[\w.+-]+@[\w.-]+\.\w+$/);
    expect(fakers['internet.ip']()).toMatch(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/);
    expect(fakers['finance.bic']()).toMatch(/^[A-Z]{4}DE[A-Z0-9]{2}$/);
    for (let i = 0; i < 100; i++) {
        const iban = fakers['finance.iban']();
        expect(iban).toMatch(/^DE\d{20}$/);
        expect(ibanValid(iban)).toBe(true);
    }
    expect(ibanValid('DE89370400440532013000')).toBe(true);
});

test('default fakers of the GUI exist', () => {
    interface User {
        id: number;
        firstName: string;
        lastName: string;
        username: string;
        iban: string;
        bic: string;
        image: string;
        phone: string;
        birthdate: Date;
        created: Date;
        validUntil: Date;
        active: boolean;
        somethingElse: string;
        email: string;
        city: string;
        port: number;
    }

    const types: any = {};
    for (const [name, fake] of Object.entries(fakers)) types[name] = { example: fake(), type: getType(fake()) };

    for (const property of ReflectionClass.from<User>().getProperties()) {
        expect(fakers[findFaker(types, property.name, property.type)]).toBeDefined();
    }
    expect(findFaker(types, 'email', typeOf<string>())).toBe('internet.email');
    expect(findFaker(types, 'city', typeOf<string>())).toBe('address.city');
});
