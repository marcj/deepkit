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
    RpcMessageRouteType,
    createBodyDecoder,
    createRpcCompositeMessage,
    createRpcMessage,
    createRpcMessageSourceDest,
    readBinaryRpcMessage,
    serializeBinaryRpcMessage,
} from '@deepkit/rpc';
import { RpcTypes } from '@deepkit/rpc';
import { typeOf } from '@deepkit/type';

/**
 * RPC Message Serialization/Deserialization Benchmark
 *
 * Tests the performance of RPC binary message protocol:
 * 1. Message creation with createRpcMessage()
 * 2. Serialization with serializeBinaryRpcMessage()
 * 3. Deserialization with readBinaryRpcMessage()
 * 4. Body parsing with parseBody<T>()
 * 5. Different message sizes (small, medium, large)
 * 6. Different RPC message types
 * 7. Composite messages
 * 8. BodyDecoder caching effectiveness
 */

// ============================================================================
// Test Data Types
// ============================================================================

interface SmallBody {
    name: string;
    id: number;
}

interface MediumBody {
    controller: string;
    method: string;
    args: {
        id: number;
        name: string;
        active: boolean;
        tags: string[];
    }[];
}

interface LargeBody {
    controller: string;
    method: string;
    args: {
        items: {
            id: number;
            name: string;
            description: string;
            price: number;
            quantity: number;
            active: boolean;
            createdAt: Date;
            tags: string[];
            metadata: { [key: string]: string };
        }[];
    }[];
}

interface ActionBody {
    controller: string;
    method: string;
    args: any[];
}

interface ResponseBody {
    v: any;
}

// ============================================================================
// Test Data Generation
// ============================================================================

function createSmallBody(): SmallBody {
    return {
        name: 'test',
        id: 12345,
    };
}

function createMediumBody(): MediumBody {
    return {
        controller: 'myController',
        method: 'processData',
        args: [
            {
                id: 1,
                name: 'Item One',
                active: true,
                tags: ['tag1', 'tag2', 'tag3'],
            },
            {
                id: 2,
                name: 'Item Two',
                active: false,
                tags: ['alpha', 'beta'],
            },
        ],
    };
}

function createLargeBody(): LargeBody {
    const items = [];
    for (let i = 0; i < 100; i++) {
        items.push({
            id: i,
            name: `Product ${i}`,
            description: `This is a detailed description for product number ${i} with additional text`,
            price: Math.random() * 1000,
            quantity: Math.floor(Math.random() * 100),
            active: i % 2 === 0,
            createdAt: new Date(),
            tags: ['electronics', 'sale', 'featured'],
            metadata: {
                color: 'blue',
                size: 'medium',
                weight: '2.5kg',
            },
        });
    }
    return {
        controller: 'productController',
        method: 'bulkProcess',
        args: [{ items }],
    };
}

// ============================================================================
// Benchmark
// ============================================================================

export default async function () {
    const suite = new BenchSuite('rpc/messages');

    // ------------------------------------------------------------------------
    // Setup: Pre-create test data and serialized buffers
    // ------------------------------------------------------------------------

    const smallBody = createSmallBody();
    const mediumBody = createMediumBody();
    const largeBody = createLargeBody();

    // Pre-create messages for serialization benchmarks
    const smallMessage = createRpcMessage<SmallBody>(1, RpcTypes.Action, smallBody);
    const mediumMessage = createRpcMessage<MediumBody>(2, RpcTypes.Action, mediumBody);
    const largeMessage = createRpcMessage<LargeBody>(3, RpcTypes.Action, largeBody);

    // Pre-serialize for deserialization benchmarks
    const smallBuffer = serializeBinaryRpcMessage(smallMessage);
    const mediumBuffer = serializeBinaryRpcMessage(mediumMessage);
    const largeBuffer = serializeBinaryRpcMessage(largeMessage);

    // Pre-create body decoders (cached)
    const smallDecoder = createBodyDecoder<SmallBody>();
    const mediumDecoder = createBodyDecoder<MediumBody>();
    const largeDecoder = createBodyDecoder<LargeBody>();

    // Warmup to trigger JIT compilation
    for (let i = 0; i < 10000; i++) {
        serializeBinaryRpcMessage(smallMessage);
        readBinaryRpcMessage(smallBuffer);
        readBinaryRpcMessage(smallBuffer).parseBody<SmallBody>();
        readBinaryRpcMessage(smallBuffer).decodeBody(smallDecoder);
    }

    // Verification
    const parsedSmall = readBinaryRpcMessage(smallBuffer);
    if (parsedSmall.id !== 1) throw new Error('Small message ID mismatch');
    if (parsedSmall.type !== RpcTypes.Action) throw new Error('Small message type mismatch');
    const parsedSmallBody = parsedSmall.parseBody<SmallBody>();
    if (parsedSmallBody.name !== 'test') throw new Error('Small body name mismatch');
    if (parsedSmallBody.id !== 12345) throw new Error('Small body id mismatch');

    // ------------------------------------------------------------------------
    // 1. Message Creation (createRpcMessage)
    // ------------------------------------------------------------------------

    suite.add('createRpcMessage (no body)', () => {
        createRpcMessage(1, RpcTypes.Ack);
    });

    suite.add('createRpcMessage small body', () => {
        createRpcMessage<SmallBody>(1, RpcTypes.Action, smallBody);
    });

    suite.add('createRpcMessage medium body', () => {
        createRpcMessage<MediumBody>(2, RpcTypes.Action, mediumBody);
    });

    suite.add('createRpcMessage large body', () => {
        createRpcMessage<LargeBody>(3, RpcTypes.Action, largeBody);
    });

    // ------------------------------------------------------------------------
    // 2. Message Serialization (serializeBinaryRpcMessage)
    // ------------------------------------------------------------------------

    suite.add('serialize (no body)', () => {
        serializeBinaryRpcMessage(createRpcMessage(1, RpcTypes.Ack));
    });

    suite.add('serialize small body', () => {
        serializeBinaryRpcMessage(smallMessage);
    });

    suite.add('serialize medium body', () => {
        serializeBinaryRpcMessage(mediumMessage);
    });

    suite.add('serialize large body', () => {
        serializeBinaryRpcMessage(largeMessage);
    });

    // ------------------------------------------------------------------------
    // 3. Message Deserialization (readBinaryRpcMessage)
    // ------------------------------------------------------------------------

    // Create a no-body message buffer
    const noBodyBuffer = serializeBinaryRpcMessage(createRpcMessage(1, RpcTypes.Ack));

    suite.add('deserialize (no body)', () => {
        readBinaryRpcMessage(noBodyBuffer);
    });

    suite.add('deserialize small (header only)', () => {
        readBinaryRpcMessage(smallBuffer);
    });

    suite.add('deserialize medium (header only)', () => {
        readBinaryRpcMessage(mediumBuffer);
    });

    suite.add('deserialize large (header only)', () => {
        readBinaryRpcMessage(largeBuffer);
    });

    // ------------------------------------------------------------------------
    // 4. Body Parsing (parseBody<T>)
    // ------------------------------------------------------------------------

    const parsedSmallMsg = readBinaryRpcMessage(smallBuffer);
    const parsedMediumMsg = readBinaryRpcMessage(mediumBuffer);
    const parsedLargeMsg = readBinaryRpcMessage(largeBuffer);

    suite.add('parseBody small', () => {
        parsedSmallMsg.parseBody<SmallBody>();
    });

    suite.add('parseBody medium', () => {
        parsedMediumMsg.parseBody<MediumBody>();
    });

    suite.add('parseBody large', () => {
        parsedLargeMsg.parseBody<LargeBody>();
    });

    // ------------------------------------------------------------------------
    // 5. Body Decoding with Cached Decoder (decodeBody)
    // ------------------------------------------------------------------------

    suite.add('decodeBody small (cached decoder)', () => {
        parsedSmallMsg.decodeBody(smallDecoder);
    });

    suite.add('decodeBody medium (cached decoder)', () => {
        parsedMediumMsg.decodeBody(mediumDecoder);
    });

    suite.add('decodeBody large (cached decoder)', () => {
        parsedLargeMsg.decodeBody(largeDecoder);
    });

    // ------------------------------------------------------------------------
    // 6. Full Round-Trip (create + serialize + deserialize + parse)
    // ------------------------------------------------------------------------

    suite.add('round-trip small', () => {
        const msg = createRpcMessage<SmallBody>(1, RpcTypes.Action, smallBody);
        const buf = serializeBinaryRpcMessage(msg);
        const parsed = readBinaryRpcMessage(buf);
        parsed.parseBody<SmallBody>();
    });

    suite.add('round-trip medium', () => {
        const msg = createRpcMessage<MediumBody>(2, RpcTypes.Action, mediumBody);
        const buf = serializeBinaryRpcMessage(msg);
        const parsed = readBinaryRpcMessage(buf);
        parsed.parseBody<MediumBody>();
    });

    // ------------------------------------------------------------------------
    // 7. Different Route Types
    // ------------------------------------------------------------------------

    const source = new Uint8Array(16);
    source[0] = 1;
    const destination = new Uint8Array(16);
    destination[0] = 2;

    suite.add('create + serialize sourceDest message', () => {
        const msg = createRpcMessageSourceDest<SmallBody>(1, RpcTypes.Action, source, destination, smallBody);
        serializeBinaryRpcMessage(msg);
    });

    const sourceDestMessage = createRpcMessageSourceDest<SmallBody>(1, RpcTypes.Action, source, destination, smallBody);
    const sourceDestBuffer = serializeBinaryRpcMessage(sourceDestMessage);

    suite.add('deserialize + parse sourceDest message', () => {
        const parsed = readBinaryRpcMessage(sourceDestBuffer);
        parsed.parseBody<SmallBody>();
    });

    // ------------------------------------------------------------------------
    // 8. Composite Messages
    // ------------------------------------------------------------------------

    const compositeMessage = createRpcCompositeMessage(1, RpcTypes.ResponseActionResult, [
        { type: RpcTypes.ResponseActionType, schema: typeOf<SmallBody>(), body: smallBody },
        { type: RpcTypes.ResponseActionSimple, schema: typeOf<SmallBody>(), body: smallBody },
    ]);

    suite.add('serialize composite message', () => {
        serializeBinaryRpcMessage(compositeMessage);
    });

    const compositeBuffer = serializeBinaryRpcMessage(compositeMessage);

    suite.add('deserialize + getBodies composite', () => {
        const parsed = readBinaryRpcMessage(compositeBuffer);
        parsed.getBodies();
    });

    suite.add('deserialize + getBodies + parseBody composite', () => {
        const parsed = readBinaryRpcMessage(compositeBuffer);
        const bodies = parsed.getBodies();
        bodies[0].parseBody<SmallBody>();
        bodies[1].parseBody<SmallBody>();
    });

    // ------------------------------------------------------------------------
    // 9. Different RPC Message Types
    // ------------------------------------------------------------------------

    // Ack message (minimal)
    suite.add('serialize RpcTypes.Ack', () => {
        serializeBinaryRpcMessage(createRpcMessage(1, RpcTypes.Ack));
    });

    // Ping/Pong (minimal)
    suite.add('serialize RpcTypes.Ping', () => {
        serializeBinaryRpcMessage(createRpcMessage(1, RpcTypes.Ping));
    });

    // Action message (common case)
    const actionBody: ActionBody = {
        controller: 'myController',
        method: 'myMethod',
        args: [1, 'test', true],
    };
    suite.add('serialize RpcTypes.Action', () => {
        serializeBinaryRpcMessage(createRpcMessage<ActionBody>(1, RpcTypes.Action, actionBody));
    });

    // ResponseActionSimple (common response)
    const responseBody: ResponseBody = { v: { result: 'success', data: [1, 2, 3] } };
    suite.add('serialize RpcTypes.ResponseActionSimple', () => {
        serializeBinaryRpcMessage(createRpcMessage<ResponseBody>(1, RpcTypes.ResponseActionSimple, responseBody));
    });

    return suite;
}
