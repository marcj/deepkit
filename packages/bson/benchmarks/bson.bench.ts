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
import { getBSONDeserializer, getBSONSerializer } from '@deepkit/bson';

/**
 * BSON Serialization/Deserialization Benchmark
 *
 * This benchmark tests Deepkit's BSON serialization and deserialization
 * performance across different data structures and sizes.
 */

// ============================================================================
// Test Data Types - Small Objects
// ============================================================================

interface SmallObject {
    id: number;
    name: string;
    active: boolean;
    score: number;
}

interface ObjectWithDate {
    id: number;
    createdAt: Date;
    updatedAt: Date;
    name: string;
}

interface NestedObject {
    id: number;
    name: string;
    metadata: {
        version: number;
        tags: string[];
        config: {
            enabled: boolean;
            threshold: number;
        };
    };
}

// ============================================================================
// Test Data Types - Large Arrays
// ============================================================================

interface ArrayItem {
    id: number;
    name: string;
    ready: boolean;
    priority: number;
    tags: string[];
}

interface LargeArrayContainer {
    items: ArrayItem[];
}

interface NumberArrayContainer {
    values: number[];
}

interface StringArrayContainer {
    strings: string[];
}

// ============================================================================
// Test Data Types - Mixed/Complex
// ============================================================================

interface ComplexDocument {
    id: number;
    title: string;
    description: string;
    price: number;
    quantity: number;
    active: boolean;
    createdAt: Date;
    tags: string[];
    attributes: { [key: string]: string };
    nested: {
        level1: {
            level2: {
                value: number;
            };
        };
    };
}

// ============================================================================
// Test Data Generation
// ============================================================================

function createSmallObject(): SmallObject {
    return {
        id: 12345,
        name: 'Test Object',
        active: true,
        score: 98.6,
    };
}

function createObjectWithDate(): ObjectWithDate {
    return {
        id: 1,
        createdAt: new Date('2024-01-15T10:30:00Z'),
        updatedAt: new Date('2024-06-20T14:45:00Z'),
        name: 'Date Test',
    };
}

function createNestedObject(): NestedObject {
    return {
        id: 100,
        name: 'Nested Test',
        metadata: {
            version: 3,
            tags: ['alpha', 'beta', 'gamma'],
            config: {
                enabled: true,
                threshold: 0.75,
            },
        },
    };
}

function createLargeArray(size: number): LargeArrayContainer {
    const items: ArrayItem[] = [];
    for (let i = 0; i < size; i++) {
        items.push({
            id: i,
            name: `Item ${i}`,
            ready: i % 2 === 0,
            priority: i % 10,
            tags: ['tag1', 'tag2', 'tag3'],
        });
    }
    return { items };
}

function createNumberArray(size: number): NumberArrayContainer {
    const values: number[] = [];
    for (let i = 0; i < size; i++) {
        values.push(Math.random() * 1000);
    }
    return { values };
}

function createStringArray(size: number): StringArrayContainer {
    const strings: string[] = [];
    for (let i = 0; i < size; i++) {
        strings.push(`String value number ${i} with some additional text`);
    }
    return { strings };
}

function createComplexDocument(): ComplexDocument {
    return {
        id: 999,
        title: 'Complex Document Title',
        description: 'This is a longer description that contains more text to simulate real-world data',
        price: 199.99,
        quantity: 42,
        active: true,
        createdAt: new Date(),
        tags: ['electronics', 'sale', 'featured', 'new'],
        attributes: {
            color: 'blue',
            size: 'medium',
            material: 'aluminum',
            weight: '2.5kg',
        },
        nested: {
            level1: {
                level2: {
                    value: 12345,
                },
            },
        },
    };
}

// ============================================================================
// Benchmark
// ============================================================================

export default async function () {
    const suite = new BenchSuite('bson/serialization');

    // ------------------------------------------------------------------------
    // Small Object Serialization/Deserialization
    // ------------------------------------------------------------------------

    const smallObj = createSmallObject();
    const serializeSmall = getBSONSerializer<SmallObject>();
    const deserializeSmall = getBSONDeserializer<SmallObject>();
    const smallBson = serializeSmall(smallObj);

    suite.add('serialize small object', () => {
        serializeSmall(smallObj);
    });

    suite.add('deserialize small object', () => {
        deserializeSmall(smallBson);
    });

    // ------------------------------------------------------------------------
    // Object with Dates
    // ------------------------------------------------------------------------

    const dateObj = createObjectWithDate();
    const serializeDate = getBSONSerializer<ObjectWithDate>();
    const deserializeDate = getBSONDeserializer<ObjectWithDate>();
    const dateBson = serializeDate(dateObj);

    suite.add('serialize object with dates', () => {
        serializeDate(dateObj);
    });

    suite.add('deserialize object with dates', () => {
        deserializeDate(dateBson);
    });

    // ------------------------------------------------------------------------
    // Nested Object
    // ------------------------------------------------------------------------

    const nestedObj = createNestedObject();
    const serializeNested = getBSONSerializer<NestedObject>();
    const deserializeNested = getBSONDeserializer<NestedObject>();
    const nestedBson = serializeNested(nestedObj);

    suite.add('serialize nested object', () => {
        serializeNested(nestedObj);
    });

    suite.add('deserialize nested object', () => {
        deserializeNested(nestedBson);
    });

    // ------------------------------------------------------------------------
    // Large Array (1000 items)
    // ------------------------------------------------------------------------

    const largeArray1000 = createLargeArray(1000);
    const serializeLargeArray = getBSONSerializer<LargeArrayContainer>();
    const deserializeLargeArray = getBSONDeserializer<LargeArrayContainer>();
    const largeArrayBson1000 = serializeLargeArray(largeArray1000);

    suite.add('serialize array (1000 items)', () => {
        serializeLargeArray(largeArray1000);
    });

    suite.add('deserialize array (1000 items)', () => {
        deserializeLargeArray(largeArrayBson1000);
    });

    // ------------------------------------------------------------------------
    // Large Array (5000 items)
    // ------------------------------------------------------------------------

    const largeArray5000 = createLargeArray(5000);
    const largeArrayBson5000 = serializeLargeArray(largeArray5000);

    suite.add('serialize array (5000 items)', () => {
        serializeLargeArray(largeArray5000);
    });

    suite.add('deserialize array (5000 items)', () => {
        deserializeLargeArray(largeArrayBson5000);
    });

    // ------------------------------------------------------------------------
    // Number Array (1000 numbers)
    // ------------------------------------------------------------------------

    const numberArray = createNumberArray(1000);
    const serializeNumbers = getBSONSerializer<NumberArrayContainer>();
    const deserializeNumbers = getBSONDeserializer<NumberArrayContainer>();
    const numberBson = serializeNumbers(numberArray);

    suite.add('serialize number array (1000)', () => {
        serializeNumbers(numberArray);
    });

    suite.add('deserialize number array (1000)', () => {
        deserializeNumbers(numberBson);
    });

    // ------------------------------------------------------------------------
    // String Array (1000 strings)
    // ------------------------------------------------------------------------

    const stringArray = createStringArray(1000);
    const serializeStrings = getBSONSerializer<StringArrayContainer>();
    const deserializeStrings = getBSONDeserializer<StringArrayContainer>();
    const stringBson = serializeStrings(stringArray);

    suite.add('serialize string array (1000)', () => {
        serializeStrings(stringArray);
    });

    suite.add('deserialize string array (1000)', () => {
        deserializeStrings(stringBson);
    });

    // ------------------------------------------------------------------------
    // Complex Document
    // ------------------------------------------------------------------------

    const complexDoc = createComplexDocument();
    const serializeComplex = getBSONSerializer<ComplexDocument>();
    const deserializeComplex = getBSONDeserializer<ComplexDocument>();
    const complexBson = serializeComplex(complexDoc);

    suite.add('serialize complex document', () => {
        serializeComplex(complexDoc);
    });

    suite.add('deserialize complex document', () => {
        deserializeComplex(complexBson);
    });

    return suite;
}
