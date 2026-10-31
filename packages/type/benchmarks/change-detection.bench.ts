/**
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */
import { BenchSuite } from '@deepkit/bench';
import {
    AutoIncrement,
    buildChanges,
    createSnapshot,
    entity,
    getChangeDetector,
    getConverterForSnapshot,
    getPrimaryKeyExtractor,
    getPrimaryKeyHashGenerator,
    PrimaryKey,
    ReflectionClass,
} from '@deepkit/type';

/**
 * Change Detection benchmark - tests Deepkit's snapshot and change detection system
 *
 * These are PUBLIC APIs from @deepkit/type used by the ORM for:
 * 1. createSnapshot() - creating snapshots of objects
 * 2. getChangeDetector() - detecting changes between snapshots
 * 3. getPrimaryKeyExtractor() - extracting primary keys
 * 4. getPrimaryKeyHashGenerator() - hashing primary keys for identity map
 * 5. buildChanges() - building change objects for database updates
 */

// ============================================================================
// Small Entity - Simple entity with basic fields
// ============================================================================

@entity.name('SmallEntity')
class SmallEntity {
    id: number & PrimaryKey & AutoIncrement = 0;
    name: string = '';
    active: boolean = false;
    count: number = 0;
}

// ============================================================================
// Medium Entity - Entity with more fields and nested data
// ============================================================================

class Address {
    street: string = '';
    city: string = '';
    zipCode: string = '';
    country: string = '';
}

@entity.name('MediumEntity')
class MediumEntity {
    id: number & PrimaryKey & AutoIncrement = 0;
    username: string = '';
    email: string = '';
    firstName: string = '';
    lastName: string = '';
    age: number = 0;
    active: boolean = true;
    createdAt: Date = new Date();
    updatedAt: Date = new Date();
    tags: string[] = [];
    address: Address = new Address();
    metadata: { [key: string]: string } = {};
}

// ============================================================================
// Large Entity - Entity with many fields simulating a complex domain model
// ============================================================================

class OrderItem {
    productId: number = 0;
    productName: string = '';
    quantity: number = 0;
    unitPrice: number = 0;
    discount: number = 0;
}

class PaymentInfo {
    method: string = '';
    cardLast4: string = '';
    transactionId: string = '';
    amount: number = 0;
    currency: string = 'USD';
    status: string = 'pending';
}

class ShippingInfo {
    carrier: string = '';
    trackingNumber: string = '';
    estimatedDelivery: Date = new Date();
    address: Address = new Address();
    instructions: string = '';
}

@entity.name('LargeEntity')
class LargeEntity {
    id: number & PrimaryKey & AutoIncrement = 0;
    orderNumber: string = '';
    customerId: number = 0;
    customerEmail: string = '';
    customerName: string = '';
    status: string = 'pending';
    priority: number = 0;
    notes: string = '';
    internalNotes: string = '';
    createdAt: Date = new Date();
    updatedAt: Date = new Date();
    completedAt?: Date;
    cancelledAt?: Date;
    items: OrderItem[] = [];
    payment: PaymentInfo = new PaymentInfo();
    shipping: ShippingInfo = new ShippingInfo();
    billingAddress: Address = new Address();
    tags: string[] = [];
    metadata: { [key: string]: any } = {};
    discountCodes: string[] = [];
    subtotal: number = 0;
    taxAmount: number = 0;
    shippingCost: number = 0;
    totalAmount: number = 0;
    refundedAmount: number = 0;
    isGift: boolean = false;
    giftMessage: string = '';
}

// ============================================================================
// Test Data Creation
// ============================================================================

function createSmallEntity(): SmallEntity {
    const entity = new SmallEntity();
    entity.id = 1;
    entity.name = 'Test Entity';
    entity.active = true;
    entity.count = 42;
    return entity;
}

function createMediumEntity(): MediumEntity {
    const entity = new MediumEntity();
    entity.id = 1;
    entity.username = 'johndoe';
    entity.email = 'john.doe@example.com';
    entity.firstName = 'John';
    entity.lastName = 'Doe';
    entity.age = 30;
    entity.active = true;
    entity.createdAt = new Date('2024-01-01');
    entity.updatedAt = new Date('2024-06-15');
    entity.tags = ['premium', 'verified', 'active'];
    entity.address.street = '123 Main St';
    entity.address.city = 'New York';
    entity.address.zipCode = '10001';
    entity.address.country = 'USA';
    entity.metadata = { source: 'web', campaign: 'summer2024', referrer: 'google' };
    return entity;
}

function createLargeEntity(): LargeEntity {
    const entity = new LargeEntity();
    entity.id = 1;
    entity.orderNumber = 'ORD-2024-001234';
    entity.customerId = 5678;
    entity.customerEmail = 'customer@example.com';
    entity.customerName = 'Jane Smith';
    entity.status = 'processing';
    entity.priority = 2;
    entity.notes = 'Customer requested expedited shipping';
    entity.internalNotes = 'VIP customer, handle with care';
    entity.createdAt = new Date('2024-06-01');
    entity.updatedAt = new Date('2024-06-15');

    // Add order items
    for (let i = 0; i < 5; i++) {
        const item = new OrderItem();
        item.productId = 100 + i;
        item.productName = `Product ${i + 1}`;
        item.quantity = i + 1;
        item.unitPrice = 29.99 + i * 10;
        item.discount = i * 5;
        entity.items.push(item);
    }

    entity.payment.method = 'credit_card';
    entity.payment.cardLast4 = '4242';
    entity.payment.transactionId = 'txn_abc123xyz';
    entity.payment.amount = 249.95;
    entity.payment.currency = 'USD';
    entity.payment.status = 'completed';

    entity.shipping.carrier = 'FedEx';
    entity.shipping.trackingNumber = '1234567890';
    entity.shipping.estimatedDelivery = new Date('2024-06-20');
    entity.shipping.address.street = '456 Oak Ave';
    entity.shipping.address.city = 'Los Angeles';
    entity.shipping.address.zipCode = '90001';
    entity.shipping.address.country = 'USA';
    entity.shipping.instructions = 'Leave at front door';

    entity.billingAddress.street = '789 Elm St';
    entity.billingAddress.city = 'Chicago';
    entity.billingAddress.zipCode = '60601';
    entity.billingAddress.country = 'USA';

    entity.tags = ['priority', 'expedited', 'gift', 'insured'];
    entity.metadata = { source: 'mobile-app', version: '2.1.0', deviceId: 'abc123' };
    entity.discountCodes = ['SUMMER20', 'LOYALTY10'];
    entity.subtotal = 219.95;
    entity.taxAmount = 19.8;
    entity.shippingCost = 10.2;
    entity.totalAmount = 249.95;
    entity.refundedAmount = 0;
    entity.isGift = true;
    entity.giftMessage = 'Happy Birthday!';

    return entity;
}

export default async function () {
    const suite = new BenchSuite('type/change-detection');

    // Get reflection classes
    const smallSchema = ReflectionClass.from(SmallEntity);
    const mediumSchema = ReflectionClass.from(MediumEntity);
    const largeSchema = ReflectionClass.from(LargeEntity);

    // Create test entities
    const smallEntity = createSmallEntity();
    const mediumEntity = createMediumEntity();
    const largeEntity = createLargeEntity();

    // ========================================================================
    // createSnapshot() - Create snapshots of entities
    // ========================================================================

    const smallSnapshotFn = getConverterForSnapshot(smallSchema);
    const mediumSnapshotFn = getConverterForSnapshot(mediumSchema);
    const largeSnapshotFn = getConverterForSnapshot(largeSchema);

    // Sanity check
    const testSnapshot = smallSnapshotFn(smallEntity);
    if (testSnapshot.id !== 1 || testSnapshot.name !== 'Test Entity') {
        throw new Error('Snapshot should capture entity fields correctly');
    }

    suite.add('createSnapshot (small entity)', () => {
        createSnapshot(smallSchema, smallEntity);
    });

    suite.add('createSnapshot (medium entity)', () => {
        createSnapshot(mediumSchema, mediumEntity);
    });

    suite.add('createSnapshot (large entity)', () => {
        createSnapshot(largeSchema, largeEntity);
    });

    // ========================================================================
    // Change Detection - No changes (common case in read-heavy workloads)
    // ========================================================================

    const smallDetector = getChangeDetector(smallSchema);
    const mediumDetector = getChangeDetector(mediumSchema);
    const largeDetector = getChangeDetector(largeSchema);

    // Create snapshots that represent "last known state"
    const smallSnapshotOriginal = smallSnapshotFn(smallEntity);
    const mediumSnapshotOriginal = mediumSnapshotFn(mediumEntity);
    const largeSnapshotOriginal = largeSnapshotFn(largeEntity);

    // Current snapshot (same as original = no changes)
    const smallSnapshotCurrent = smallSnapshotFn(smallEntity);
    const mediumSnapshotCurrent = mediumSnapshotFn(mediumEntity);
    const largeSnapshotCurrent = largeSnapshotFn(largeEntity);

    // Sanity check: no changes should be detected
    const noChanges = smallDetector(smallSnapshotOriginal, smallSnapshotCurrent, smallEntity);
    if (noChanges !== undefined && !noChanges.empty) {
        throw new Error('No changes should be detected when snapshots are identical');
    }

    suite.add('detect changes (no changes, small)', () => {
        smallDetector(smallSnapshotOriginal, smallSnapshotCurrent, smallEntity);
    });

    suite.add('detect changes (no changes, medium)', () => {
        mediumDetector(mediumSnapshotOriginal, mediumSnapshotCurrent, mediumEntity);
    });

    suite.add('detect changes (no changes, large)', () => {
        largeDetector(largeSnapshotOriginal, largeSnapshotCurrent, largeEntity);
    });

    // ========================================================================
    // Change Detection - With changes (update scenarios)
    // ========================================================================

    // Create modified entities
    const smallModified = createSmallEntity();
    smallModified.name = 'Modified Name';
    smallModified.count = 100;

    const mediumModified = createMediumEntity();
    mediumModified.email = 'modified@example.com';
    mediumModified.age = 35;
    mediumModified.tags = ['changed', 'updated'];

    const largeModified = createLargeEntity();
    largeModified.status = 'shipped';
    largeModified.notes = 'Order has been shipped';
    largeModified.totalAmount = 299.99;
    largeModified.items[0].quantity = 10;

    const smallSnapshotModified = smallSnapshotFn(smallModified);
    const mediumSnapshotModified = mediumSnapshotFn(mediumModified);
    const largeSnapshotModified = largeSnapshotFn(largeModified);

    // Sanity check: changes should be detected
    const withChanges = smallDetector(smallSnapshotOriginal, smallSnapshotModified, smallModified);
    if (!withChanges || withChanges.empty) {
        throw new Error('Changes should be detected when entity is modified');
    }
    if (!withChanges.$set || !('name' in withChanges.$set)) {
        throw new Error('Changed fields should be in $set');
    }

    suite.add('detect changes (with changes, small)', () => {
        smallDetector(smallSnapshotOriginal, smallSnapshotModified, smallModified);
    });

    suite.add('detect changes (with changes, medium)', () => {
        mediumDetector(mediumSnapshotOriginal, mediumSnapshotModified, mediumModified);
    });

    suite.add('detect changes (with changes, large)', () => {
        largeDetector(largeSnapshotOriginal, largeSnapshotModified, largeModified);
    });

    // ========================================================================
    // getPrimaryKeyExtractor() - Extract primary keys
    // ========================================================================

    const smallPkExtractor = getPrimaryKeyExtractor(smallSchema);
    const mediumPkExtractor = getPrimaryKeyExtractor(mediumSchema);
    const largePkExtractor = getPrimaryKeyExtractor(largeSchema);

    // Sanity check
    const pk = smallPkExtractor(smallSnapshotOriginal);
    if (pk.id !== 1) {
        throw new Error('Primary key extractor should extract correct id');
    }

    suite.add('extract primary key (small)', () => {
        smallPkExtractor(smallSnapshotOriginal);
    });

    suite.add('extract primary key (medium)', () => {
        mediumPkExtractor(mediumSnapshotOriginal);
    });

    suite.add('extract primary key (large)', () => {
        largePkExtractor(largeSnapshotOriginal);
    });

    // ========================================================================
    // getPrimaryKeyHashGenerator() - Generate PK hashes for identity map
    // ========================================================================

    const smallPkHasher = getPrimaryKeyHashGenerator(smallSchema);
    const mediumPkHasher = getPrimaryKeyHashGenerator(mediumSchema);
    const largePkHasher = getPrimaryKeyHashGenerator(largeSchema);

    // Sanity check
    const hash1 = smallPkHasher(smallEntity);
    const hash2 = smallPkHasher(smallEntity);
    if (hash1 !== hash2) {
        throw new Error('Same entity should produce same hash');
    }
    if (typeof hash1 !== 'string' || hash1.length === 0) {
        throw new Error('Hash should be non-empty string');
    }

    suite.add('generate PK hash (small)', () => {
        smallPkHasher(smallEntity);
    });

    suite.add('generate PK hash (medium)', () => {
        mediumPkHasher(mediumEntity);
    });

    suite.add('generate PK hash (large)', () => {
        largePkHasher(largeEntity);
    });

    // ========================================================================
    // buildChanges() - Full change detection pipeline (snapshot + detect)
    // ========================================================================

    suite.add('buildChanges (no changes, small)', () => {
        buildChanges(smallSchema, smallSnapshotOriginal, smallEntity);
    });

    suite.add('buildChanges (no changes, medium)', () => {
        buildChanges(mediumSchema, mediumSnapshotOriginal, mediumEntity);
    });

    suite.add('buildChanges (no changes, large)', () => {
        buildChanges(largeSchema, largeSnapshotOriginal, largeEntity);
    });

    suite.add('buildChanges (with changes, small)', () => {
        buildChanges(smallSchema, smallSnapshotOriginal, smallModified);
    });

    suite.add('buildChanges (with changes, medium)', () => {
        buildChanges(mediumSchema, mediumSnapshotOriginal, mediumModified);
    });

    suite.add('buildChanges (with changes, large)', () => {
        buildChanges(largeSchema, largeSnapshotOriginal, largeModified);
    });

    return suite;
}
