import { ReceiveType, resolveReceiveType } from './reflection/reflection.js';
import { createTypeGuardFunction, Guard, serializer, Serializer } from './serializer.js';
import { NoTypeReceived } from './utils.js';
import { ValidationError, ValidationErrorItem } from './validator.js';
import { getTypeJitContainer } from './reflection/type.js';

/**
 * ```typescript
 * const validator = getValidatorFunction<MyType>();
 *
 * const errors: ValidationErrorItem[] = [];
 * const valid = validator(data, {errors})
 *
 * if (errors.length) console.log(errors); //validation failed if not empty
 * ```
 */
export function getValidatorFunction<T>(serializerToUse: Serializer = serializer, receiveType?: ReceiveType<T>): Guard<T> {
    if (!receiveType) throw new NoTypeReceived();
    const type = resolveReceiveType(receiveType);
    const jit = getTypeJitContainer(type);
    if (jit.__is) {
        return jit.__is;
    }
    const fn = createTypeGuardFunction(type, {
        validation: 'strict'
    }, serializerToUse) || (() => undefined);
    jit.__is = fn;
    return fn as Guard<T>;
}

export function is<T>(data: any, serializerToUse: Serializer = serializer, errors?: ValidationErrorItem[], receiveType?: ReceiveType<T>): data is T {
    const fn = getValidatorFunction(serializerToUse, receiveType);
    // validation constraints are checked either way, errors only collects their messages
    return errors ? fn(data, { errors }) : fn(data);
}

export function guard<T>(serializerToUse: Serializer = serializer, receiveType?: ReceiveType<T>): Guard<T> {
    const fn = getValidatorFunction(serializerToUse, receiveType);
    return ((data: any) => fn(data)) as Guard<T>;
}

/**
 * @throws ValidationError when type is invalid.
 */
export function assert<T>(data: any, serializerToUse: Serializer = serializer, receiveType?: ReceiveType<T>): asserts data is T {
    const errors: ValidationErrorItem[] = [];
    is(data, serializerToUse, errors, receiveType);
    if (errors.length) {
        throw new ValidationError(errors, resolveReceiveType(receiveType));
    }
}
