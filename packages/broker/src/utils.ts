
import { Queue } from './kernel.js';

/**
 * @internal
 */
export function parseTime(value?: string | number): number | undefined {
    if ('undefined' === typeof value) return;
    if ('string' === typeof value) return value ? parseDuration(value) || 0 : undefined;
    return value;
}

const durationUnits: [RegExp, number][] = [
    [/^(ms|msecs?|milliseconds?)$/, 1],
    [/^(s|secs?|seconds?)$/, 1000],
    [/^(m|mins?|minutes?)$/, 60_000],
    [/^(h|hrs?|hours?)$/, 3_600_000],
    [/^(d|days?)$/, 86_400_000],
    [/^(w|wks?|weeks?)$/, 604_800_000],
    [/^(y|yrs?|years?)$/, 31_557_600_000],
];

/**
 * Parses durations like `100`, `1.5s`, `10 minutes`, `2h` or `1y` into milliseconds.
 * A number without unit is milliseconds. Returns undefined for invalid input.
 */
export function parseDuration(value: string): number | undefined {
    const match = value.toLowerCase().match(/^(-?\d*\.?\d+) *([a-z]*)$/);
    if (!match) return;
    const num = parseFloat(match[1]);
    if (!match[2]) return num;
    for (const [unit, factor] of durationUnits) {
        if (unit.test(match[2])) return num * factor;
    }
    return;
}

const PRIME32_1 = 2654435761;
const PRIME32_2 = 2246822519;
const PRIME32_3 = 3266489917;
const PRIME32_4 = 668265263;
const PRIME32_5 = 374761393;

function rotl32(x: number, r: number): number {
    return (x << r) | (x >>> (32 - r));
}

function readU32(b: Uint8Array, i: number): number {
    return b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24);
}

function round32(acc: number, lane: number): number {
    return Math.imul(rotl32((acc + Math.imul(lane, PRIME32_2)) | 0, 13), PRIME32_1);
}

/**
 * xxHash32 (https://github.com/Cyan4973/xxHash/blob/dev/doc/xxhash_spec.md) with seed 0.
 */
export function xxHash32(b: Uint8Array, seed: number = 0): number {
    let offset = 0;
    let acc: number;
    if (b.length >= 16) {
        let acc1 = (seed + PRIME32_1 + PRIME32_2) | 0;
        let acc2 = (seed + PRIME32_2) | 0;
        let acc3 = seed | 0;
        let acc4 = (seed - PRIME32_1) | 0;
        for (const limit = b.length - 16; offset <= limit; offset += 16) {
            acc1 = round32(acc1, readU32(b, offset));
            acc2 = round32(acc2, readU32(b, offset + 4));
            acc3 = round32(acc3, readU32(b, offset + 8));
            acc4 = round32(acc4, readU32(b, offset + 12));
        }
        acc = (rotl32(acc1, 1) + rotl32(acc2, 7) + rotl32(acc3, 12) + rotl32(acc4, 18)) | 0;
    } else {
        acc = (seed + PRIME32_5) | 0;
    }

    acc = (acc + b.length) | 0;

    for (; offset <= b.length - 4; offset += 4) {
        acc = Math.imul(rotl32((acc + Math.imul(readU32(b, offset), PRIME32_3)) | 0, 17), PRIME32_4);
    }
    for (; offset < b.length; offset++) {
        acc = Math.imul(rotl32((acc + Math.imul(b[offset], PRIME32_5)) | 0, 11), PRIME32_1);
    }

    acc = Math.imul(acc ^ (acc >>> 15), PRIME32_2);
    acc = Math.imul(acc ^ (acc >>> 13), PRIME32_3);
    acc ^= acc >>> 16;
    return acc >>> 0;
}

/**
 * @internal
 */
export function fastHash(value: Uint8Array): number {
    return xxHash32(value);
}

/**
 * @internal
 */
export function handleMessageDeduplication(hash: string | number, queue: Queue, value: Uint8Array, ttl: number): boolean {
    if (queue.deduplicateMessageHashes.has(hash)) return true;
    setTimeout(() => queue.deduplicateMessageHashes.delete(hash), ttl);
    queue.deduplicateMessageHashes.add(hash);
    return false;
}
