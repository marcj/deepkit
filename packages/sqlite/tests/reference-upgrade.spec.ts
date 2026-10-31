import { expect, test } from '@jest/globals';

import { Database } from '@deepkit/orm';
import { AutoIncrement, BackReference, PrimaryKey, Reference, entity } from '@deepkit/type';

import { SQLiteDatabaseAdapter } from '../src/sqlite-adapter.js';

@entity.name('upgrade_product')
class Product {
    id: number & PrimaryKey & AutoIncrement = 0;
    dependencies: Dependency[] & BackReference<{ mappedBy: 'product' }> = [];

    constructor(public title: string) {}
}

@entity.name('upgrade_variant')
class Variant {
    id: number & PrimaryKey & AutoIncrement = 0;

    constructor(
        public product: Product & Reference,
        public variant: Product & Reference,
    ) {}
}

@entity.name('upgrade_dependency')
class Dependency {
    id: number & PrimaryKey & AutoIncrement = 0;

    constructor(
        public product: Product & Reference,
        public dependsOn: Product & Reference,
    ) {}
}

test('a reference upgraded to a joined entity gets its joined back references, also when empty', async () => {
    const db = new Database(new SQLiteDatabaseAdapter(':memory:'), [Product, Variant, Dependency]);
    await db.migrate();
    const main = new Product('main');
    const a = new Product('a');
    const b = new Product('b');
    await db.persist(main, a, b);
    // a depends on b: joining a.dependencies creates a reference to b, then b itself is joined as variant
    await db.persist(new Dependency(a, b), new Variant(main, a), new Variant(main, b));

    const variants = await db.query(Variant).useInnerJoinWith('variant').joinWith('dependencies').end().filter({ product: main }).orderBy('id').find();
    expect(variants.map(v => v.variant.title)).toEqual(['a', 'b']);
    expect(variants[0].variant.dependencies.map(v => v.dependsOn.id)).toEqual([b.id]);
    expect(variants[1].variant.dependencies).toEqual([]);
    // the reference held by a's dependency is the same, now complete instance
    expect(variants[0].variant.dependencies[0].dependsOn).toBe(variants[1].variant);
});
