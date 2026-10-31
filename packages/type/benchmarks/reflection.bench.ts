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
import { ReceiveType, ReflectionClass, ReflectionFunction, reflect, resolveReceiveType, typeOf } from '@deepkit/type';
import { ReflectionKind } from '@deepkit/type';

/**
 * Type Reflection benchmark - tests Deepkit's runtime type reflection APIs
 *
 * This benchmark tests:
 * - ReflectionClass.from() - getting reflection from class
 * - typeOf<T>() - getting type information
 * - reflect() - reflection function
 * - resolveReceiveType() - type resolution
 * - Property iteration and access
 * - Method reflection
 * - Type kind checking
 * - Generic type resolution
 */

// ============================================================================
// Test Types - Realistic class structures
// ============================================================================

enum UserRole {
    Admin = 'admin',
    User = 'user',
    Guest = 'guest',
}

enum Status {
    Active,
    Inactive,
    Pending,
}

class Address {
    street!: string;
    city!: string;
    country!: string;
    zipCode!: string;
    coordinates?: { lat: number; lng: number };
}

class Profile {
    bio?: string;
    avatar?: string;
    website?: string;
    socialLinks: string[] = [];
}

class User {
    id!: number;
    uuid!: string;
    username!: string;
    email!: string;
    password!: string;
    role: UserRole = UserRole.User;
    status: Status = Status.Pending;
    isActive: boolean = false;
    createdAt: Date = new Date();
    updatedAt?: Date;
    profile?: Profile;
    addresses: Address[] = [];
    tags: Set<string> = new Set();
    metadata: Map<string, any> = new Map();

    constructor(public name: string) {}

    getName(): string {
        return this.name;
    }

    setName(name: string): void {
        this.name = name;
    }

    getFullInfo(includePrivate: boolean = false): object {
        return { name: this.name };
    }

    static create(name: string): User {
        return new User(name);
    }
}

// Generic class for testing generic type resolution
class Repository<T> {
    items: T[] = [];

    find(id: number): T | undefined {
        return undefined;
    }

    findAll(): T[] {
        return this.items;
    }

    save(item: T): void {
        this.items.push(item);
    }
}

// Interface for typeOf testing
interface Product {
    id: number;
    name: string;
    price: number;
    description?: string;
    categories: string[];
    attributes: Record<string, string>;
    createdAt: Date;
}

// Complex nested type
interface Order {
    id: number;
    user: User;
    products: Array<{
        product: Product;
        quantity: number;
        price: number;
    }>;
    total: number;
    status: 'pending' | 'processing' | 'shipped' | 'delivered';
    shippingAddress: Address;
    billingAddress?: Address;
    notes?: string;
    createdAt: Date;
    updatedAt?: Date;
}

// Union type
type PaymentMethod =
    | { type: 'credit_card'; cardNumber: string; expiry: string }
    | { type: 'paypal'; email: string }
    | { type: 'bank_transfer'; accountNumber: string; routingNumber: string };

// Helper function for resolveReceiveType benchmarks
function getType<T>(type?: ReceiveType<T>) {
    return resolveReceiveType(type);
}

export default async function () {
    const suite = new BenchSuite('type/reflection');

    // ========================================================================
    // ReflectionClass.from() benchmarks
    // ========================================================================

    // Pre-cache the reflection (this is what happens after first call)
    const userReflection = ReflectionClass.from(User);

    // Sanity checks
    if (userReflection.getClassName() !== 'User') {
        throw new Error('User reflection should have className "User"');
    }
    if (userReflection.getProperties().length === 0) {
        throw new Error('User should have properties');
    }

    // Benchmark cached access (common case - reflection already computed)
    suite.add('ReflectionClass.from (cached)', () => {
        ReflectionClass.from(User);
    });

    // ========================================================================
    // typeOf<T>() benchmarks
    // ========================================================================

    // Primitive types
    suite.add('typeOf<string>', () => {
        typeOf<string>();
    });

    suite.add('typeOf<number>', () => {
        typeOf<number>();
    });

    // Class type
    suite.add('typeOf<User>', () => {
        typeOf<User>();
    });

    // Interface type
    suite.add('typeOf<Product>', () => {
        typeOf<Product>();
    });

    // Complex nested type
    suite.add('typeOf<Order>', () => {
        typeOf<Order>();
    });

    // Union type
    suite.add('typeOf<PaymentMethod>', () => {
        typeOf<PaymentMethod>();
    });

    // Array type
    suite.add('typeOf<User[]>', () => {
        typeOf<User[]>();
    });

    // Generic type
    suite.add('typeOf<Map<string, User>>', () => {
        typeOf<Map<string, User>>();
    });

    // ========================================================================
    // reflect() benchmarks
    // ========================================================================

    suite.add('reflect(User)', () => {
        reflect(User);
    });

    // Reflect a function
    function testFunction(a: string, b: number): boolean {
        return true;
    }

    suite.add('reflect(function)', () => {
        reflect(testFunction);
    });

    // ========================================================================
    // resolveReceiveType() benchmarks
    // ========================================================================

    suite.add('resolveReceiveType<string>', () => {
        getType<string>();
    });

    suite.add('resolveReceiveType<User>', () => {
        getType<User>();
    });

    // ========================================================================
    // Property iteration benchmarks
    // ========================================================================

    suite.add('getProperties()', () => {
        userReflection.getProperties();
    });

    suite.add('getPropertyNames()', () => {
        userReflection.getPropertyNames();
    });

    suite.add('getProperty(name)', () => {
        userReflection.getProperty('email');
    });

    suite.add('hasProperty(name)', () => {
        userReflection.hasProperty('email');
    });

    // Iterate all properties
    suite.add('iterate all properties', () => {
        const props = userReflection.getProperties();
        for (const prop of props) {
            prop.getName();
            prop.getType();
        }
    });

    // ========================================================================
    // Method reflection benchmarks
    // ========================================================================

    suite.add('getMethods()', () => {
        userReflection.getMethods();
    });

    suite.add('getMethodNames()', () => {
        userReflection.getMethodNames();
    });

    suite.add('getMethod(name)', () => {
        userReflection.getMethod('getName');
    });

    suite.add('hasMethod(name)', () => {
        userReflection.hasMethod('getName');
    });

    // Get method parameters
    suite.add('method.getParameters()', () => {
        const method = userReflection.getMethod('getFullInfo');
        method.getParameters();
    });

    // ========================================================================
    // Type kind checking benchmarks
    // ========================================================================

    const stringType = typeOf<string>();
    const userType = typeOf<User>();
    const unionType = typeOf<string | number>();
    const arrayType = typeOf<string[]>();

    suite.add('type.kind === ReflectionKind.string', () => {
        stringType.kind === ReflectionKind.string;
    });

    suite.add('type.kind === ReflectionKind.class', () => {
        userType.kind === ReflectionKind.class;
    });

    suite.add('type.kind === ReflectionKind.union', () => {
        unionType.kind === ReflectionKind.union;
    });

    suite.add('type.kind === ReflectionKind.array', () => {
        arrayType.kind === ReflectionKind.array;
    });

    // ========================================================================
    // Property type inspection benchmarks
    // ========================================================================

    const emailProperty = userReflection.getProperty('email');
    const profileProperty = userReflection.getProperty('profile');
    const addressesProperty = userReflection.getProperty('addresses');

    suite.add('property.isOptional()', () => {
        profileProperty.isOptional();
    });

    suite.add('property.getType()', () => {
        emailProperty.getType();
    });

    suite.add('property.isArray()', () => {
        addressesProperty.isArray();
    });

    suite.add('property.getKind()', () => {
        emailProperty.getKind();
    });

    // ========================================================================
    // ReflectionFunction benchmarks
    // ========================================================================

    function complexFunction(
        name: string,
        age: number,
        options?: { verbose: boolean; limit: number },
    ): Promise<User[]> {
        return Promise.resolve([]);
    }

    const funcReflection = ReflectionFunction.from(complexFunction);

    suite.add('ReflectionFunction.from(fn)', () => {
        ReflectionFunction.from(complexFunction);
    });

    suite.add('function.getParameters()', () => {
        funcReflection.getParameters();
    });

    suite.add('function.getReturnType()', () => {
        funcReflection.getReturnType();
    });

    // ========================================================================
    // Class metadata benchmarks
    // ========================================================================

    suite.add('reflection.getClassName()', () => {
        userReflection.getClassName();
    });

    suite.add('reflection.getClassType()', () => {
        userReflection.getClassType();
    });

    suite.add('reflection.getConstructorOrUndefined()', () => {
        userReflection.getConstructorOrUndefined();
    });

    return suite;
}
