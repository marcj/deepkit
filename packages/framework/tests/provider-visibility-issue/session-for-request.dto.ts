export class SessionForRequest {
    constructor(
        public readonly sessionId: string,
        public readonly userId: string,
    ) {}
}
