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
import { Excluded, deserialize, serialize } from '@deepkit/type';

/**
 * Serialization benchmark - compares Deepkit type serialization performance
 *
 * This benchmark tests multiple scenarios:
 * 1. Small model - Simple class with basic types
 * 2. Medium model - Complex class with nested objects, enums, dates, and excluded properties
 * 3. Large model - 50+ properties simulating a real-world entity
 * 4. Array benchmarks - Arrays of 100, 1000, 10000 items
 * 5. Deeply nested objects - 4-5 levels of nesting
 * 6. Union types - Literal unions with discriminators
 * 7. Special types - Date, Map, Set, BigInt
 * 8. Circular/self-referencing structures
 */

// ============================================================================
// Small Model - Basic serialization test
// ============================================================================

class SmallModel {
    ready?: boolean;
    tags: string[] = [];
    priority: number = 0;

    constructor(
        public id: number,
        public name: string,
    ) {}
}

const smallPlainData = {
    name: 'name',
    id: 2,
    tags: ['a', 'b', 'c'],
    priority: 5,
    ready: true,
};

// ============================================================================
// Medium Model - Complex serialization test with nested types
// ============================================================================

class SubModel {
    age?: number;
    constructorUsed = false;

    constructor(public label: string) {
        this.constructorUsed = true;
    }
}

enum Plan {
    DEFAULT,
    PRO,
    ENTERPRISE,
}

class MediumModel {
    type: number = 0;
    yesNo: boolean = false;
    plan: Plan = Plan.DEFAULT;
    created: Date = new Date();
    types: string[] = [];
    children: SubModel[] = [];
    childrenMap: { [key: string]: SubModel } = {};
    notMapped: { [key: string]: any } = {};
    excluded: string & Excluded = 'default';
    excludedForPlain: string & Excluded<'json'> = 'excludedForPlain';

    constructor(public name: string) {}
}

const mediumPlainData = {
    name: 'name',
    type: 2,
    plan: Plan.ENTERPRISE,
    children: [{ label: 'label' }],
    childrenMap: { sub: { label: 'label' } },
    types: ['a', 'b', 'c'],
};

// ============================================================================
// Large Model - 50+ properties simulating a complex real-world entity
// ============================================================================

enum UserStatus {
    PENDING,
    ACTIVE,
    SUSPENDED,
    DELETED,
}

enum Role {
    USER,
    MODERATOR,
    ADMIN,
    SUPER_ADMIN,
}

class Address {
    constructor(
        public street: string = '',
        public city: string = '',
        public state: string = '',
        public zipCode: string = '',
        public country: string = '',
        public isDefault: boolean = false,
    ) {}
}

class PaymentMethod {
    constructor(
        public type: string = '',
        public lastFour: string = '',
        public expiryMonth: number = 0,
        public expiryYear: number = 0,
        public isDefault: boolean = false,
    ) {}
}

class Preferences {
    theme: string = 'light';
    language: string = 'en';
    timezone: string = 'UTC';
    emailNotifications: boolean = true;
    pushNotifications: boolean = true;
    smsNotifications: boolean = false;
    newsletter: boolean = false;
    marketingEmails: boolean = false;
}

class LargeModel {
    // Identity
    id: number = 0;
    uuid: string = '';
    username: string = '';
    email: string = '';
    emailVerified: boolean = false;
    phone: string = '';
    phoneVerified: boolean = false;

    // Profile
    firstName: string = '';
    lastName: string = '';
    displayName: string = '';
    avatar: string = '';
    bio: string = '';
    website: string = '';
    birthDate: Date = new Date();
    gender: string = '';

    // Status
    status: UserStatus = UserStatus.PENDING;
    role: Role = Role.USER;
    isActive: boolean = true;
    isVerified: boolean = false;
    isPremium: boolean = false;
    isBanned: boolean = false;

    // Timestamps
    createdAt: Date = new Date();
    updatedAt: Date = new Date();
    lastLoginAt: Date = new Date();
    lastActivityAt: Date = new Date();
    passwordChangedAt: Date = new Date();

    // Metrics
    loginCount: number = 0;
    failedLoginCount: number = 0;
    postCount: number = 0;
    commentCount: number = 0;
    likeCount: number = 0;
    followerCount: number = 0;
    followingCount: number = 0;
    reputationScore: number = 0;

    // Settings
    twoFactorEnabled: boolean = false;
    twoFactorMethod: string = '';
    sessionTimeout: number = 3600;
    maxSessions: number = 5;

    // Nested objects
    addresses: Address[] = [];
    paymentMethods: PaymentMethod[] = [];
    preferences: Preferences = new Preferences();

    // Tags and metadata
    tags: string[] = [];
    roles: string[] = [];
    permissions: string[] = [];
    metadata: { [key: string]: string } = {};

    constructor(public primaryKey: string = '') {}
}

const largePlainData = {
    primaryKey: 'user_123456',
    id: 123456,
    uuid: '550e8400-e29b-41d4-a716-446655440000',
    username: 'johndoe',
    email: 'john.doe@example.com',
    emailVerified: true,
    phone: '+1234567890',
    phoneVerified: true,
    firstName: 'John',
    lastName: 'Doe',
    displayName: 'John D.',
    avatar: 'https://example.com/avatars/johndoe.jpg',
    bio: 'Software developer passionate about TypeScript and open source.',
    website: 'https://johndoe.dev',
    birthDate: '1990-05-15T00:00:00.000Z',
    gender: 'male',
    status: UserStatus.ACTIVE,
    role: Role.ADMIN,
    isActive: true,
    isVerified: true,
    isPremium: true,
    isBanned: false,
    createdAt: '2020-01-15T10:30:00.000Z',
    updatedAt: '2024-01-20T15:45:00.000Z',
    lastLoginAt: '2024-01-20T14:00:00.000Z',
    lastActivityAt: '2024-01-20T15:30:00.000Z',
    passwordChangedAt: '2023-06-01T00:00:00.000Z',
    loginCount: 1543,
    failedLoginCount: 3,
    postCount: 234,
    commentCount: 1876,
    likeCount: 5432,
    followerCount: 12500,
    followingCount: 850,
    reputationScore: 45678,
    twoFactorEnabled: true,
    twoFactorMethod: 'authenticator',
    sessionTimeout: 7200,
    maxSessions: 10,
    addresses: [
        {
            street: '123 Main St',
            city: 'San Francisco',
            state: 'CA',
            zipCode: '94105',
            country: 'USA',
            isDefault: true,
        },
        { street: '456 Oak Ave', city: 'Los Angeles', state: 'CA', zipCode: '90001', country: 'USA', isDefault: false },
    ],
    paymentMethods: [
        { type: 'credit_card', lastFour: '4242', expiryMonth: 12, expiryYear: 2025, isDefault: true },
        { type: 'paypal', lastFour: '', expiryMonth: 0, expiryYear: 0, isDefault: false },
    ],
    preferences: {
        theme: 'dark',
        language: 'en-US',
        timezone: 'America/Los_Angeles',
        emailNotifications: true,
        pushNotifications: true,
        smsNotifications: false,
        newsletter: true,
        marketingEmails: false,
    },
    tags: ['developer', 'typescript', 'nodejs', 'react', 'graphql'],
    roles: ['user', 'moderator', 'content-creator'],
    permissions: ['read', 'write', 'delete', 'admin:users', 'admin:posts'],
    metadata: {
        referralCode: 'ABC123',
        signupSource: 'organic',
        experimentGroup: 'beta-features',
    },
};

// ============================================================================
// Array Benchmarks - Test arrays of different sizes
// ============================================================================

interface ArrayItem {
    id: number;
    name: string;
    value: number;
    active: boolean;
    tags: string[];
}

function generateArrayData(size: number): ArrayItem[] {
    const items: ArrayItem[] = [];
    for (let i = 0; i < size; i++) {
        items.push({
            id: i,
            name: `Item ${i}`,
            value: Math.random() * 1000,
            active: i % 2 === 0,
            tags: ['tag1', 'tag2', 'tag3'],
        });
    }
    return items;
}

const array100Data = generateArrayData(100);
const array1000Data = generateArrayData(1000);
const array10000Data = generateArrayData(10000);

// ============================================================================
// Deeply Nested Objects - 5 levels deep
// ============================================================================

interface Level5 {
    value: string;
    count: number;
}

interface Level4 {
    name: string;
    items: Level5[];
}

interface Level3 {
    id: number;
    config: Level4;
}

interface Level2 {
    label: string;
    children: Level3[];
}

interface Level1 {
    root: string;
    metadata: { [key: string]: string };
    nested: Level2;
}

interface DeeplyNestedModel {
    version: number;
    timestamp: Date;
    data: Level1;
}

const deeplyNestedPlainData = {
    version: 1,
    timestamp: '2024-01-20T12:00:00.000Z',
    data: {
        root: 'root-value',
        metadata: { key1: 'value1', key2: 'value2', key3: 'value3' },
        nested: {
            label: 'level-2',
            children: [
                {
                    id: 1,
                    config: {
                        name: 'config-1',
                        items: [
                            { value: 'item-1-1', count: 10 },
                            { value: 'item-1-2', count: 20 },
                            { value: 'item-1-3', count: 30 },
                        ],
                    },
                },
                {
                    id: 2,
                    config: {
                        name: 'config-2',
                        items: [
                            { value: 'item-2-1', count: 100 },
                            { value: 'item-2-2', count: 200 },
                        ],
                    },
                },
            ],
        },
    },
};

// ============================================================================
// Union Types - Discriminated unions
// ============================================================================

interface TextMessage {
    type: 'text';
    content: string;
    formatting?: 'plain' | 'markdown' | 'html';
}

interface ImageMessage {
    type: 'image';
    url: string;
    width: number;
    height: number;
    alt?: string;
}

interface VideoMessage {
    type: 'video';
    url: string;
    duration: number;
    thumbnail: string;
}

interface FileMessage {
    type: 'file';
    url: string;
    filename: string;
    size: number;
    mimeType: string;
}

type Message = TextMessage | ImageMessage | VideoMessage | FileMessage;

interface Conversation {
    id: string;
    participants: string[];
    messages: Message[];
}

const unionPlainData: Conversation = {
    id: 'conv_123',
    participants: ['user1', 'user2', 'user3'],
    messages: [
        { type: 'text', content: 'Hello everyone!', formatting: 'plain' },
        { type: 'image', url: 'https://example.com/photo.jpg', width: 800, height: 600, alt: 'A photo' },
        { type: 'text', content: 'Check out this video:', formatting: 'markdown' },
        {
            type: 'video',
            url: 'https://example.com/video.mp4',
            duration: 120,
            thumbnail: 'https://example.com/thumb.jpg',
        },
        {
            type: 'file',
            url: 'https://example.com/doc.pdf',
            filename: 'document.pdf',
            size: 1024000,
            mimeType: 'application/pdf',
        },
        { type: 'text', content: 'Thanks for sharing!', formatting: 'plain' },
    ],
};

// ============================================================================
// Special Types - Date, Map, Set, BigInt
// ============================================================================

interface SpecialTypesModel {
    // Date
    createdAt: Date;
    updatedAt: Date;
    dates: Date[];

    // Map
    stringMap: Map<string, string>;
    numberMap: Map<string, number>;

    // Set
    stringSet: Set<string>;
    numberSet: Set<number>;

    // BigInt
    bigValue: bigint;
    bigValues: bigint[];
}

const specialTypesPlainData = {
    createdAt: '2024-01-15T10:30:00.000Z',
    updatedAt: '2024-01-20T15:45:00.000Z',
    dates: ['2024-01-01T00:00:00.000Z', '2024-02-01T00:00:00.000Z', '2024-03-01T00:00:00.000Z'],
    stringMap: [
        ['key1', 'value1'],
        ['key2', 'value2'],
        ['key3', 'value3'],
    ],
    numberMap: [
        ['count', 100],
        ['total', 500],
        ['average', 50],
    ],
    stringSet: ['unique1', 'unique2', 'unique3'],
    numberSet: [1, 2, 3, 5, 8, 13, 21],
    bigValue: '9007199254740993',
    bigValues: ['1', '2', '9007199254740993', '9007199254740994'],
};

// ============================================================================
// Circular/Self-Referencing Structures
// ============================================================================

class TreeNode {
    id: number = 0;
    name: string = '';
    children: TreeNode[] = [];

    constructor(id?: number, name?: string) {
        if (id !== undefined) this.id = id;
        if (name !== undefined) this.name = name;
    }
}

class LinkedListNode {
    value: number = 0;
    next?: LinkedListNode;

    constructor(value?: number) {
        if (value !== undefined) this.value = value;
    }
}

class Category {
    id: number = 0;
    name: string = '';
    parent?: Category;
    subcategories: Category[] = [];

    constructor(id?: number, name?: string) {
        if (id !== undefined) this.id = id;
        if (name !== undefined) this.name = name;
    }
}

const treePlainData = {
    id: 1,
    name: 'root',
    children: [
        {
            id: 2,
            name: 'child-1',
            children: [
                { id: 4, name: 'grandchild-1', children: [] },
                { id: 5, name: 'grandchild-2', children: [] },
            ],
        },
        {
            id: 3,
            name: 'child-2',
            children: [
                {
                    id: 6,
                    name: 'grandchild-3',
                    children: [{ id: 7, name: 'great-grandchild-1', children: [] }],
                },
            ],
        },
    ],
};

const linkedListPlainData = {
    value: 1,
    next: {
        value: 2,
        next: {
            value: 3,
            next: {
                value: 4,
                next: {
                    value: 5,
                },
            },
        },
    },
};

const categoryPlainData = {
    id: 1,
    name: 'Electronics',
    subcategories: [
        {
            id: 2,
            name: 'Computers',
            subcategories: [
                { id: 4, name: 'Laptops', subcategories: [] },
                { id: 5, name: 'Desktops', subcategories: [] },
            ],
        },
        {
            id: 3,
            name: 'Phones',
            subcategories: [
                { id: 6, name: 'Smartphones', subcategories: [] },
                { id: 7, name: 'Accessories', subcategories: [] },
            ],
        },
    ],
};

export default async function () {
    const suite = new BenchSuite('type/serialization');

    // ========================================================================
    // Small Model Benchmarks
    // ========================================================================

    // Deserialize: plain object -> class instance
    const smallInstance = deserialize<SmallModel>(smallPlainData);

    // Sanity checks
    if (!(smallInstance instanceof SmallModel)) {
        throw new Error('Small model deserialization should return SmallModel instance');
    }
    const smallSerialized = serialize<SmallModel>(smallInstance);
    if (smallSerialized instanceof SmallModel) {
        throw new Error('Serialization should return plain object, not class instance');
    }

    suite.add('deepkit small deserialize', () => {
        deserialize<SmallModel>(smallPlainData);
    });

    suite.add('deepkit small serialize', () => {
        serialize<SmallModel>(smallInstance);
    });

    // ========================================================================
    // Medium Model Benchmarks
    // ========================================================================

    // Deserialize: plain object -> class instance
    const mediumInstance = deserialize<MediumModel>(mediumPlainData);

    // Sanity checks
    if (!(mediumInstance instanceof MediumModel)) {
        throw new Error('Medium model deserialization should return MediumModel instance');
    }
    if (mediumInstance.children.length === 0 || !(mediumInstance.children[0] instanceof SubModel)) {
        throw new Error('Nested SubModel should be deserialized correctly');
    }

    suite.add('deepkit medium deserialize', () => {
        deserialize<MediumModel>(mediumPlainData);
    });

    suite.add('deepkit medium serialize', () => {
        serialize<MediumModel>(mediumInstance);
    });

    // ========================================================================
    // Large Model Benchmarks (50+ properties)
    // ========================================================================

    const largeInstance = deserialize<LargeModel>(largePlainData);

    // Sanity checks
    if (!(largeInstance instanceof LargeModel)) {
        throw new Error('Large model deserialization should return LargeModel instance');
    }
    if (!(largeInstance.createdAt instanceof Date)) {
        throw new Error('Large model Date fields should be deserialized correctly');
    }
    if (largeInstance.addresses.length !== 2 || !(largeInstance.addresses[0] instanceof Address)) {
        throw new Error('Large model nested Address array should be deserialized correctly');
    }
    if (!(largeInstance.preferences instanceof Preferences)) {
        throw new Error('Large model nested Preferences should be deserialized correctly');
    }

    suite.add('deepkit large deserialize', () => {
        deserialize<LargeModel>(largePlainData);
    });

    suite.add('deepkit large serialize', () => {
        serialize<LargeModel>(largeInstance);
    });

    // ========================================================================
    // Array Benchmarks
    // ========================================================================

    const array100Instance = deserialize<ArrayItem[]>(array100Data);
    const array1000Instance = deserialize<ArrayItem[]>(array1000Data);
    const array10000Instance = deserialize<ArrayItem[]>(array10000Data);

    // Sanity checks
    if (array100Instance.length !== 100) {
        throw new Error('Array 100 should have 100 items');
    }
    if (array1000Instance.length !== 1000) {
        throw new Error('Array 1000 should have 1000 items');
    }
    if (array10000Instance.length !== 10000) {
        throw new Error('Array 10000 should have 10000 items');
    }

    suite.add('deepkit array[100] deserialize', () => {
        deserialize<ArrayItem[]>(array100Data);
    });

    suite.add('deepkit array[100] serialize', () => {
        serialize<ArrayItem[]>(array100Instance);
    });

    suite.add('deepkit array[1000] deserialize', () => {
        deserialize<ArrayItem[]>(array1000Data);
    });

    suite.add('deepkit array[1000] serialize', () => {
        serialize<ArrayItem[]>(array1000Instance);
    });

    suite.add('deepkit array[10000] deserialize', () => {
        deserialize<ArrayItem[]>(array10000Data);
    });

    suite.add('deepkit array[10000] serialize', () => {
        serialize<ArrayItem[]>(array10000Instance);
    });

    // ========================================================================
    // Deeply Nested Object Benchmarks
    // ========================================================================

    const deeplyNestedInstance = deserialize<DeeplyNestedModel>(deeplyNestedPlainData);

    // Sanity checks
    if (!(deeplyNestedInstance.timestamp instanceof Date)) {
        throw new Error('Deeply nested Date should be deserialized correctly');
    }
    if (deeplyNestedInstance.data.nested.children[0].config.items.length !== 3) {
        throw new Error('Deeply nested structure should be deserialized correctly');
    }

    suite.add('deepkit deeply-nested deserialize', () => {
        deserialize<DeeplyNestedModel>(deeplyNestedPlainData);
    });

    suite.add('deepkit deeply-nested serialize', () => {
        serialize<DeeplyNestedModel>(deeplyNestedInstance);
    });

    // ========================================================================
    // Union Types Benchmarks
    // ========================================================================

    const unionInstance = deserialize<Conversation>(unionPlainData);

    // Sanity checks
    if (unionInstance.messages.length !== 6) {
        throw new Error('Union messages should be deserialized correctly');
    }
    const textMessage = unionInstance.messages[0] as TextMessage;
    if (textMessage.type !== 'text' || textMessage.content !== 'Hello everyone!') {
        throw new Error('Text message union should be deserialized correctly');
    }
    const imageMessage = unionInstance.messages[1] as ImageMessage;
    if (imageMessage.type !== 'image' || imageMessage.width !== 800) {
        throw new Error('Image message union should be deserialized correctly');
    }

    suite.add('deepkit union-types deserialize', () => {
        deserialize<Conversation>(unionPlainData);
    });

    suite.add('deepkit union-types serialize', () => {
        serialize<Conversation>(unionInstance);
    });

    // ========================================================================
    // Special Types Benchmarks (Date, Map, Set, BigInt)
    // ========================================================================

    const specialTypesInstance = deserialize<SpecialTypesModel>(specialTypesPlainData);

    // Sanity checks
    if (!(specialTypesInstance.createdAt instanceof Date)) {
        throw new Error('Special types Date should be deserialized correctly');
    }
    if (!(specialTypesInstance.stringMap instanceof Map)) {
        throw new Error('Special types Map should be deserialized correctly');
    }
    if (specialTypesInstance.stringMap.get('key1') !== 'value1') {
        throw new Error('Special types Map values should be correct');
    }
    if (!(specialTypesInstance.stringSet instanceof Set)) {
        throw new Error('Special types Set should be deserialized correctly');
    }
    if (!specialTypesInstance.stringSet.has('unique1')) {
        throw new Error('Special types Set values should be correct');
    }
    if (typeof specialTypesInstance.bigValue !== 'bigint') {
        throw new Error('Special types BigInt should be deserialized correctly');
    }
    if (specialTypesInstance.bigValue !== 9007199254740993n) {
        throw new Error('Special types BigInt value should be correct');
    }

    suite.add('deepkit special-types deserialize', () => {
        deserialize<SpecialTypesModel>(specialTypesPlainData);
    });

    suite.add('deepkit special-types serialize', () => {
        serialize<SpecialTypesModel>(specialTypesInstance);
    });

    // ========================================================================
    // Circular/Self-Referencing Benchmarks
    // ========================================================================

    // Tree structure
    const treeInstance = deserialize<TreeNode>(treePlainData);

    // Sanity checks
    if (!(treeInstance instanceof TreeNode)) {
        throw new Error('Tree node should be deserialized correctly');
    }
    if (treeInstance.children.length !== 2) {
        throw new Error('Tree node children should be deserialized correctly');
    }
    if (!(treeInstance.children[0] instanceof TreeNode)) {
        throw new Error('Nested tree nodes should be TreeNode instances');
    }

    suite.add('deepkit tree-structure deserialize', () => {
        deserialize<TreeNode>(treePlainData);
    });

    suite.add('deepkit tree-structure serialize', () => {
        serialize<TreeNode>(treeInstance);
    });

    // Linked list structure
    const linkedListInstance = deserialize<LinkedListNode>(linkedListPlainData);

    // Sanity checks
    if (!(linkedListInstance instanceof LinkedListNode)) {
        throw new Error('Linked list node should be deserialized correctly');
    }
    if (linkedListInstance.next === undefined || !(linkedListInstance.next instanceof LinkedListNode)) {
        throw new Error('Linked list next should be deserialized correctly');
    }

    suite.add('deepkit linked-list deserialize', () => {
        deserialize<LinkedListNode>(linkedListPlainData);
    });

    suite.add('deepkit linked-list serialize', () => {
        serialize<LinkedListNode>(linkedListInstance);
    });

    // Category hierarchy (parent/child relationships)
    const categoryInstance = deserialize<Category>(categoryPlainData);

    // Sanity checks
    if (!(categoryInstance instanceof Category)) {
        throw new Error('Category should be deserialized correctly');
    }
    if (categoryInstance.subcategories.length !== 2) {
        throw new Error('Category subcategories should be deserialized correctly');
    }
    if (!(categoryInstance.subcategories[0] instanceof Category)) {
        throw new Error('Nested categories should be Category instances');
    }

    suite.add('deepkit category-hierarchy deserialize', () => {
        deserialize<Category>(categoryPlainData);
    });

    suite.add('deepkit category-hierarchy serialize', () => {
        serialize<Category>(categoryInstance);
    });

    return suite;
}
