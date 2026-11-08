import { Mutex } from './lib.js';

export class Consumer {
    constructor(public mutex: Mutex) {}
}
