/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */

import { CustomError } from '@deepkit/core';


let PROCESS_UNIQUE: Uint8Array | undefined = undefined;

export class BSONError extends CustomError {
}

function getUnique(): Uint8Array {
    if (PROCESS_UNIQUE) return PROCESS_UNIQUE;
    PROCESS_UNIQUE = crypto.getRandomValues(new Uint8Array(5));
    return PROCESS_UNIQUE;
}

export const hexTable: string[] = [];
for (let i = 0; i < 256; i++) {
    hexTable[i] = (i <= 15 ? '0' : '') + i.toString(16);
}

const hexChars = new Uint8Array(16);
for (let i = 0; i < 16; i++) hexChars[i] = '0123456789abcdef'.charCodeAt(i);

/**
 * Thin wrapper around the native type to allow to serialize it correctly
 * in types like t.any.
 */
export class ObjectId {
    static index: number = Math.ceil(Math.random() * 0xffffff);

    static generate(time?: number): string {
        if (!time) time = Math.ceil(Date.now() / 1000);
        const inc = (++ObjectId.index) % 0xffffff;

        const processUnique = getUnique();

        // One flat string. Concatenating creates a rope, which is slow to read when the id is written.
        return String.fromCharCode(
            hexChars[(time >> 28) & 15], hexChars[(time >> 24) & 15], hexChars[(time >> 20) & 15], hexChars[(time >> 16) & 15],
            hexChars[(time >> 12) & 15], hexChars[(time >> 8) & 15], hexChars[(time >> 4) & 15], hexChars[time & 15],

            hexChars[processUnique[0] >> 4], hexChars[processUnique[0] & 15],
            hexChars[processUnique[1] >> 4], hexChars[processUnique[1] & 15],
            hexChars[processUnique[2] >> 4], hexChars[processUnique[2] & 15],
            hexChars[processUnique[3] >> 4], hexChars[processUnique[3] & 15],
            hexChars[processUnique[4] >> 4], hexChars[processUnique[4] & 15],

            hexChars[(inc >> 20) & 15], hexChars[(inc >> 16) & 15], hexChars[(inc >> 12) & 15],
            hexChars[(inc >> 8) & 15], hexChars[(inc >> 4) & 15], hexChars[inc & 15],
        );
    }
}
