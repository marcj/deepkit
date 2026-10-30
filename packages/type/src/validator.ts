import { ReceiveType } from './reflection/reflection.js';
import { getValidatorFunction, is } from './typeguard.js';
import { CustomError, stringifyValueWithType, TypeAnnotation } from '@deepkit/core';
import { stringifyType, Type } from './reflection/type.js';
import { entity } from './decorator.js';
import { serializer, Serializer } from './serializer.js';

export type ValidatorMeta<Name extends string, Args extends [...args: any[]] = []> = TypeAnnotation<'validator', [Name, Args]>;

export type ValidateFunction = (value: any, type: Type, options: any) => ValidatorError | void;
export type Validate<T extends ValidateFunction, Options extends Parameters<T>[2] = unknown> = ValidatorMeta<'function', [T, Options]>;
export type Pattern<T extends RegExp> = ValidatorMeta<'pattern', [T]>;
export type Alpha = ValidatorMeta<'alpha'>;
export type Alphanumeric = ValidatorMeta<'alphanumeric'>;
export type Ascii = ValidatorMeta<'ascii'>;
export type Decimal<MinDigits extends number = 1, MaxDigits extends number = 100> = ValidatorMeta<'decimal', [MinDigits, MaxDigits]>;
export type MultipleOf<Num extends number> = ValidatorMeta<'multipleOf', [Num]>;
export type MinLength<Length extends number> = ValidatorMeta<'minLength', [Length]>;
export type MaxLength<Length extends number> = ValidatorMeta<'maxLength', [Length]>;

export type Includes<T extends string | number | boolean> = ValidatorMeta<'includes', [T]>;
export type Excludes<T extends string | number | boolean> = ValidatorMeta<'excludes', [T]>;

export type Minimum<T extends number | bigint> = ValidatorMeta<'minimum', [T]>;
export type Maximum<T extends number | bigint> = ValidatorMeta<'maximum', [T]>;

/**
 Includes 0. Use PositiveNoZero to exclude 0.
 */
export type Positive = ValidatorMeta<'positive', unknown & [true]>;

/**
 * Includes 0. Use NegativeNoZero to exclude 0.
 */
export type Negative = ValidatorMeta<'negative', [true]>;

export type PositiveNoZero = ValidatorMeta<'positive', [false]>;
export type NegativeNoZero = ValidatorMeta<'negative', [false]>;

export type ExclusiveMinimum<T extends number | bigint> = ValidatorMeta<'exclusiveMinimum', [T]>;
export type ExclusiveMaximum<T extends number | bigint> = ValidatorMeta<'exclusiveMaximum', [T]>;

export type BeforeDate<T extends number> = ValidatorMeta<'beforeDate', [T]>;
export type AfterDate<T extends number> = ValidatorMeta<'afterDate', [T]>;
export type BeforeNow = ValidatorMeta<'beforeNow'>;
export type AfterNow = ValidatorMeta<'afterNow'>;

export const EMAIL_REGEX = /^\S+@\S+$/;
export type Email = string & Pattern<typeof EMAIL_REGEX>;

/**
 * Used in validator functions.
 */
export class ValidatorError {
    constructor(
        public readonly code: string,
        public readonly message: string,
        public readonly path?: string,
    ) {
    }
}

/**
 * The structure of a validation error.
 *
 * Path defines the shallow or deep path (using dots).
 * Message is an arbitrary message in english.
 *
 * In validators please use and return `new ValidatorError('code', 'message')` instead.
 */
export class ValidationErrorItem {
    constructor(
        /**
         * The path to the property. Might be a deep path separated by dot.
         */
        public readonly path: string,
        /**
         * A lower cased error code that can be used to identify this error and translate.
         */
        public readonly code: string,
        /**
         * Free text of the error.
         */
        public readonly message: string,
        /**
         * Optional value that caused the error.
         */
        public readonly value?: any,
    ) {
        this.path = path && path[0] === '.' ? path.slice(1) : path;
    }

    toString(prefix: string = '') {
        let messagedCausedBy = '';
        if (this.value !== undefined) {
            //serialise the value and trim to 100 chars max
            let serialisedValue: string;
            try {
                serialisedValue = JSON.stringify(this.value);
            } catch {
                //circular references or other values JSON.stringify can not handle
                serialisedValue = stringifyValueWithType(this.value);
            }
            if (serialisedValue.length > 100) serialisedValue = serialisedValue.slice(0, 100) + '...';
            messagedCausedBy = ` caused by value ${serialisedValue}`;
        }

        return `${(prefix ? prefix + '.' : '') + this.path}(${this.code}): ${this.message}${messagedCausedBy}`;
    }
}

@entity.name('@error:validation')
export class ValidationError extends CustomError {
    constructor(
        public readonly errors: ValidationErrorItem[],
        type?: Type,
    ) {
        super(`Validation error${type ? ` for type ${stringifyType(type)}` : ''}:\n${errors.map(v => v.toString()).join(',\n')}`);
    }

    static from(errors: { path: string, message: string, code?: string, value?: any }[]) {
        return new ValidationError(errors.map(v => new ValidationErrorItem(v.path, v.code || '', v.message, v.value)));
    }
}

/**
 * Returns empty array when valid, or ValidationErrorItem[] with detailed error messages if not valid.
 *
 * Returns validation error items when failed. If successful returns an empty array.
 */
export function validate<T>(data: any, type?: ReceiveType<T>): ValidationErrorItem[] {
    const errors: ValidationErrorItem[] = [];
    is(data, undefined, errors, type);
    return errors;
}

export function validateFunction<T>(serializerToUse: Serializer = serializer, type?: ReceiveType<T>): (data: T) => ValidationErrorItem[] {
    const fn = getValidatorFunction(serializerToUse, type);
    return (data: T) => {
        const errors: ValidationErrorItem[] = [];
        fn(data, { errors });
        return errors;
    };
}

/**
 * Returns true when valid, and false if not.
 */
export function validates<T>(data: any, type?: ReceiveType<T>): boolean {
    const errors = validate(data, type);
    return errors.length === 0;
}
