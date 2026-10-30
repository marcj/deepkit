import {
    entityAnnotation,
    EntityOptions,
    findMember,
    isSameType,
    isTypeIncluded,
    isWithAnnotations,
    ReflectionKind,
    ReflectionVisibility,
    Type,
    TypeArray,
    TypeClass,
    typeDecorators,
    TypeEnum,
    TypeFunction,
    TypeIndexSignature,
    TypeLiteral,
    TypeObjectLiteral,
    TypeParameter,
    TypeProperty,
    TypeRest,
    TypeTuple,
    TypeTupleMember,
} from './reflection/type.js';
import { getClassName, getParentClass } from '@deepkit/core';
import { reflect, ReflectionClass, typeOf } from './reflection/reflection.js';
import { typeSettings } from './core.js';
import { regExpFromString } from './utils.js';

export interface SerializedTypeAnnotations {
    entityOptions?: EntityOptions;

    typeName?: string;

    typeArguments?: SerializedTypeReference[];

    indexAccessOrigin?: { container: SerializedTypeReference, index: SerializedTypeReference };

    // annotations will be generated on deserialization from the decorators
    // annotations?: Annotations; //parsed decorator types as annotations

    decorators?: SerializedTypeReference[]; //original decorator type
}

interface SerializedTypeObjectLiteral extends SerializedTypeAnnotations {
    kind: ReflectionKind.objectLiteral,
    types: SerializedTypeReference[];
}

interface SerializedTypeClassType extends SerializedTypeAnnotations {
    kind: ReflectionKind.class,
    name?: string; //@entity.name
    globalObject?: true; //Uint8Array, Date, etc
    classType: string; //getClassName result
    extendsArguments?: SerializedTypeReference[];
    arguments?: SerializedTypeReference[];
    superClass?: SerializedTypeReference;
    types: SerializedTypeReference[];
}

interface SerializedTypeFunction extends SerializedTypeAnnotations {
    kind: ReflectionKind.function,
    name?: number | string | symbol,
    parameters: SerializedTypeParameter[];
    return: SerializedTypeReference;
}

type SerializedTypeReference = number;

interface SimpleSerializedType extends SerializedTypeAnnotations {
    kind: ReflectionKind.never | ReflectionKind.any | ReflectionKind.unknown | ReflectionKind.void | ReflectionKind.object | ReflectionKind.string
        | ReflectionKind.number | ReflectionKind.boolean | ReflectionKind.symbol | ReflectionKind.bigint | ReflectionKind.null | ReflectionKind.undefined | ReflectionKind.regexp;
    origin?: SerializedTypeReference;
}

interface SerializedTypeLiteral extends SerializedTypeAnnotations {
    kind: ReflectionKind.literal,
    literal: { type: 'symbol', name: string } | string | number | boolean | { type: 'bigint', value: string } | { type: 'regex', regex: string };
}

interface SerializedTypeTemplateLiteral extends SerializedTypeAnnotations {
    kind: ReflectionKind.templateLiteral,
    types: SerializedTypeReference[]
}

interface SerializedTypeParameter extends SerializedTypeAnnotations {
    kind: ReflectionKind.parameter,
    name: string;
    type: SerializedTypeReference;

    //parameter could be a property as well if visibility is set
    visibility?: ReflectionVisibility,
    readonly?: true;
    optional?: true,

    /**
     * Set when the parameter has a default value aka initializer.
     */
    default?: true
}

export interface SerializedTypeBaseMember extends SerializedTypeAnnotations {
    visibility: ReflectionVisibility,
    abstract?: true;
    optional?: true,
    readonly?: true;
}

export interface SerializedTypeMethod extends SerializedTypeBaseMember {
    kind: ReflectionKind.method,
    visibility: ReflectionVisibility,
    name: number | string | symbol;
    parameters: SerializedTypeParameter[];
    optional?: true,
    abstract?: true;
    return: SerializedTypeReference;
}

interface SerializedTypeProperty extends SerializedTypeBaseMember {
    kind: ReflectionKind.property,
    visibility: ReflectionVisibility,
    name: number | string | symbol;
    optional?: true,
    readonly?: true;
    abstract?: true;
    description?: string;
    type: SerializedTypeReference;

    /**
     * Set when the property has a default value aka initializer.
     */
    default?: true
}

interface SerializedTypePromise extends SerializedTypeAnnotations {
    kind: ReflectionKind.promise,
    type: SerializedTypeReference;
}

interface SerializedTypeEnum extends SerializedTypeAnnotations {
    kind: ReflectionKind.enum,
    enum: { [name: string]: string | number | undefined | null };
    values: (string | number | undefined | null)[];
    indexType: SerializedTypeReference;
}

export interface SerializedTypeUnion extends SerializedTypeAnnotations {
    kind: ReflectionKind.union,
    types: SerializedTypeReference[];
}

export interface SerializedTypeIntersection extends SerializedTypeAnnotations {
    kind: ReflectionKind.intersection,
    types: SerializedTypeReference[];
}

interface SerializedTypeArray extends SerializedTypeAnnotations {
    kind: ReflectionKind.array,
    type: SerializedTypeReference;
}

interface SerializedTypeIndexSignature extends SerializedTypeAnnotations {
    kind: ReflectionKind.indexSignature,
    index: SerializedTypeReference;
    type: SerializedTypeReference;
}

interface SerializedTypePropertySignature extends SerializedTypeAnnotations {
    kind: ReflectionKind.propertySignature,
    name: number | string | symbol;
    optional?: true;
    readonly?: true;
    description?: string;
    type: SerializedTypeReference;
}

interface SerializedTypeMethodSignature extends SerializedTypeAnnotations {
    kind: ReflectionKind.methodSignature,
    name: number | string | symbol;
    optional?: true;
    parameters: SerializedTypeParameter[];
    return: SerializedTypeReference;
}

export interface SerializedTypeTypeParameter extends SerializedTypeAnnotations {
    kind: ReflectionKind.typeParameter,
    name: string,
}

interface SerializedTypeInfer extends SerializedTypeAnnotations {
    kind: ReflectionKind.infer,
}

interface SerializedTypeTupleMember extends SerializedTypeAnnotations {
    kind: ReflectionKind.tupleMember,
    type: SerializedTypeReference;
    optional?: true;
    name?: string;
}

interface SerializedTypeTuple extends SerializedTypeAnnotations {
    kind: ReflectionKind.tuple,
    types: SerializedTypeTupleMember[]
}

interface SerializedTypeRest extends SerializedTypeAnnotations {
    kind: ReflectionKind.rest,
    type: SerializedTypeReference,
}

export type SerializedType =
    SimpleSerializedType
    | SerializedTypeLiteral
    | SerializedTypeTemplateLiteral
    | SerializedTypeParameter
    | SerializedTypeFunction
    | SerializedTypeMethod
    | SerializedTypeProperty
    | SerializedTypePromise
    | SerializedTypeClassType
    | SerializedTypeEnum
    | SerializedTypeUnion
    | SerializedTypeIntersection
    | SerializedTypeArray
    | SerializedTypeObjectLiteral
    | SerializedTypeIndexSignature
    | SerializedTypePropertySignature
    | SerializedTypeMethodSignature
    | SerializedTypeTypeParameter
    | SerializedTypeInfer
    | SerializedTypeTuple
    | SerializedTypeTupleMember
    | SerializedTypeRest;

export type SerializedTypes = SerializedType[];

declare var window: any;
declare var global: any;

const envGlobal: any = typeof globalThis !== "undefined"
    ? globalThis
    : typeof global !== "undefined"
    ? global
    : window;

function isWithSerializedAnnotations(type: any): type is SerializedTypeAnnotations {
    return isWithAnnotations(type);
}

export interface SerializerState {
    types: SerializedTypes;
    disableMethods?: true;
    refs: Map<Type, number>;
}

function filterRemoveFunctions(v: Type): boolean {
    return v.kind !== ReflectionKind.function && v.kind !== ReflectionKind.method && v.kind !== ReflectionKind.methodSignature;
}

function exportEntityOptions(type: TypeClass | TypeObjectLiteral, result: SerializedType): void {
    const reflection = ReflectionClass.from(type);

    let changed = false;
    const entityAttributes: EntityOptions = {};
    if (reflection.name !== undefined) {
        changed = true;
        entityAttributes.name = reflection.name;
    }
    if (reflection.description) {
        changed = true;
        entityAttributes.description = reflection.description;
    }
    if (reflection.databaseSchemaName !== undefined) {
        changed = true;
        entityAttributes.database = reflection.databaseSchemaName;
    }
    if (reflection.collectionName !== undefined) {
        changed = true;
        entityAttributes.collection = reflection.collectionName;
    }
    if (reflection.singleTableInheritance) {
        changed = true;
        entityAttributes.singleTableInheritance = reflection.singleTableInheritance;
    }
    if (reflection.indexes.length) {
        changed = true;
        entityAttributes.indexes = reflection.indexes;
    }

    if (changed) {
        result.entityOptions = entityAttributes;
    }
}

function assignEntityOptions(type: TypeClass | TypeObjectLiteral, serialized: SerializedType): void {
    if (!serialized.entityOptions) return;
    const entity = entityAnnotation.getFirst(type) || {};

    if (serialized.entityOptions.name !== undefined) entity.name = serialized.entityOptions.name;
    if (serialized.entityOptions.description !== undefined) entity.description = serialized.entityOptions.description;
    if (serialized.entityOptions.database !== undefined) entity.database = serialized.entityOptions.database;
    if (serialized.entityOptions.collection !== undefined) entity.collection = serialized.entityOptions.collection;
    if (serialized.entityOptions.singleTableInheritance !== undefined) entity.singleTableInheritance = serialized.entityOptions.singleTableInheritance;
    if (serialized.entityOptions.indexes !== undefined) entity.indexes = serialized.entityOptions.indexes;

    entityAnnotation.replaceType(type, [entity]);
}

function serialize(type: Type, state: SerializerState): SerializedTypeReference {
    const serialized = state.refs.get(type);
    if (serialized) return serialized;

    const result: SerializedType = { kind: type.kind } as SerializedType;

    state.types.push(result);
    const index = state.types.length - 1;
    state.refs.set(type, index);

    if (type.typeName) result.typeName = type.typeName;
    if (type.decorators) (result as SerializedTypeAnnotations).decorators = type.decorators.map(v => serialize(v, state));
    if (type.typeArguments) (result as SerializedTypeAnnotations).typeArguments = type.typeArguments.map(v => serialize(v, state));
    if (type.indexAccessOrigin) (result as SerializedTypeAnnotations).indexAccessOrigin = {
        index: serialize(type.indexAccessOrigin.index, state),
        container: serialize(type.indexAccessOrigin.container, state)
    };

    switch (type.kind) {
        case ReflectionKind.objectLiteral: {
            if (type.typeName && type.typeName.startsWith('Type')) {
                //make sure that Type types are not serialized, as they are way too expensive and
                //there is no need to actually serialize them.
                const typeType = typeOf<Type>();
                if (typeType.kind === ReflectionKind.union && isTypeIncluded(typeType.types, type)) {
                    Object.assign(result, {
                        kind: ReflectionKind.any,
                    });
                    break;
                }
            }

            const types = state.disableMethods ? type.types.filter(filterRemoveFunctions) : type.types;
            Object.assign(result, {
                kind: ReflectionKind.objectLiteral,
                types: types.map(member => serialize(member, state)),
            } as SerializedTypeObjectLiteral);
            exportEntityOptions(type, result);
            break;
        }
        case ReflectionKind.class: {
            const types = state.disableMethods ? type.types.filter(filterRemoveFunctions) : type.types;
            const parent = getParentClass(type.classType);
            let superClass: SerializedTypeReference | undefined = undefined;
            try {
                const parentType = parent ? reflect(parent) : undefined;
                //parents without runtime type (e.g. plain functions) are not reflected as class, so they can not be used as superClass
                if (parentType && parentType.kind === ReflectionKind.class) superClass = serialize(parentType, state);
            } catch {
            }

            const classType = getClassName(type.classType);
            const globalObject: boolean = envGlobal && envGlobal[classType] === type.classType;

            Object.assign(result, {
                kind: ReflectionKind.class,
                types: types.map(member => serialize(member, state)),
                name: ReflectionClass.from(type.classType).name,
                globalObject: globalObject ? true : undefined,
                classType,
                arguments: type.arguments ? type.arguments.map(member => serialize(member, state)) : undefined,
                extendsArguments: type.extendsArguments ? type.extendsArguments.map(member => serialize(member, state)) : undefined,
                superClass,
            } as SerializedTypeClassType);
            exportEntityOptions(type, result);
            break;
        }
        case ReflectionKind.literal: {
            Object.assign(result, {
                kind: ReflectionKind.literal,
                literal: 'symbol' === typeof type.literal ? { type: 'symbol', name: type.literal.toString().slice(7, -1) } :
                    'bigint' === typeof type.literal ? { type: 'bigint', value: String(type.literal) } :
                        type.literal instanceof RegExp ? { type: 'regex', regex: String(type.literal) } :
                            type.literal
            } as SerializedTypeLiteral);
            break;
        }
        case ReflectionKind.tuple: {
            Object.assign(result, {
                kind: ReflectionKind.tuple,
                types: type.types.map(member => ({ ...member, jit: undefined, parent: undefined, type: serialize(member.type, state) })),

            } as SerializedTypeTuple);
            break;
        }
        case ReflectionKind.union: {
            if (type.typeName && type.typeName.startsWith('Type')) {
                //make sure that Type types are not serialized, as they are way too expensive and
                //there is no need to actually serialize them.
                const typeType = typeOf<Type>();
                if (isSameType(typeType, type)) {
                    Object.assign(result, {
                        kind: ReflectionKind.any,
                    });
                    break;
                }
            }

            const types = state.disableMethods ? type.types.filter(filterRemoveFunctions) : type.types;
            Object.assign(result, {
                kind: ReflectionKind.union,
                types: types.map(member => serialize(member, state)),

            } as SerializedTypeUnion);
            break;
        }
        case ReflectionKind.intersection: {
            Object.assign(result, {
                kind: ReflectionKind.intersection,
                types: type.types.map(member => serialize(member, state)),

            } as SerializedTypeIntersection);
            break;
        }
        case ReflectionKind.templateLiteral: {
            Object.assign(result, {
                kind: ReflectionKind.templateLiteral,
                types: type.types.map(member => serialize(member, state)),

            } as SerializedTypeTemplateLiteral);
            break;
        }
        case ReflectionKind.string:
        case ReflectionKind.number:
        case ReflectionKind.boolean:
        case ReflectionKind.symbol:
        case ReflectionKind.bigint:
        case ReflectionKind.regexp: {
            if (type.origin) (result as SimpleSerializedType).origin = serialize(type.origin, state);
            break;
        }
        case ReflectionKind.function: {
            if (state.disableMethods) {
                result.kind = ReflectionKind.never;
                break;
            }
            Object.assign(result, {
                kind: ReflectionKind.function,
                parameters: type.parameters.map(v => ({
                    ...v,
                    jit: undefined,
                    parent: undefined,
                    type: serialize(v.type, state),
                    default: v.default !== undefined ? true : undefined
                })),
                return: serialize(type.return, state)
            } as SerializedTypeFunction);
            break;
        }
        case ReflectionKind.method: {
            if (state.disableMethods) {
                result.kind = ReflectionKind.never;
                break;
            }
            Object.assign(result, {
                ...type,
                jit: undefined,
                parent: undefined,
                parameters: type.parameters.map(v => ({
                    ...v,
                    jit: undefined,
                    parent: undefined,
                    type: serialize(v.type, state),
                    default: v.default !== undefined ? true : undefined
                } as SerializedTypeParameter)),
                return: serialize(type.return, state)
            } as SerializedTypeMethod);
            break;
        }
        case ReflectionKind.methodSignature: {
            if (state.disableMethods) {
                result.kind = ReflectionKind.never;
                break;
            }
            Object.assign(result, {
                ...type,
                jit: undefined,
                parent: undefined,
                parameters: type.parameters.map(v => ({
                    ...v,
                    jit: undefined,
                    parent: undefined,
                    type: serialize(v.type, state),
                    default: v.default !== undefined ? true : undefined
                } as SerializedTypeParameter)),
                return: serialize(type.return, state)
            } as SerializedTypeMethodSignature);
            break;
        }
        case ReflectionKind.propertySignature: {
            Object.assign(result, {
                ...type,
                jit: undefined,
                parent: undefined,
                type: serialize(type.type, state),
            } as SerializedTypePropertySignature);
            break;
        }
        case ReflectionKind.property: {
            Object.assign(result, {
                ...type,
                jit: undefined,
                parent: undefined,
                default: type.default !== undefined ? true : undefined,
                type: serialize(type.type, state),
            } as SerializedTypeProperty);
            break;
        }
        case ReflectionKind.array: {
            Object.assign(result, {
                kind: ReflectionKind.array,
                type: serialize(type.type, state),
            } as SerializedTypeArray);
            break;
        }
        case ReflectionKind.promise: {
            Object.assign(result, {
                kind: ReflectionKind.promise,
                type: serialize(type.type, state),
            } as SerializedTypePromise);
            break;
        }
        case ReflectionKind.rest: {
            Object.assign(result, {
                kind: ReflectionKind.rest,
                type: serialize(type.type, state),
            } as SerializedTypeRest);
            break;
        }
        case ReflectionKind.indexSignature: {
            Object.assign(result, {
                kind: ReflectionKind.indexSignature,
                index: serialize(type.index, state),
                type: serialize(type.type, state),
            } as SerializedTypeIndexSignature);
            break;
        }
        case ReflectionKind.enum: {
            Object.assign(result, {
                kind: ReflectionKind.enum,
                enum: type.enum,
                values: type.values,
                indexType: serialize(type.indexType, state),
            } as SerializedTypeEnum);
            break;
        }
    }

    return index;
}

/**
 * Converts a (possibly circular/nested) type into a JSON.stringify'able structure suited to be transmitted over the wire and deserialized back to the correct Type object.
 */
export function serializeType(type: Type, state: Partial<SerializerState> = {}): SerializedTypes {
    const types: SerializedTypes = [];
    const serializedState: SerializerState = { types, refs: new Map, ...state };
    serialize(type, serializedState);
    return types;
}

interface DeserializeState {
    types: SerializedTypes;
    disableReuse?: boolean, //disable entity reuse from entities registered via @entity.name()
    deserialized: { [index: number]: { type: Type, refs: Type[], active: boolean } };
}

/**
 * @reflection never
 */
function deserialize(type: SerializedType | SerializedTypeReference, state: DeserializeState, parent?: Type): Type {
    if ('number' === typeof type) {
        if (!state.types[type]) return { kind: ReflectionKind.unknown };
        const typeState = state.deserialized[type];
        let result: Type = { kind: ReflectionKind.unknown };

        if (typeState) {
            if (typeState.active) {
                typeState.refs.push(result);
            } else {
                result = typeState.type;
            }
        } else {
            const typeState = { type: result as Type, refs: [], active: true };
            state.deserialized[type] = typeState;
            typeState.type = deserialize(state.types[type], state);
            typeState.active = false;
            for (const ref of typeState.refs) Object.assign(ref, typeState.type);
            result = typeState.type;
        }
        if (parent) return Object.assign(result, { parent });

        return result;
    }
    const result: Type = { kind: type.kind } as Type;

    if (type.typeName) result.typeName = type.typeName;
    if (type.typeArguments) result.typeArguments = type.typeArguments.map(v => deserialize(v, state)) as Type[];
    if (type.indexAccessOrigin) result.indexAccessOrigin = {
        index: deserialize(type.indexAccessOrigin.index, state) as Type,
        container: deserialize(type.indexAccessOrigin.container, state) as TypeClass | TypeObjectLiteral
    };

    switch (type.kind) {
        case ReflectionKind.objectLiteral: {
            Object.assign(result, {
                kind: ReflectionKind.objectLiteral,
                types: type.types.map(v => deserialize(v, state, result))
            } as TypeObjectLiteral);
            assignEntityOptions(result as TypeObjectLiteral, type);
            break;
        }
        case ReflectionKind.class: {
            if (!state.disableReuse && type.name) {
                const existing = typeSettings.registeredEntities[type.name];
                if (existing) {
                    Object.assign(result, ReflectionClass.from(existing).type);
                    break;
                }
            }

            const newClass = !type.globalObject && state.disableReuse === true || (!type.name || !typeSettings.registeredEntities[type.name]);

            const args = type.arguments ? type.arguments.map(v => deserialize(v, state, result)) : undefined;
            const extendsArguments = type.extendsArguments ? type.extendsArguments.map(v => deserialize(v, state, result)) : undefined;
            const types = type.types.map(v => deserialize(v, state, result));
            const constructor = findMember('constructor', types);
            const initialize: { name: string, index: number }[] = [];
            if (constructor && constructor.kind === ReflectionKind.method) {
                for (let i = 0; i < constructor.parameters.length; i++) {
                    if (constructor.parameters[i].visibility !== undefined) {
                        initialize.push({ name: constructor.parameters[i].name, index: i });
                    }
                }
            }

            //superClass of older serialized types can be a non-class type (e.g. a function), which can not be extended
            const superType = newClass && type.superClass ? deserialize(type.superClass, state) : undefined;
            const superClass = superType && superType.kind === ReflectionKind.class ? superType.classType : undefined;

            const classType = type.globalObject ? envGlobal[type.classType] : newClass
                ? (superClass ? class extends superClass {
                    constructor(...args: any[]) {
                        super(...args);
                        for (const init of initialize) {
                            this[init.name] = args[init.index];
                        }
                    }
                } : class {
                    constructor(...args: any[]) {
                        for (const init of initialize) {
                            (this as any)[init.name] = args[init.index];
                        }
                    }
                }) : typeSettings.registeredEntities[type.name!];

            if (newClass && !type.globalObject) {
                Object.defineProperty(classType, 'name', { value: type.classType, writable: true, enumerable: false });
                if (!classType.__type) {
                    classType.__type = [];
                    classType.__type.__type = result;
                }
            }

            Object.assign(result, {
                kind: ReflectionKind.class,
                classType,
                arguments: args,
                extendsArguments,
                types,
            } as TypeClass);
            assignEntityOptions(result as TypeClass, type);
            break;
        }
        case ReflectionKind.literal: {
            Object.assign(result, {
                kind: ReflectionKind.literal,
                literal: 'string' === typeof type.literal ? type.literal : 'number' === typeof type.literal ? type.literal : 'boolean' === typeof type.literal ? type.literal :
                    'symbol' === type.literal.type ? Symbol(type.literal.name) : 'bigint' === type.literal.type ? BigInt(type.literal.value) : 'regex' === type.literal.type ? regExpFromString(type.literal.regex) : false
            } as TypeLiteral);
            break;
        }
        case ReflectionKind.tuple: {
            Object.assign(result, {
                kind: ReflectionKind.tuple,
                types: []
            } as TypeTuple);
            for (const member of type.types) {
                const deserializedMember: TypeTupleMember = {
                    ...member,
                    typeArguments: undefined,
                    indexAccessOrigin: undefined,
                    decorators: undefined,
                    parent: result as TypeTuple,
                    type: { kind: ReflectionKind.unknown }
                };
                deserializedMember.type = deserialize(member.type, state, deserializedMember);
                (result as TypeTuple).types.push(deserializedMember);
            }
            break;
        }
        case ReflectionKind.templateLiteral:
        case ReflectionKind.intersection:
        case ReflectionKind.union: {
            Object.assign(result, {
                kind: type.kind,
                types: type.types.map(member => deserialize(member, state, result))
            });
            break;
        }
        case ReflectionKind.string:
        case ReflectionKind.number:
        case ReflectionKind.bigint:
        case ReflectionKind.symbol:
        case ReflectionKind.regexp:
        case ReflectionKind.boolean: {
            result.kind = type.kind;
            if (type.origin) {
                Object.assign(result, {
                    origin: deserialize(type.origin, state, result)
                });
            }
            break;
        }
        case ReflectionKind.any:
        case ReflectionKind.unknown:
        case ReflectionKind.void:
        case ReflectionKind.undefined:
        case ReflectionKind.null: {
            //nothing to do
            break;
        }
        case ReflectionKind.methodSignature:
        case ReflectionKind.method:
        case ReflectionKind.function: {
            const parameters: TypeParameter[] = [];
            for (const p of type.parameters) {
                const parameter: TypeParameter = {
                    ...p,
                    typeArguments: undefined,
                    indexAccessOrigin: undefined,
                    decorators: undefined,
                    parent: result as TypeFunction,
                    default: p.default ? () => undefined : undefined,
                    type: { kind: ReflectionKind.unknown }
                };
                parameter.type = deserialize(p.type, state, parameter) as Type;
                parameters.push(parameter);
            }
            Object.assign(result, {
                name: type.name,
                parameters,
                return: deserialize(type.return, state, result)
            } as TypeFunction);
            break;
        }
        case ReflectionKind.property:
        case ReflectionKind.propertySignature: {
            Object.assign(result, {
                ...type,
                default: type.kind === ReflectionKind.property ? type.default ? () => undefined : undefined : undefined,
                type: deserialize(type.type, state, result),
            } as TypeProperty);
            break;
        }
        case ReflectionKind.array:
        case ReflectionKind.promise:
        case ReflectionKind.rest: {
            Object.assign(result, {
                type: deserialize(type.type, state, result)
            } as TypeArray | TypeProperty | TypeRest);
            break;
        }
        case ReflectionKind.indexSignature: {
            Object.assign(result, {
                index: deserialize(type.index, state, result),
                type: deserialize(type.type, state, result)
            } as TypeIndexSignature);
            break;
        }
        case ReflectionKind.enum: {
            Object.assign(result, {
                enum: type.enum,
                values: type.values,
                indexType: deserialize(type.indexType, state, result),
            } as TypeEnum);
            break;
        }
    }

    if (isWithSerializedAnnotations(type) && isWithAnnotations(result) && type.decorators) {
        result.annotations ||= {};
        for (const scheduledDecorator of type.decorators) {
            for (const decorator of typeDecorators) {
                const dec = deserialize(scheduledDecorator, state) as TypeObjectLiteral;
                decorator(result.annotations, dec);
            }
        }
    }
    return result;
}

export function deserializeType(types?: SerializedTypes, state: Partial<DeserializeState> = {}): Type {
    if (!types || types.length === 0) return { kind: ReflectionKind.unknown };
    return deserialize(types[0], { ...state, deserialized: {}, types });
}
