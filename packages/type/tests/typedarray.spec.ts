import { expect, test } from '@jest/globals';
import { ReflectionClass } from '../src/reflection/reflection.js';
import { assertType, binaryTypes, ReflectionKind } from '../src/reflection/type.js';
import { base64ToArrayBuffer, base64ToTypedArray, typedArrayToBase64, typedArrayToBuffer } from '../src/core.js';
import { deserialize, serialize } from '../src/serializer-facade.js';

test('mapping', async () => {
    class Clazz {
        Int8Array: Int8Array = new Int8Array(1);
        Uint8Array: Uint8Array = new Uint8Array(2);
        Uint8ClampedArray: Uint8ClampedArray = new Uint8ClampedArray(3);
        Int16Array: Int16Array = new Int16Array(4);
        Uint16Array: Uint16Array = new Uint16Array(5);
        Int32Array: Int32Array = new Int32Array(6);
        Uint32Array: Uint32Array = new Uint32Array(7);
        Float32Array: Float32Array = new Float32Array(8);
        Float64Array: Float64Array = new Float64Array(9);
    }

    const classSchema = ReflectionClass.from(Clazz);
    const clazz = new Clazz;
    const json = serialize<Clazz>(clazz);
    const back = deserialize<Clazz>(json);

    for (const property of classSchema.getProperties()) {
        assertType(property.type, ReflectionKind.class);
        expect(binaryTypes.includes(property.type.classType)).toBe(true);
        expect(typeof (json as any)[property.getNameAsString()]).toBe('string');
        expect((back as any)[property.getNameAsString()]).toBeInstanceOf(property.type.classType);
    }
});

test('Int8Array', async () => {
    class Clazz {
        ints: Int8Array = new Int8Array();
    }

    const clazz = new Clazz();
    clazz.ints = new Int8Array(2);
    clazz.ints[0] = 'a'.charCodeAt(0);
    clazz.ints[1] = 'm'.charCodeAt(0);

    expect(ReflectionClass.from(Clazz).getProperty('ints').type).toMatchObject({ kind: ReflectionKind.class, classType: Int8Array });

    const plain = serialize<Clazz>(clazz);
    expect(typeof plain.ints).toBe('string');
    expect(plain.ints).toBe('YW0=');

    const clazz2 = deserialize<Clazz>(plain);
    expect(clazz2.ints).toBeInstanceOf(Int8Array);
    expect(clazz2.ints[0]).toBe('a'.charCodeAt(0));
    expect(clazz2.ints[1]).toBe('m'.charCodeAt(0));
});

test('Float32Array', async () => {
    class Clazz {
        floats: Float32Array = new Float32Array();
    }

    const clazz = new Clazz();
    clazz.floats = new Float32Array(2);
    clazz.floats[0] = 256.0;
    clazz.floats[1] = 23029.445;
    console.log(clazz.floats);

    expect(clazz.floats.buffer.byteLength).toBe(8);
    expect(clazz.floats.buffer.byteLength).toBe(Float32Array.BYTES_PER_ELEMENT * 2);
    // expect(Buffer.from(clazz.floats).byteLength).toBe(Float32Array.BYTES_PER_ELEMENT * 2);
    expect(Buffer.from(clazz.floats.buffer).byteLength).toBe(Float32Array.BYTES_PER_ELEMENT * 2);

    expect(ReflectionClass.from(Clazz).getProperty('floats').type).toMatchObject({ kind: ReflectionKind.class, classType: Float32Array });

    expect(typedArrayToBase64(clazz.floats)).toBe('AACAQ+Tqs0Y=');
    expect(base64ToArrayBuffer('AACAQ+Tqs0Y=').byteLength).toBe(8);
    expect(new Float32Array(base64ToArrayBuffer('AACAQ+Tqs0Y=')).length).toBe(2);
    expect(base64ToTypedArray('AACAQ+Tqs0Y=', Float32Array).length).toBe(2);

    const plain = serialize<Clazz>(clazz);
    expect(typeof plain.floats).toBe('string');
    expect(plain.floats).toBe('AACAQ+Tqs0Y=');


    //this errors since Buffer.buffer is corrupt
    // expect(Buffer.from('ab').buffer.byteLength).toBe(2);
    // expect(Buffer.from('AACAQ+Tqs0Y=', 'base64').buffer.byteLength).toBe(8);
    const buf = Buffer.from('AACAQ+Tqs0Y=', 'base64');
    const a32 = new Float32Array(buf.buffer, buf.byteOffset, buf.length / Float32Array.BYTES_PER_ELEMENT);
    expect(a32.length).toBe(2);
    expect(a32[0]).toBe(256.0);
    expect(a32[1]).toBeCloseTo(23029.445, 3);

    expect(new Float32Array(new Uint8Array(Buffer.from('AACAQ/ZDCU8=', 'base64')).buffer).length).toBe(2);

    const clazz2 = deserialize<Clazz>(plain);
    expect(clazz2.floats).toBeInstanceOf(Float32Array);
    expect(clazz2.floats.length).toBe(2);
    expect(clazz2.floats.byteLength).toBe(8);
    expect(Buffer.from(clazz2.floats.buffer, clazz2.floats.byteOffset, clazz2.floats.byteLength).byteLength).toBe(8);
    expect(Buffer.from(clazz2.floats.buffer, clazz2.floats.byteOffset, clazz2.floats.byteLength).length).toBe(8);
    expect(typedArrayToBuffer(clazz2.floats).byteLength).toBe(8);
    expect(typedArrayToBuffer(clazz2.floats).length).toBe(8);
    expect(typedArrayToBase64(clazz2.floats)).toBe('AACAQ+Tqs0Y=');

    expect(Buffer.from(clazz2.floats).toString('base64')).not.toBe('AACAQ+Tqs0Y=');
    // since node uses Buffer pooling, the underlying buffer is way bigger
    // expect(Buffer.from(clazz2.floats.buffer).toString('base64')).not.toBe('AACAQ+Tqs0Y=');

    expect(clazz2.floats.length).toBe(2);
    expect(clazz2.floats.byteLength).toBe(8);

    expect(clazz2.floats[0]).toBe(256.0);
    expect(clazz2.floats[1]).toBeCloseTo(23029.445, 3);
});

test('arrayBuffer', async () => {
    class Clazz {
        ints?: ArrayBuffer;
    }

    const clazz = new Clazz();
    clazz.ints = new Int8Array(2);
    (clazz.ints as Int8Array)[0] = 1;
    (clazz.ints as Int8Array)[1] = 64;

    expect(ReflectionClass.from(Clazz).getProperty('ints').type).toMatchObject({ kind: ReflectionKind.class, classType: ArrayBuffer });
    expect(new Int8Array(clazz.ints!)[0]).toBe(1);
    expect(new Int8Array(clazz.ints!)[1]).toBe(64);

    const plain = serialize<Clazz>(clazz);
    expect(typeof plain.ints).toBe('string');
    expect(plain.ints).toBe('AUA=');

    const clazz2 = deserialize<Clazz>(plain);
    expect(clazz2.ints).not.toBeInstanceOf(Int8Array);
    expect(clazz2.ints).toBeInstanceOf(ArrayBuffer);
    expect(clazz2.ints!.byteLength).toBe(2);
    expect(new Int8Array(clazz2.ints!)[0]).toBe(1);
    expect(new Int8Array(clazz2.ints!)[1]).toBe(64);
});
