import { getBSONDeserializer, getBSONSerializer } from '@deepkit/bson';

import { ActionMode } from './model.js';

/**
 * Sent to the client in the handshake. The types stay serialized until an action is used for the first time.
 */
export type SchemaMapping = {
    [controllerName: string]: [actionName: string, action: number, mode: ActionMode, parameters: any, type: any][];
};

export type ParsedSchemaEntry = { action: number; mode: ActionMode; parameters: any; type: any };
export type ParsedSchemaMapping = { [controllerName: string]: { [actionName: string]: ParsedSchemaEntry } };

export const schemaMapping = {
    encode: getBSONSerializer<SchemaMapping>(),
    decode: getBSONDeserializer<SchemaMapping>(),
};

export function fnv1aHash(buffer: Uint8Array): number {
    let hash = 2166136261;
    for (let i = 0, len = buffer.length; i < len; i++) {
        hash ^= buffer[i];
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

export function parseSchemaMapping(mapping: SchemaMapping): ParsedSchemaMapping {
    const parsed: ParsedSchemaMapping = {};
    for (const controllerName of Object.keys(mapping)) {
        const controller: ParsedSchemaMapping[string] = (parsed[controllerName] = {});
        for (const [actionName, action, mode, parameters, type] of mapping[controllerName]) {
            controller[actionName] = { action, mode, parameters, type };
        }
    }
    return parsed;
}
