import { DatabaseError } from '@deepkit/orm';

import { decodeText } from './row-decoder.js';

/**
 * An error reported by the server. The field names are the ones of the `pg` driver,
 * so that existing code keeps working, for example handleSpecificError reading table and detail.
 */
export class PostgresError extends DatabaseError {
    severity?: string;
    /** SQLSTATE of the server, or the code of the socket error for PostgresConnectionError. */
    code?: string;
    detail?: string;
    hint?: string;
    position?: string;
    internalPosition?: string;
    internalQuery?: string;
    where?: string;
    schema?: string;
    table?: string;
    column?: string;
    dataType?: string;
    constraint?: string;
    file?: string;
    line?: string;
    routine?: string;
    /** For a query that was part of a batch, its index there. */
    batchIndex?: number;
}

/** The connection was refused, lost, or the stream could not be used anymore. */
export class PostgresConnectionError extends PostgresError {}

/** The message of an error response, read from the fields of an E or N message starting at offset. */
export function parseErrorResponse(data: Uint8Array, offset: number, end: number): PostgresError {
    let message = '';
    const fields: { [name: string]: string } = {};
    while (offset < end && data[offset] !== 0) {
        const field = data[offset++];
        let stop = offset;
        while (stop < end && data[stop] !== 0) stop++;
        const value = decodeText(data, offset, stop);
        offset = stop + 1;
        switch (field) {
            case 77 /* M */:
                message = value;
                break;
            case 83 /* S */:
                fields.severity = value;
                break;
            case 67 /* C */:
                fields.code = value;
                break;
            case 68 /* D */:
                fields.detail = value;
                break;
            case 72 /* H */:
                fields.hint = value;
                break;
            case 80 /* P */:
                fields.position = value;
                break;
            case 112 /* p */:
                fields.internalPosition = value;
                break;
            case 113 /* q */:
                fields.internalQuery = value;
                break;
            case 87 /* W */:
                fields.where = value;
                break;
            case 115 /* s */:
                fields.schema = value;
                break;
            case 116 /* t */:
                fields.table = value;
                break;
            case 99 /* c */:
                fields.column = value;
                break;
            case 100 /* d */:
                fields.dataType = value;
                break;
            case 110 /* n */:
                fields.constraint = value;
                break;
            case 70 /* F */:
                fields.file = value;
                break;
            case 76 /* L */:
                fields.line = value;
                break;
            case 82 /* R */:
                fields.routine = value;
                break;
        }
    }
    const error = new PostgresError(message);
    return Object.assign(error, fields);
}
