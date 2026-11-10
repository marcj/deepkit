import { AutoBufferSerializer, BSONType, BaseParser, bsonBinarySerializer, seekElementSize } from '@deepkit/bson';
import { ClassType, CompilerContext, TypeAnnotation } from '@deepkit/core';
import { InjectorModule } from '@deepkit/injector';
import {
    JitStack,
    NamingStrategy,
    ReflectionKind,
    TemplateState,
    Type,
    TypePropertySignature,
    TypeTuple,
    UnpopulatedCheck,
    executeTemplates,
    getTypeJitContainer,
    isOptional,
    serializeType,
    typeSettings,
    unpopulatedSymbol,
    validationAnnotation,
    metaAnnotation,
} from '@deepkit/type';

import { getActions } from './decorators.js';
import { SchemaMapping, fnv1aHash, schemaMapping } from './encoders.js';
import { ActionMode, RpcError } from './model.js';
import type { ActionTypes } from './server/action.js';
import type { RpcCacheAction } from './server/kernel.js';

export interface ActionEntry {
    id: number;
    controllerName: string;
    methodName: string;
    classType: ClassType;
    module?: InjectorModule;
    mode: ActionMode;
    parameters: TypeTuple;
    type: Type;

    cache?: RpcCacheAction;
    /** The returned array is reused by the next call. */
    decode?: ParameterDeserializer;
    /** Indexes of the parameters that are views on the frame, see TransientBytes. */
    transient?: number[];
    /** The decoder already guarantees the parameter types, there is nothing a validator could add. */
    validate: boolean;
    encodeResult?: AutoBufferSerializer;
    warnResultType: boolean;
}

export const maxActions = 0xffff;

/**
 * Maps numeric action ids to controller actions and holds the schema that is sent to clients in the handshake.
 * Ids are never reassigned: a client may be connected while a controller is registered later.
 */
export class ActionDispatcher {
    entries: ActionEntry[] = [];
    protected entryIds = new Map<string, ActionEntry>();

    /** Set by the kernel: rebuilds when a controller was registered since the last build. */
    rebuild?: () => void;

    schemaMessage: Uint8Array = schemaMapping.encode({});
    schemaHash: number = fnv1aHash(this.schemaMessage);

    build(
        controllers: Iterable<[string, { controller: ClassType; module?: InjectorModule }]>,
        loadTypes: (controller: string, method: string) => ActionTypes,
    ): void {
        const mapping: SchemaMapping = {};

        for (const [controllerName, { controller, module }] of controllers) {
            const actions: SchemaMapping[string] = (mapping[controllerName] = []);
            for (const name of getActions(controller).keys()) {
                let types: ActionTypes;
                try {
                    types = loadTypes(controllerName, name);
                } catch (error: any) {
                    // reported to whoever calls it
                    actions.push([name, -1, 'arbitrary', error.message, undefined]);
                    continue;
                }

                const key = controllerName + '!' + name;
                let entry = this.entryIds.get(key);
                if (!entry) {
                    if (this.entries.length > maxActions) throw new RpcError(`Too many RPC actions (${maxActions})`);
                    entry = {
                        id: this.entries.length,
                        controllerName,
                        methodName: name,
                        classType: controller,
                        module,
                        mode: types.mode,
                        parameters: types.parameters,
                        type: types.type,
                        validate: true,
                        warnResultType: false,
                    };
                    this.entries.push(entry);
                    this.entryIds.set(key, entry);
                } else {
                    entry.classType = controller;
                    entry.module = module;
                    entry.mode = types.mode;
                    entry.parameters = types.parameters;
                    entry.type = types.type;
                    entry.cache = undefined;
                    entry.decode = undefined;
                    entry.encodeResult = undefined;
                }
                const strict = types.strictSerialization;
                actions.push([
                    name,
                    entry.id,
                    types.mode,
                    serializeType(strict ? types.parameters : anyParametersType),
                    serializeType(strict ? types.type : anyType),
                ]);
            }
        }

        this.schemaMessage = schemaMapping.encode(mapping);
        this.schemaHash = fnv1aHash(this.schemaMessage);
    }

    prepare(entry: ActionEntry, cache: RpcCacheAction, strict: boolean): void {
        entry.cache = cache;
        entry.decode = createParameterDeserializer(strict ? entry.parameters : anyParametersType);
        entry.encodeResult = createReturnSerializer(strict ? entry.type : anyType);
        entry.transient = strict
            ? entry.parameters.types.flatMap((member, i) => (isTransientBytes(member.type) ? [i] : []))
            : [];
        entry.validate = !strict || entry.parameters.types.some(member => !decoderGuaranteesType(member.type));
        cache.types.nextValueEncoder = createReturnSerializer(strict ? nextValueType(cache.types) : anyType);
    }
}

/**
 * Bytes of a parameter that are a view on the received frame instead of a copy.
 * Only valid during the synchronous part of the action: for what is forwarded or read right away, not for what is kept.
 */
export type TransientBytes = Uint8Array & TypeAnnotation<'rpcTransientBytes'>;

function isTransientBytes(type: Type): boolean {
    return metaAnnotation.getType(type, 'rpcTransientBytes') !== undefined;
}

function decoderGuaranteesType(type: Type): boolean {
    return (
        (type.kind === ReflectionKind.number ||
            type.kind === ReflectionKind.string ||
            type.kind === ReflectionKind.boolean) &&
        (type.kind !== ReflectionKind.number || !type.brand) &&
        validationAnnotation.getAnnotations(type).length === 0
    );
}

export function nextValueType(types: ActionTypes): Type {
    return (types.observableNextSchema!.types as TypePropertySignature[]).find(v => v.name === 'v')!.type;
}

export type ParameterDeserializer = (message: Uint8Array, offset: number, frameEnd: number) => any[];
export type ReturnDeserializer = (message: Uint8Array, offset: number, frameEnd: number) => any;

interface BodyMember {
    type: Type;
    /** Whether undefined is a value of it. */
    optional: boolean;
    /** Declared with `?`: it may be left out at the end, which a required parameter accepting undefined may not. */
    omittable: boolean;
    path: string[];
    rest: boolean;
    /** A number that is written in one byte when it is a small integer, see smallIntegerTag. */
    small?: boolean;
    /** The value can be a PreSerialized one, which is written as is. */
    preSerialized?: boolean;
}

/**
 * A byte from this one on, up to smallIntegerEnd, is a type byte that is the value at the same time: the integer
 * byte - smallIntegerTag. BSON has no type in this range. Only message bodies use it, the body of a call stays as it is.
 */
const smallIntegerTag = 0x80;
const smallIntegerEnd = 0xff;
const smallIntegerMax = smallIntegerEnd - smallIntegerTag - 1;

function toBodyMembers(tuple: TypeTuple, path: string): BodyMember[] {
    return tuple.types.map((member, i) => {
        const rest = member.type.kind === ReflectionKind.rest;
        return {
            type: rest ? (member.type as any).type : member.type,
            optional: !!member.optional || isOptional(member.type),
            omittable: !!member.optional,
            path: [path, 'string' === typeof member.name && member.name ? member.name : String(i)],
            rest,
        };
    });
}

function valueMember(type: Type): BodyMember {
    return { type, optional: true, omittable: false, path: ['v'], rest: false };
}

function memberSerializerCode(context: CompilerContext, member: BodyMember, accessor: string): string {
    const state = new TemplateState(
        '',
        accessor,
        context,
        bsonBinarySerializer.bsonSerializeRegistry,
        new NamingStrategy(),
        new JitStack(),
        [''],
    ).disableSetter();
    for (const part of member.path) state.extendPath(part);
    let value = `
    state.writer.buffer[state.writer.offset] = ${BSONType.UNDEFINED};
    state.writer.typeOffset = state.writer.offset++;
    ${executeTemplates(state, member.type)}
    state.writer.typeOffset = 0;
    `;
    if (member.small) {
        value = `
        if (typeof ${accessor} === 'number' && ${accessor} >= 0 && ${accessor} <= ${smallIntegerMax} && (${accessor} | 0) === ${accessor}) {
            state.writer.writeByte(${smallIntegerTag} + ${accessor});
        } else {
            ${value}
        }`;
    }
    if (member.preSerialized) {
        // the element is <type byte><"v\0"><value>, without the name it is what a body contains
        value = `
        if (${accessor} instanceof PreSerialized) {
            state.writer.writeByte(${accessor}.element[0]);
            state.writer.writeBuffer(${accessor}.element, 3);
        } else {
            ${value}
        }`;
    }
    return member.optional
        ? `if (${accessor} === undefined) { state.writer.writeByte(${BSONType.UNDEFINED}); } else { ${value} }`
        : value;
}

function memberDeserializerCode(context: CompilerContext, member: BodyMember, target: string): string {
    const state = new TemplateState(
        target,
        '',
        context,
        bsonBinarySerializer.bsonDeserializeRegistry,
        new NamingStrategy(),
        new JitStack(),
        [''],
    );
    state.target = 'deserialize';
    for (const part of member.path) state.extendPath(part);
    let value = executeTemplates(state, member.type);
    if (isTransientBytes(member.type)) {
        value = `if (state.elementType === ${BSONType.BINARY}) { ${target} = parser.parseBinaryView(); } else { ${value} }`;
    }
    if (member.small) {
        value = `if (state.elementType >= ${smallIntegerTag} && state.elementType < ${smallIntegerEnd}) { ${target} = state.elementType - ${smallIntegerTag}; } else { ${value} }`;
    }
    return `
    state.elementType = parser.eatByte();
    var elementType = state.elementType;
    ${member.optional ? `if (state.elementType === ${BSONType.UNDEFINED}) { ${target} = undefined; } else { ${value} }` : value}
    `;
}

/**
 * The body of a call and of a result: each value as a BSON type byte followed by the BSON value, one after
 * the other, without a document, names or array indexes. An optional member that is undefined is the type
 * byte of undefined and keeps the position of the following ones. Omittable members at the end that aren't
 * given are not written at all, the frame just ends.
 */
function setSerializerCode(context: CompilerContext, code: string[], tuple: TypeTuple, path: string): void {
    context.set({ typeSettings, UnpopulatedCheck, unpopulatedSymbol, seekElementSize });
    const members = toBodyMembers(tuple, path);

    let omittableFrom = members.length;
    while (omittableFrom > 0 && !members[omittableFrom - 1].rest && members[omittableFrom - 1].omittable)
        omittableFrom--;

    code.push(`var length = data.length;`);
    if (omittableFrom < members.length)
        code.push(`while (length > ${omittableFrom} && data[length - 1] === undefined) length--;`);
    code.push(`
    var unpopulatedCheck = typeSettings.unpopulatedCheck;
    typeSettings.unpopulatedCheck = UnpopulatedCheck.ReturnSymbol;
    `);

    members.forEach((member, i) => {
        if (member.rest) {
            code.push(`
    for (var i = ${i}; i < length; i++) {
        var v${i} = data[i];
        ${memberSerializerCode(context, member, `v${i}`)}
    }
            `);
            return;
        }
        const body = `var v${i} = data[${i}];\n${memberSerializerCode(context, member, `v${i}`)}`;
        code.push(i >= omittableFrom ? `if (${i} < length) { ${body} }` : body);
    });

    code.push(`typeSettings.unpopulatedCheck = unpopulatedCheck;`);
}

function setDeserializerCode(context: CompilerContext, code: string[], tuple: TypeTuple, path: string): void {
    const parser = new BaseParser(new Uint8Array(0), 0);
    context.set({ parser, state: { parser }, seekElementSize });
    code.push(`parser.buffer = message; parser.offset = offset; parser.size = frameEnd;`);

    toBodyMembers(tuple, path).forEach((member, i) => {
        if (member.rest) {
            code.push(`
    while (parser.offset < frameEnd) {
        var v${i};
        ${memberDeserializerCode(context, member, `v${i}`)}
        result.push(v${i});
    }
            `);
            return;
        }
        code.push(`
    if (parser.offset < frameEnd) {
        var v${i};
        ${memberDeserializerCode(context, member, `v${i}`)}
        result[written++] = v${i};
    } ${member.omittable ? '' : `else { result[written++] = undefined; }`}
        `);
    });
}

export function createParameterSerializer(parameters: TypeTuple): AutoBufferSerializer {
    const context = new CompilerContext();
    const code: string[] = [];
    setSerializerCode(context, code, parameters, 'args');
    return context.raw(`
return function parameterSerializer(data, state) {
    ${code.join('\n')}
};
    `) as AutoBufferSerializer;
}

/**
 * Reads the arguments into an array that is reused for every call unless there is a rest parameter, so the
 * caller has to be done with it before the next call. Must not be called re-entrantly.
 */
export function createParameterDeserializer(parameters: TypeTuple): ParameterDeserializer {
    const context = new CompilerContext();
    const code: string[] = [];
    const size = parameters.types.length;
    const hasRest = parameters.types.some(v => v.type.kind === ReflectionKind.rest);
    context.set({ values: new Array(size).fill(undefined) });
    setDeserializerCode(context, code, parameters, 'args');
    return context.raw(`
return function parameterDeserializer(message, offset, frameEnd) {
    ${hasRest ? 'var result = [];' : `var result = values; if (result.length !== ${size}) result.length = ${size};`}
    var written = 0;
    ${code.join('\n')}
    ${hasRest ? '' : `if (written !== ${size}) result.length = written;`}
    return result;
};
    `) as ParameterDeserializer;
}

export function createReturnSerializer(type: Type): AutoBufferSerializer {
    const context = new CompilerContext();
    if (type.kind === ReflectionKind.tuple) {
        const code: string[] = [];
        setSerializerCode(context, code, type, 'v');
        return context.raw(`
return function returnSerializer(data, state) {
    ${code.join('\n')}
};
        `) as AutoBufferSerializer;
    }

    context.set({ typeSettings, UnpopulatedCheck, unpopulatedSymbol, seekElementSize });
    return context.raw(`
return function returnSerializer(data, state) {
    var unpopulatedCheck = typeSettings.unpopulatedCheck;
    typeSettings.unpopulatedCheck = UnpopulatedCheck.ReturnSymbol;
    ${memberSerializerCode(context, valueMember(type), 'data')}
    typeSettings.unpopulatedCheck = unpopulatedCheck;
};
    `) as AutoBufferSerializer;
}

export function createReturnDeserializer(type: Type): ReturnDeserializer {
    const context = new CompilerContext();
    if (type.kind === ReflectionKind.tuple) {
        const code: string[] = [];
        setDeserializerCode(context, code, type, 'v');
        return context.raw(`
return function returnDeserializer(message, offset, frameEnd) {
    var result = [];
    var written = 0;
    ${code.join('\n')}
    return result;
};
        `) as ReturnDeserializer;
    }

    const parser = new BaseParser(new Uint8Array(0), 0);
    context.set({ parser, state: { parser }, seekElementSize });
    return context.raw(`
return function returnDeserializer(message, offset, frameEnd) {
    parser.buffer = message; parser.offset = offset; parser.size = frameEnd;
    var result;
    ${memberDeserializerCode(context, valueMember(type), 'result')}
    return result;
};
    `) as ReturnDeserializer;
}

/**
 * A value serialized once, to be sent in many messages. It is what preSerialize() returns.
 * The bytes are identical to serializing the value in place.
 */
export class PreSerialized {
    constructor(
        /** BSON element for key "v": type byte, key, value. */
        public readonly element: Uint8Array,
    ) {}
}

export type BodySerializer = AutoBufferSerializer;

export interface BodyCodec {
    serialize: BodySerializer;
    deserialize: ReturnDeserializer;
}

/** Whether every value of the type is a number or nothing, so it can be written as small integer. */
function isNumberMember(type: Type): boolean {
    if (type.kind === ReflectionKind.number) return true;
    if (type.kind !== ReflectionKind.union) return false;
    return type.types.every(
        v => v.kind === ReflectionKind.number || v.kind === ReflectionKind.undefined || v.kind === ReflectionKind.null,
    );
}

/** The properties of a body that is written positionally, undefined when the type has anything but plain properties. */
function bodyProperties(type: Type): TypePropertySignature[] | undefined {
    if (type.kind !== ReflectionKind.objectLiteral) return undefined;
    for (const member of type.types) {
        if (member.kind !== ReflectionKind.propertySignature || 'symbol' === typeof member.name) return undefined;
    }
    return type.types as TypePropertySignature[];
}

function toObjectBodyMembers(properties: TypePropertySignature[]): BodyMember[] {
    return properties.map(property => ({
        type: property.type,
        optional: !!property.optional || isOptional(property.type),
        omittable: !!property.optional,
        path: ['body', String(property.name)],
        rest: false,
        small: isNumberMember(property.type),
        preSerialized: property.name === 'v',
    }));
}

function createObjectBodySerializer(properties: TypePropertySignature[]): BodySerializer {
    const context = new CompilerContext();
    context.set({ typeSettings, UnpopulatedCheck, unpopulatedSymbol, seekElementSize, PreSerialized });
    const members = toObjectBodyMembers(properties);
    const read = (i: number) => `body[${JSON.stringify(String(properties[i].name))}]`;

    let omittableFrom = members.length;
    while (omittableFrom > 0 && members[omittableFrom - 1].omittable) omittableFrom--;

    const code: string[] = [`var count = ${members.length};`];
    for (let i = members.length - 1; i >= omittableFrom; i--) {
        code.push(`if (count === ${i + 1} && ${read(i)} === undefined) count = ${i};`);
    }
    members.forEach((member, i) => {
        const value = `var v${i} = ${read(i)};\n${memberSerializerCode(context, member, `v${i}`)}`;
        code.push(i >= omittableFrom ? `if (${i} < count) { ${value} }` : value);
    });
    code.push(`typeSettings.unpopulatedCheck = unpopulatedCheck;`);

    return context.raw(`
return function bodySerializer(body, state) {
    var unpopulatedCheck = typeSettings.unpopulatedCheck;
    typeSettings.unpopulatedCheck = UnpopulatedCheck.ReturnSymbol;
    ${code.join('\n')}
};
    `) as BodySerializer;
}

function createObjectBodyDeserializer(properties: TypePropertySignature[]): ReturnDeserializer {
    const context = new CompilerContext();
    const parser = new BaseParser(new Uint8Array(0), 0);
    context.set({ parser, state: { parser }, seekElementSize });
    const code = toObjectBodyMembers(properties).map((member, i) => {
        const name = JSON.stringify(String(properties[i].name));
        return `
    if (parser.offset < frameEnd) {
        var v${i};
        ${memberDeserializerCode(context, member, `v${i}`)}
        ${member.optional ? `if (v${i} !== undefined) ` : ''}body[${name}] = v${i};
    }
        `;
    });
    return context.raw(`
return function bodyDeserializer(message, offset, frameEnd) {
    parser.buffer = message; parser.offset = offset; parser.size = frameEnd;
    var body = {};
    ${code.join('\n')}
    return body;
};
    `) as ReturnDeserializer;
}

function createBodyCodec(type: Type): BodyCodec {
    const properties = bodyProperties(type);
    if (!properties) return { serialize: createReturnSerializer(type), deserialize: createReturnDeserializer(type) };

    return {
        serialize: createObjectBodySerializer(properties),
        deserialize: createObjectBodyDeserializer(properties),
    };
}

/**
 * How the body of a message of the given type is written: the values of its properties one after the other in the
 * order they are declared, exactly like the arguments of a call. A property that isn't given keeps its position, see
 * setSerializerCode. Any other type is a single value.
 */
export function getBodyCodec(type: Type): BodyCodec {
    // resolving a type can give a new object each time, what they share is the container of their compiled functions
    const jit = getTypeJitContainer(type);
    return (jit.rpcBodyCodec ||= createBodyCodec(type));
}

export const anyType: Type = { kind: ReflectionKind.any };

export const anyParametersType: TypeTuple = {
    kind: ReflectionKind.tuple,
    types: [
        {
            kind: ReflectionKind.tupleMember,
            parent: undefined as any,
            type: {
                kind: ReflectionKind.rest,
                parent: undefined as any,
                type: { kind: ReflectionKind.any },
            },
        },
    ],
};
