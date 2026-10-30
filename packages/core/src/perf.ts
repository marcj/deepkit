/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */

let fastProto: any = null;

// Creates an object with permanently fast properties in V8 (from to-fast-properties, MIT), see
// https://medium.com/@tverwaes/setting-up-prototypes-in-v8-ec9c9491dfe2#5f62
// A prototype object gets fast properties once it is checked against the inline cache of a function.
function FastObject(this: any, o: any): any {
    if (fastProto !== null && typeof fastProto.property) {
        const result = fastProto;
        fastProto = FastObject.prototype = null;
        return result;
    }
    fastProto = FastObject.prototype = o == null ? Object.create(null) : o;
    return new (FastObject as any)();
}

// initialize the inline property cache of FastObject
for (let i = 0; i <= 10; i++) (FastObject as any)();

export function toFastProperties(obj: any) {
    (FastObject as any)(obj);
}
