/*
 * Deepkit Framework
 * Copyright (c) Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */

import { Buffer } from 'buffer';
import { ClassType } from '@deepkit/core';

//on unpopulated properties access
export enum UnpopulatedCheck {
    None, //returns undefined
    Throw, //throws regular error
    ReturnSymbol, //returns `unpopulatedSymbol`
}

export const unpopulatedSymbol = Symbol('unpopulated');

export interface TypeSettings {
    registeredEntities: { [name: string]: ClassType };
    unpopulatedCheck: UnpopulatedCheck;
}

export const typeSettings: TypeSettings = { registeredEntities: {}, unpopulatedCheck: UnpopulatedCheck.Throw };

export interface TypedArrayClassType<T> {
    new(...args: any[]): T;

    readonly BYTES_PER_ELEMENT: number;
}

export interface TypedArray {
    /**
     * The size in bytes of each element in the array.
     */
    readonly BYTES_PER_ELEMENT: number;

    /**
     * The ArrayBuffer instance referenced by the array.
     */
    readonly buffer: ArrayBufferLike;

    /**
     * The length of the array.
     */
    readonly length: number;

    /**
     * The length in bytes of the array.
     */
    readonly byteLength: number;

    /**
     * The offset in bytes of the array.
     */
    readonly byteOffset: number;
}

export function nodeBufferToTypedArray<K>(buf: Buffer, type: TypedArrayClassType<K>): K {
    return new type(buf.buffer, buf.byteOffset, buf.length / type.BYTES_PER_ELEMENT);
}

/**
 * This function is only used in browser context, where atob is actually faster than
 * using `Buffer.from` by the `buffer.js` library.
 */
function base64ToUint8ArrayAtoB(base64: string): Uint8Array<ArrayBuffer> {
    const raw = atob(base64);
    const rawLength = raw.length;
    const array = new Uint8Array(new ArrayBuffer(rawLength));

    for (let i = 0; i < rawLength; i++) {
        array[i] = raw.charCodeAt(i);
    }
    return array;
}

/**
 * When using Buffer.from() node is using a buffer from the buffer pool.
 * This makes it necessary to create the given TypedArray using byteOffset and byteLength accordingly.
 *
 * Note: The created TypedArray.buffer is pointing probably to a larger Buffer. Make sure
 * to use byteLength/byeOffset correctly or use typedArrayToArrayBuffer() if you want to use
 * a raw ArrayBuffer that represents the actual data correctly.
 */
export function base64ToTypedArray<K>(base64: string, type: TypedArrayClassType<K>): K {
    if ('function' === typeof atob) {
        return new type(base64ToUint8ArrayAtoB(base64).buffer);
    }

    return nodeBufferToTypedArray(Buffer.from(base64, 'base64'), type);
}

/**
 * Creates a new fresh ArrayBuffer with given data.
 * Note: Regular Buffer.from(base64, 'base64) creates in Node a shared buffer, this function makes
 * sure a copy happens and the ArrayBuffer is not shared.
 */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
    if ('function' === typeof atob) {
        return base64ToUint8ArrayAtoB(base64).buffer;
    }

    return nodeBufferToArrayBuffer(Buffer.from(base64, 'base64'));
}

/**
 * When using Buffer.from() node is using a buffer from the buffer pool.
 * This makes it necessary to create the a new ArrayType using slice to make a copy.
 *
 * This makes a copy.
 */
export function nodeBufferToArrayBuffer<K>(buf: Uint8Array | ArrayBuffer): ArrayBuffer {
    if (ArrayBuffer.isView(buf)) return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    return buf;
}

/**
 * In node environment the TypedArray.buffer is probably a larger buffer from the buffer pool.
 * This makes it necessary to create a Buffer with offset & length so that it accurately represents
 * the given TypedArray.
 */
export function typedArrayToBuffer<K>(typedArray: TypedArray): Buffer {
    if (typedArray instanceof Buffer) return typedArray;
    return Buffer.from(typedArray.buffer, typedArray.byteOffset, typedArray.byteLength);
}

export function arrayBufferToBase64(arrayBuffer: ArrayBuffer): string {
    return Buffer.from(arrayBuffer).toString('base64');
}

export function typedArrayToBase64(typedArray: TypedArray): string {
    return typedArrayToBuffer(typedArray).toString('base64');
}

/**
 * Same as Buffer.from() but creates a ArrayBuffer that is not shared.
 */
export function arrayBufferFrom(data: string, encoding?: string): ArrayBuffer {
    return nodeBufferToArrayBuffer(Buffer.from(data, encoding as any));
}

/**
 * Same as Buffer.from(arrayBuffer).toString(encoding), but more in line with the current API.
 */
export function arrayBufferTo(arrayBuffer: ArrayBuffer | Uint8Array, encoding?: string | 'utf8' | 'base64' | 'ascii') {
    const buffer = arrayBuffer instanceof Uint8Array ? Buffer.from(arrayBuffer.buffer, arrayBuffer.byteOffset, arrayBuffer.byteLength) : Buffer.from(arrayBuffer);
    return buffer.toString(encoding as any);
}
