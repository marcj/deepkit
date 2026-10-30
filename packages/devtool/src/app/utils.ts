//@ts-ignore
import objectInspect from 'object-inspect';
import { getClassName } from '@deepkit/core';
import { getTypeJitContainer, isBackReferenceType, isReferenceType, ReflectionKind, stringifyType, Type } from '@deepkit/type';
import { Pipe, PipeTransform } from '@angular/core';

export function trackByIndex(index: number) {
    return index;
}

export function isReferenceLike(type: Type): boolean {
    return isReferenceType(type) || isBackReferenceType(type);
}

function manualTypeStringify(type: Type): string | undefined {
    if (type.kind === ReflectionKind.class && getClassName(type.classType) === 'UploadedFile') return 'UploadedFile';
    //we are not interested in the methods
    if (type.kind === ReflectionKind.method || type.kind === ReflectionKind.methodSignature) return '';
    return;
}

export function typeToTSJSONInterface(type: Type, options: { defaultIsOptional?: boolean } = {}): string {
    if (type.kind === ReflectionKind.promise) type = type.type;
    const id = options.defaultIsOptional ? 'typeToTSJSONInterfaceDefaultOptional' : 'typeToTSJSONInterface';
    const jit = getTypeJitContainer(type);
    if (jit[id]) return jit[id];
    return jit[id] = stringifyType(type, { ...options, showDescription: true, showNames: false, showFullDefinition: true, stringify: manualTypeStringify });
}

export interface TypeDecoration {
    name: number | string | symbol;
    description?: string;
}

function toHex(number: number): string {
    const v = number.toString(16);
    if (v.length === 1) return '0' + v;
    return v;
}

function inspectBytes(this: any) {
    return `${getClassName(this)} '${[...this].map(toHex).join('')}'`;
}

(ArrayBuffer.prototype as any).inspect = inspectBytes;
(Uint8Array.prototype as any).inspect = inspectBytes;
(Uint8ClampedArray.prototype as any).inspect = inspectBytes;
(Int8Array.prototype as any).inspect = inspectBytes;
(Uint16Array.prototype as any).inspect = inspectBytes;
(Int16Array.prototype as any).inspect = inspectBytes;
(Int32Array.prototype as any).inspect = inspectBytes;
(Uint32Array.prototype as any).inspect = inspectBytes;
(Float32Array.prototype as any).inspect = inspectBytes;
(Float64Array.prototype as any).inspect = inspectBytes;

export function inspect(obj: any) {
    return objectInspect(obj, {
        maxStringLength: 512,
        indent: 4,
        depth: 25,
    });
}

export const methods: string[] = [
    'GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD',
];

export const headerStatusCodes: { [name: string]: string } = {
    '100': 'Continue',
    '101': 'Switching Protocols',
    '102': 'Processing',
    '200': 'OK',
    '201': 'Created',
    '202': 'Accepted',
    '203': 'Non-Authoritative Information',
    '204': 'No Content',
    '205': 'Reset Content',
    '206': 'Partial Content',
    '207': 'Multi-Status',
    '300': 'Multiple Choices',
    '301': 'Moved Permanently',
    '302': 'Moved Temporarily',
    '303': 'See Other',
    '304': 'Not Modified',
    '305': 'Use Proxy',
    '307': 'Temporary Redirect',
    '400': 'Bad Request',
    '401': 'Unauthorized',
    '402': 'Payment Required',
    '403': 'Forbidden',
    '404': 'Not Found',
    '405': 'Method Not Allowed',
    '406': 'Not Acceptable',
    '407': 'Proxy Authentication Required',
    '408': 'Request Time-out',
    '409': 'Conflict',
    '410': 'Gone',
    '411': 'Length Required',
    '412': 'Precondition Failed',
    '413': 'Request Entity Too Large',
    '414': 'Request-URI Too Large',
    '415': 'Unsupported Media Type',
    '416': 'Requested Range Not Satisfiable',
    '417': 'Expectation Failed',
    '418': 'I\'m a teapot',
    '422': 'Unprocessable Entity',
    '423': 'Locked',
    '424': 'Failed Dependency',
    '425': 'Unordered Collection',
    '426': 'Upgrade Required',
    '428': 'Precondition Required',
    '429': 'Too Many Requests',
    '431': 'Request Header Fields Too Large',
    '500': 'Internal Server Error',
    '501': 'Not Implemented',
    '502': 'Bad Gateway',
    '503': 'Service Unavailable',
    '504': 'Gateway Time-out',
    '505': 'HTTP Version Not Supported',
    '506': 'Variant Also Negotiates',
    '507': 'Insufficient Storage',
    '509': 'Bandwidth Limit Exceeded',
    '510': 'Not Extended',
    '511': 'Network Authentication Required',
};

@Pipe({
    name: 'safeJson',
    pure: true,
})
export class SafeJsonPipe implements PipeTransform {
    transform(value: any): string {
        return safeJsonStringify(value, 4);
    }
}

// supporting also stuff like bigint
export function safeJsonStringify(obj: any, space?: string | number): string {
    return JSON.stringify(
        obj, (_key, value) =>
            typeof value === 'bigint' ? value.toString() + 'n' : value,
        space,
    );
}
