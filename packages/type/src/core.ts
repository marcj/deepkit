/*
 * Deepkit Framework
 * Copyright (c) Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */

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

/**
 * Node, Bun and Deno have a global Buffer, browsers don't. Without it, atob/btoa and TextEncoder/TextDecoder are used.
 */
function getBuffer(): typeof Buffer | undefined {
    return (globalThis as any).Buffer;
}

function toUint8Array(data: ArrayBuffer | ArrayBufferView): Uint8Array {
    return ArrayBuffer.isView(data) ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : new Uint8Array(data);
}

function uint8ArrayToBase64(array: Uint8Array): string {
    let binary = '';
    // in chunks, String.fromCharCode has an argument limit
    for (let i = 0; i < array.length; i += 0x8000) {
        binary += String.fromCharCode.apply(null, array.subarray(i, i + 0x8000) as any);
    }
    return btoa(binary);
}

export function nodeBufferToTypedArray<K>(buf: Uint8Array, type: TypedArrayClassType<K>): K {
    return new type(buf.buffer, buf.byteOffset, buf.length / type.BYTES_PER_ELEMENT);
}

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
 * Decodes base64 into a new TypedArray that does not share its ArrayBuffer.
 */
export function base64ToTypedArray<K>(base64: string, type: TypedArrayClassType<K>): K {
    return new type(base64ToUint8ArrayAtoB(base64).buffer);
}

/**
 * Creates a new fresh ArrayBuffer with given data.
 */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
    return base64ToUint8ArrayAtoB(base64).buffer;
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
 *
 * Returns a Buffer where available (Node, Bun, Deno), otherwise a Uint8Array.
 */
export function typedArrayToBuffer<K>(typedArray: TypedArray): Uint8Array {
    const Buffer = getBuffer();
    if (!Buffer) return toUint8Array(typedArray);
    if (typedArray instanceof Buffer) return typedArray;
    return Buffer.from(typedArray.buffer, typedArray.byteOffset, typedArray.byteLength);
}

export function arrayBufferToBase64(arrayBuffer: ArrayBuffer): string {
    const Buffer = getBuffer();
    if (Buffer) return Buffer.from(arrayBuffer).toString('base64');
    return uint8ArrayToBase64(new Uint8Array(arrayBuffer));
}

export function typedArrayToBase64(typedArray: TypedArray): string {
    const Buffer = getBuffer();
    if (Buffer) return Buffer.from(typedArray.buffer, typedArray.byteOffset, typedArray.byteLength).toString('base64');
    return uint8ArrayToBase64(toUint8Array(typedArray));
}

/**
 * Same as Buffer.from() but creates a ArrayBuffer that is not shared.
 */
export function arrayBufferFrom(data: string, encoding?: string): ArrayBuffer {
    const Buffer = getBuffer();
    if (Buffer) return nodeBufferToArrayBuffer(Buffer.from(data, encoding as any));
    if (!encoding || encoding === 'utf8' || encoding === 'utf-8') return new TextEncoder().encode(data).buffer as ArrayBuffer;
    if (encoding === 'base64') return base64ToArrayBuffer(data);
    if (encoding === 'hex') {
        const array = new Uint8Array(data.length >> 1);
        for (let i = 0; i < array.length; i++) array[i] = parseInt(data.substr(i * 2, 2), 16);
        return array.buffer;
    }
    if (encoding === 'ascii' || encoding === 'latin1' || encoding === 'binary') {
        const array = new Uint8Array(data.length);
        for (let i = 0; i < data.length; i++) array[i] = data.charCodeAt(i) & 0xff;
        return array.buffer;
    }
    throw new Error(`Encoding ${encoding} is not supported without Buffer`);
}

/**
 * Same as Buffer.from(arrayBuffer).toString(encoding), but more in line with the current API.
 */
export function arrayBufferTo(arrayBuffer: ArrayBuffer | Uint8Array, encoding?: string | 'utf8' | 'base64' | 'ascii') {
    const Buffer = getBuffer();
    const array = toUint8Array(arrayBuffer);
    if (Buffer) return Buffer.from(array.buffer, array.byteOffset, array.byteLength).toString(encoding as any);
    if (!encoding || encoding === 'utf8' || encoding === 'utf-8') return new TextDecoder().decode(array);
    if (encoding === 'base64') return uint8ArrayToBase64(array);
    if (encoding === 'hex') return Array.from(array, v => (v + 0x100).toString(16).slice(1)).join('');
    if (encoding === 'ascii' || encoding === 'latin1' || encoding === 'binary') {
        let result = '';
        for (let i = 0; i < array.length; i++) result += String.fromCharCode(encoding === 'ascii' ? array[i] & 0x7f : array[i]);
        return result;
    }
    throw new Error(`Encoding ${encoding} is not supported without Buffer`);
}
