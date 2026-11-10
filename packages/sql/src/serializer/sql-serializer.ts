/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */

import {
    ContainerAccessor,
    executeTemplates,
    handleUnion,
    isBackReferenceType,
    isPropertyMemberType,
    isReferenceType,
    isUUIDType,
    nodeBufferToArrayBuffer,
    nodeBufferToTypedArray,
    referenceAnnotation,
    ReflectionClass,
    ReflectionKind,
    serializeObjectLiteral,
    Serializer,
    TemplateState,
    Type,
    TypeArray,
    TypeClass,
    typedArrayToBuffer,
    TypeObjectLiteral,
    TypeUnion,
    uuidAnnotation,
} from '@deepkit/type';
import { typeRequiresJSONCast } from '../platform/default-platform.js';

export const hexTable: string[] = [];
for (let i = 0; i < 256; i++) {
    hexTable[i] = (i <= 15 ? '0' : '') + i.toString(16);
}

/**
 * Only direct properties of an entity will be serialized in some special way.
 * Deeper types get the normal JSON serialization.
 */
export function isDirectPropertyOfEntity(state: TemplateState): boolean {
    // Entities can be child of another entity without Reference,
    // so in order to detect a type being in direct property of an entity,
    // we look at state.parentTypes, which can only be
    //  - [class|objectLiteral, property|indexSignature, this];
    //  - [class|objectLiteral, property|indexSignature, union, this];
    //  - [property|indexSignature, this];
    //  - [property|indexSignature, union, this];
    //  - [class|objectLiteral, property|indexSignature, Class|objectLiteral & Reference, this];
    //  - [property|indexSignature, Class|objectLiteral & Reference, this];

    if (state.parentTypes.length < 2) return false;

    if (isPropertyMemberType(state.parentTypes[0]) || state.parentTypes[0].kind === ReflectionKind.indexSignature) {
        if (state.parentTypes[1].kind === ReflectionKind.union) {
            return state.parentTypes.length === 3;
        }

        if (state.parentTypes.length === 3 && isReferenceType(state.parentTypes[1])) {
            return true;
        }

        return state.parentTypes.length === 2;
    }

    if (state.parentTypes.length < 3) return false;

    if (state.parentTypes[0].kind !== ReflectionKind.class && state.parentTypes[0].kind !== ReflectionKind.objectLiteral) return false;

    if (state.parentTypes[1].kind !== ReflectionKind.property
        && state.parentTypes[1].kind !== ReflectionKind.propertySignature
        && state.parentTypes[1].kind !== ReflectionKind.indexSignature) return false;

    if (state.parentTypes[2].kind === ReflectionKind.union) {
        return state.parentTypes.length === 3 || state.parentTypes.length === 4;
    }

    if (state.parentTypes.length === 4 && isReferenceType(state.parentTypes[2])) {
        return true;
    }

    return state.parentTypes.length === 3;
}

function serializeSqlAny(type: Type, state: TemplateState) {
    if (!isDirectPropertyOfEntity(state)) {
        state.addSetter(`${state.accessor}`);
        return;
    }

    state.setContext({ jsonStringify: JSON.stringify });
    state.addSetter(`jsonStringify(${state.accessor})`);
}

function deserializeSqlAny(type: Type, state: TemplateState) {
    if (!isDirectPropertyOfEntity(state)) {
        state.addSetter(`${state.accessor}`);
        return;
    }
    state.setContext({ jsonParse: JSON.parse });
    state.addCode(`${state.setter} = 'string' === typeof ${state.accessor} ? jsonParse(${state.accessor}) : ${state.accessor};`);
}

/**
 * For sql databases, objects will be serialised as JSON string.
 */
function serializeSqlArray(type: TypeArray, state: TemplateState) {
    if (undefined !== referenceAnnotation.getFirst(type)) return;

    if (!isDirectPropertyOfEntity(state)) return;

    state.setContext({ stringify: JSON.stringify });
    state.addSetter(`stringify(${state.accessor})`);
}

/**
 * For sql databases, objects will be serialised as JSON string.
 */
function deserializeSqlArray(type: TypeArray, state: TemplateState) {
    if (undefined !== referenceAnnotation.getFirst(type)) return;

    if (!isDirectPropertyOfEntity(state)) return;

    state.addCode(`${state.setter} = 'string' === typeof ${state.accessor} ? JSON.parse(${state.accessor}) : ${state.accessor};`);
}

/**
 * For sql databases, objects will be serialised as JSON string.
 */
function serializeSqlObjectLiteral(type: TypeClass | TypeObjectLiteral, state: TemplateState) {
    if (isReferenceType(type) || isBackReferenceType(type)) {
        serializeReferencedType(type, state);
    } else {
        serializeObjectLiteral(type, state);

        if (isDirectPropertyOfEntity(state)) {
            //TypeClass|TypeObjectLiteral properties are serialized as JSON
            state.setContext({ stringify: JSON.stringify });
            state.addSetter(`stringify(${state.accessor})`);
        }
    }
}

/**
 * For sql databases, objects will be serialised as JSON string. So deserialize it correctly
 */
function deserializeSqlObjectLiteral(type: TypeClass | TypeObjectLiteral, state: TemplateState) {
    if (isReferenceType(type) || isBackReferenceType(type)) {
        deserializeReferencedType(type, state);
    } else {
        if (isDirectPropertyOfEntity(state)) {
            //TypeClass|TypeObjectLiteral properties are serialized as JSON
            state.setContext({ jsonParse: JSON.parse });
            state.addCode(`${state.accessor} = 'string' === typeof ${state.accessor} ? jsonParse(${state.accessor}) : ${state.accessor}`);
        }

        serializeObjectLiteral(type, state);
    }
}

function serializeSqlUnion(type: TypeUnion, state: TemplateState) {
    // // usually DB return JSON string, which we need to convert to objects first so the default union handler can work.
    // if (isDirectPropertyOfEntity(state) && typeRequiresJSONCast(type)) {
    //     state.setContext({ stringify: JSON.stringify });
    //     state.addSetter(`stringify(${state.accessor})`);
    // }

    handleUnion(type, state);
}

function deserializeSqlUnion(type: TypeUnion, state: TemplateState) {
    // usually DB return JSON string, which we need to convert to objects first so the default union handler can work.
    if (isDirectPropertyOfEntity(state) && typeRequiresJSONCast(type)) {
        // This must currently be in line with Platform's type detection (this.addType()),
        // so this code expects that typeRequiresJSONCast knows when all platforms store JSON in the database,
        // which make change in the future. Then we need to have information from the platform in this template function here.
        state.setContext({ jsonParse: JSON.parse });
        state.addCode(`${state.accessor} = 'string' === typeof ${state.accessor} ? jsonParse(${state.accessor}) : ${state.accessor}`);
    }

    handleUnion(type, state);
}

function serializeReferencedType(type: Type, state: TemplateState) {
    if (type.kind !== ReflectionKind.class && type.kind !== ReflectionKind.objectLiteral) return;
    // state.setContext({ isObject, isReferenceType, isReferenceHydrated });
    const reflection = ReflectionClass.from(type);
    //the primary key is serialised for unhydrated references
    state.template = `
        ${executeTemplates(state.fork(state.setter, new ContainerAccessor(state.accessor, JSON.stringify(reflection.getPrimary().getName()))), reflection.getPrimary().getType())}
    `;
}

function deserializeReferencedType(type: Type, state: TemplateState) {
    if (type.kind !== ReflectionKind.class && type.kind !== ReflectionKind.objectLiteral) return;
    // state.setContext({ isObject, isReferenceType, isReferenceHydrated });
    const reflection = ReflectionClass.from(type);
    //the primary key is serialised for unhydrated references
    state.template = `
        ${executeTemplates(state.fork(), reflection.getPrimary().getType())}
    `;
}

export class SqlSerializer extends Serializer {
    name = 'sql';

    override setExplicitUndefined(type: Type, state: TemplateState): boolean {
        //make sure that `foo?: string` is not explicitly set to undefined when database returns `null`.
        if (state.target === 'deserialize') return false;
        return true;
    }

    protected registerSerializers() {
        super.registerSerializers();

        this.serializeRegistry.registerClass(Date, (type, state) => {
            //SQL escape does the job.
            state.addSetter(`${state.accessor}`);
        });

        const uuidType = uuidAnnotation.registerType({ kind: ReflectionKind.string }, true);

        this.serializeRegistry.register(ReflectionKind.any, serializeSqlAny);
        this.deserializeRegistry.register(ReflectionKind.any, deserializeSqlAny);
        this.serializeRegistry.register(ReflectionKind.unknown, serializeSqlAny);
        this.deserializeRegistry.register(ReflectionKind.unknown, deserializeSqlAny);

        this.deserializeRegistry.register(ReflectionKind.string, (type, state) => {
            //remove string enforcement, since UUID/MongoId are string but received as binary
            state.addSetter(state.accessor);
        });

        this.deserializeRegistry.removeDecorator(uuidType);
        this.deserializeRegistry.addDecorator(isUUIDType, (type, state) => {
            state.setContext({ uuid4Stringify });
            state.addCodeForSetter(`
                try {
                    ${state.setter} = 'string' === typeof ${state.accessor} ? ${state.accessor} : uuid4Stringify(${state.accessor});
                } catch (error) {
                    throw new TypeError('Invalid UUID v4: ' + error);
                }
            `);
        });

        this.serializeRegistry.removeDecorator(uuidType);
        this.serializeRegistry.addDecorator(isUUIDType, (type, state) => {
            if (!isDirectPropertyOfEntity(state)) {
                return;
            }
            state.setContext({ uuid4Binary });
            state.addCodeForSetter(`
                try {
                    ${state.setter} = uuid4Binary(${state.accessor});
                } catch (error) {
                    throw new TypeError('Invalid UUID v4: ' + error);
                }
            `);
        });

        this.serializeRegistry.register(ReflectionKind.class, serializeSqlObjectLiteral);
        this.serializeRegistry.register(ReflectionKind.objectLiteral, serializeSqlObjectLiteral);

        this.deserializeRegistry.register(ReflectionKind.class, deserializeSqlObjectLiteral);
        this.deserializeRegistry.register(ReflectionKind.objectLiteral, deserializeSqlObjectLiteral);

        this.serializeRegistry.append(ReflectionKind.array, serializeSqlArray);
        this.deserializeRegistry.prepend(ReflectionKind.array, deserializeSqlArray);

        this.serializeRegistry.register(ReflectionKind.union, serializeSqlUnion);
        this.deserializeRegistry.register(ReflectionKind.union, deserializeSqlUnion);

        //for databases, types decorated with Reference will always only export the primary key.
        // const referenceType = referenceAnnotation.registerType({ kind: ReflectionKind.class, classType: Object, types: [] }, {});
        // this.serializeRegistry.removeDecorator(referenceType);
        // this.serializeRegistry.addDecorator(isReferenceType, serializeReferencedType);
        //
        // //for databases, types decorated with BackReference will always only export the primary key.
        // this.serializeRegistry.addDecorator(isBackReferenceType, serializeReferencedType);

        this.serializeRegistry.registerBinary((type, state) => {
            if (type.classType === ArrayBuffer) {
                state.setContext({ Buffer });
                state.addSetter(`Buffer.from(${state.accessor})`);
            } else {
                state.setContext({ typedArrayToBuffer });
                state.addSetter(`typedArrayToBuffer(${state.accessor})`);
            }
        });

        this.deserializeRegistry.registerBinary((type, state) => {
            if (type.classType === ArrayBuffer) {
                state.setContext({ nodeBufferToArrayBuffer });
                state.addSetter(`nodeBufferToArrayBuffer(${state.accessor})`);
            } else {
                state.setContext({ nodeBufferToTypedArray });
                state.addSetter(`nodeBufferToTypedArray(${state.accessor}, ${state.setVariable('typeArray', type.classType)})`);
            }
        });
    }
}

export const sqlSerializer: Serializer = new SqlSerializer;

const uuidHex = /^[0-9a-fA-F]{32}$/;

export function uuid4Binary(u: any): Buffer {
    if ('string' !== typeof u) return Buffer.alloc(0);
    const hex = u.replace(/-/g, '');
    // Buffer.from stops at the first character that is not hex: 'abc' gave a short buffer, which the database
    // rejected as a protocol error ("insufficient data left in message") instead of an invalid value
    if (!uuidHex.test(hex)) throw new TypeError(`'${u}' is not a UUID`);
    return Buffer.from(hex, 'hex');
}

export function uuid4Stringify(buffer: Buffer): string {
    return hexTable[buffer[0]] + hexTable[buffer[1]] + hexTable[buffer[2]] + hexTable[buffer[3]]
        + '-'
        + hexTable[buffer[4]] + hexTable[buffer[5]]
        + '-'
        + hexTable[buffer[6]] + hexTable[buffer[7]]
        + '-'
        + hexTable[buffer[8]] + hexTable[buffer[9]]
        + '-'
        + hexTable[buffer[10]] + hexTable[buffer[11]] + hexTable[buffer[12]] + hexTable[buffer[13]] + hexTable[buffer[14]] + hexTable[buffer[15]]
        ;
}
