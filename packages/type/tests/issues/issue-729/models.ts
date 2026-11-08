export interface User {
    name: string;
}

export class UserRecord {
    name: string = '';
}

export interface Box<T> {
    value: T;
}

export type Id = string;

export enum Color {
    red,
    blue,
}

export * from './more.js';
