import type { ReceiveType } from '@deepkit/type';

export class Dog {
    name!: string;
    age?: number;
}

export interface User {
    id: number;
}

// The type compiler injects the runtime type of T as default value of `type`.
export function receiveType<T>(type?: ReceiveType<T>): unknown {
    return type;
}

export const result = {
    dogType: (Dog as any).__type,
    userType: receiveType<User>(),
};
