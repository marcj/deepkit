import { ReflectionKind, Type } from '@deepkit/type';

export type FakerDataType = 'string' | 'date' | 'number' | 'boolean' | 'any';

export type FakerTypes = Record<string, {
    example: any,
    type: FakerDataType
}>;

export function getType(v: any): FakerDataType {
    if ('string' === typeof v) return 'string';
    if ('number' === typeof v) return 'number';
    if ('boolean' === typeof v) return 'boolean';
    if (v instanceof Date) return 'date';
    return 'any';
}

export function findFakerForName(types: FakerTypes, name: string, type: FakerDataType): string | undefined {
    for (const [fakeName, info] of Object.entries(types)) {
        if (info.type !== type) continue;
        const [p1, p2] = fakeName.toLowerCase().split('.');
        if (p2 && p2.includes(name)) return fakeName;
        if (p2 && name.includes(p2)) return fakeName;
    }
    return undefined;
}

export function findFaker(types: FakerTypes, propertyName: string, type: Type): string {
    const name = propertyName.toLowerCase();

    if (type.kind === ReflectionKind.class && type.classType === Date) {
        if (name.includes('birthdate')) return 'date.past';
        if (name.endsWith('ed')) return 'date.past';

        return 'date.future';
    } else if (type.kind === ReflectionKind.number || type.kind === ReflectionKind.bigint) {
        return findFakerForName(types, name, 'number') || 'random.number';
    } else if (type.kind === ReflectionKind.boolean) {
        return 'random.boolean';
    } else if (type.kind === ReflectionKind.string) {
        if (name.includes('first')) return 'name.firstName';
        if (name.includes('last')) return 'name.lastName';
        if (name.includes('iban')) return 'finance.iban';
        if (name.includes('bic')) return 'finance.bic';
        if (name.includes('name')) return 'internet.userName';
        if (name.includes('image')) return 'image.imageUrl';
        if (name.includes('mobile')) return 'phone.phoneNumber';
        if (name.includes('phone')) return 'phone.phoneNumber';

        return findFakerForName(types, name, 'string') || 'random.alphaNumeric';
    }

    return '';
}
