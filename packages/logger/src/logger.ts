/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */

import { arrayRemoveItem, ClassType, Inject } from '@deepkit/core';
import { tokenLabel, TransientInjectionTarget } from '@deepkit/injector';
import { MemoryLoggerTransport } from './memory-logger.js';
import { format, style } from './utils.js';

export enum LoggerLevel {
    none,
    alert,
    error,
    warning,
    log,
    info,
    debug,
    debug2, // very verbose debug output
}

declare var process: {
    stdout: {
        write: (v: string) => any;
    };
    stderr: {
        write: (v: string) => any;
    };
};

export type LogData = { [name: string]: any };

export interface LogMessage {
    message: string;
    rawMessage: string;
    date: Date;
    level: LoggerLevel;
    scope: string;
    data: LogData;
}

export class ConsoleTransport implements LoggerTransport {
    constructor(protected withColors: boolean = true) {
    }

    write(message: LogMessage): void {
        if (message.level === LoggerLevel.error) {
            process.stderr.write(message.message + '\n');
        } else {
            process.stdout.write(message.message + '\n');
        }
    }

    supportsColor() {
        return this.withColors;
    }
}

export class JSONTransport implements LoggerTransport {
    out: { write: (v: string) => any } = process.stdout;

    write(message: LogMessage) {
        this.out.write(JSON.stringify({
            message: message.message,
            level: message.level,
            date: message.date,
            scope: message.scope,
            data: message.data,
        }) + '\n');
    }

    supportsColor() {
        return false;
    }
}

export interface LoggerTransport {
    write(message: LogMessage): void;

    supportsColor(): boolean;
}

export interface LoggerFormatter {
    format(message: LogMessage): void;
}

export class ColorFormatter implements LoggerFormatter {
    static colors: string[] = [
        'black',
        'red',
        'green',
        'yellow',
        'blue',
        'cyan',
        'magenta',
        'white',
        'gray',
        'grey',
    ];

    format(message: LogMessage): void {
        if (message.level === LoggerLevel.error || message.level === LoggerLevel.alert) {
            message.message = `<red>${message.message}</red>`;
        }

        if (message.message.includes('<')) {
            message.message = message.message.replace(/<(\/)?([a-zA-Z]+)>/g, function(a, end, color) {
                if (!(style as any)[color]) return a;
                if (end === '/') return (style as any)[color].close;
                return (style as any)[color].open;
            });
        }
    }
}

export class RemoveColorFormatter implements LoggerFormatter {
    format(message: LogMessage): void {
        if (message.message.includes('<')) {
            message.message = message.message.replace(/<(\/)?([a-zA-Z]+)>/g, function(a, end, color) {
                return '';
            });
        }
    }
}

export class DefaultFormatter implements LoggerFormatter {
    formatters: LoggerFormatter[] = [new ScopeFormatter(), new LogLevelFormatter(), new TimestampFormatter()];

    format(message: LogMessage): void {
        for (const formatter of this.formatters) {
            formatter.format(message);
        }
    }
}

export class TimestampFormatter implements LoggerFormatter {
    format(message: LogMessage): void {
        message.message = `<yellow>${new Date().toISOString()}</yellow> ${message.message}`;
    }
}

export class LogLevelFormatter implements LoggerFormatter {
    format(message: LogMessage): void {
        message.message = `[${String(LoggerLevel[message.level]).toUpperCase()}] ${message.message}`;
    }
}

export class ScopeFormatter implements LoggerFormatter {
    format(message: LogMessage): void {
        if (!message.scope) return;
        message.message = `(<yellow>${message.scope}</yellow>) ${message.message}`;
    }
}

export interface LoggerInterface {
    level: LoggerLevel;

    scoped(name: string): LoggerInterface;

    /**
     * Sends additional log data for the very next log/error/alert/warning/etc call.
     *
     * @example
     * ```typescript
     *
     * logger.data({user: user}).log('User logged in');
     *
     * //or
     *
     * //the given data is only used for the very next log (or error/alert/warning etc) call.
     * logger.data({user: user})
     * logger.log('User logged in');
     *
     * //at this point `data` is consumed, and for all other log calls not used anymore.
     * logger.log('another message without data');
     *
     *
     * ```
     */
    data(data: LogData): LoggerInterface;

    is(level: LoggerLevel): boolean;

    alert(...message: any[]): void;

    error(...message: any[]): void;

    warn(...message: any[]): void;

    log(...message: any[]): void;

    info(...message: any[]): void;

    debug(...message: any[]): void;

    debug2(...message: any[]): void;
}

export class Logger implements LoggerInterface {
    protected colorFormatter = new ColorFormatter;
    protected removeColorFormatter = new RemoveColorFormatter;

    /**
     * Setting a log level means only logs below or equal to this level will be handled.
     */
    level: LoggerLevel = LoggerLevel.info;

    protected scopeLevels = new Map<string, LoggerLevel>();

    protected logData?: LogData;

    protected scopes: { [scope: string]: Logger } = {};

    constructor(
        protected transporter: LoggerTransport[] = [],
        protected formatter: LoggerFormatter[] = [],
        public scope: string = '',
    ) {
    }

    setLevel(level: keyof typeof LoggerLevel) {
        this.level = LoggerLevel[level];
    }

    isScopeEnabled(name: string): boolean {
        return (this.scopeLevels.get(name) ?? this.level) > LoggerLevel.none;
    }

    setScopeLevel(name: string, level: LoggerLevel) {
        this.scopeLevels.set(name, level);
    }

    unsetScopeLevel(name: string) {
        this.scopeLevels.delete(name);
    }

    getScopeLevel(name: string): number {
        return this.scopeLevels.get(name) ?? this.level;
    }

    /**
     * Sends additional log data for the very next log/error/alert/warning/etc call.
     *
     * @example
     * ```typescript
     *
     * logger.data({user: user}).log('User logged in');
     *
     * //or
     *
     * //the given data is only used for the very next log (or error/alert/warning etc) call.
     * logger.data({user: user})
     * logger.log('User logged in');
     *
     * //at this point `data` is consumed, and for all other log calls not used anymore.
     * logger.log('another message without data');
     *
     *
     * ```
     */
    data(data: LogData): this {
        this.logData = data;
        return this;
    }

    /**
     * Creates a new scoped logger. A scoped logger has the same log level, transports, and formatters as the parent logger,
     * and references them directly. This means if you change the log level on the parent logger, it will also change for all
     * scoped loggers.
     */
    scoped(name: string): Logger {
        let scopedLogger = this.scopes[name];
        if (!scopedLogger) {
            const self = this;
            const scope = this.scope ? this.scope + '.' + name : name;
            scopedLogger = Object.setPrototypeOf({
                get level() {
                    return self.level;
                },
                transporter: self.transporter,
                formatter: self.formatter,
                scope,
                scopes: self.scopes,
                logData: self.logData,
                scopeLevels: self.scopeLevels,
                colorFormatter: self.colorFormatter,
                removeColorFormatter: self.removeColorFormatter,
            }, Logger.prototype);
            this.scopes[name] = scopedLogger;
        }
        return scopedLogger;
    }

    addTransport(transport: LoggerTransport) {
        this.transporter.push(transport);
    }

    setTransport(transport: LoggerTransport[]) {
        this.transporter = transport;
    }

    removeTransport(transport: LoggerTransport) {
        arrayRemoveItem(this.transporter, transport);
    }

    hasFormatter(formatterType: ClassType<LoggerFormatter>) {
        for (const formatter of this.formatter) {
            if (formatter instanceof formatterType) return true;
        }
        return false;
    }

    hasFormatters(): boolean {
        return this.formatter.length > 0;
    }

    addFormatter(formatter: LoggerFormatter) {
        this.formatter.push(formatter);
    }

    setFormatter(formatter: LoggerFormatter[]) {
        this.formatter = formatter;
    }

    protected format(message: LogMessage): void {
        for (const formatter of this.formatter) {
            formatter.format(message);
        }
    }

    is(level: LoggerLevel): boolean {
        const scopeCheck = this.scopeLevels.size > 0 && !!this.scope ? this.scopeLevels.get(this.scope) : undefined;

        return scopeCheck !== undefined
            ? scopeCheck > LoggerLevel.none && level <= scopeCheck
            : level <= this.level;
    }

    protected send(messages: any[], level: LoggerLevel, data: LogData = {}) {
        if (!this.is(level)) return;

        if (this.logData) {
            data = this.logData;
            this.logData = undefined;
        }

        const rawMessage: string = format(...messages);
        const message: LogMessage = { message: rawMessage, rawMessage, level, date: new Date, scope: this.scope, data };
        this.format(message);

        for (const transport of this.transporter) {
            const formattedMessage = { ...message };
            if (transport.supportsColor()) {
                this.colorFormatter.format(formattedMessage);
                transport.write(formattedMessage);
            } else {
                this.removeColorFormatter.format(formattedMessage);
                transport.write(formattedMessage);
            }
        }
    }

    alert(...message: any[]) {
        this.send(message, LoggerLevel.alert);
    }

    error(...message: any[]) {
        this.send(message, LoggerLevel.error);
    }

    warn(...message: any[]) {
        this.send(message, LoggerLevel.warning);
    }

    log(...message: any[]) {
        this.send(message, LoggerLevel.log);
    }

    info(...message: any[]) {
        this.send(message, LoggerLevel.info);
    }

    debug(...message: any[]) {
        this.send(message, LoggerLevel.debug);
    }

    debug2(...message: any[]) {
        this.send(message, LoggerLevel.debug2);
    }
}

/**
 * Logger with pre-configured console transport.
 */
export class ConsoleLogger extends Logger {
    constructor() {
        super([new ConsoleTransport], [new DefaultFormatter]);
    }
}

/**
 * Logger with pre-configured memory transport.
 */
export class MemoryLogger extends Logger {
    public memory = new MemoryLoggerTransport();

    constructor(
        transporter: LoggerTransport[] = [],
        formatter: LoggerFormatter[] = [],
        scope: string = '',
    ) {
        super(transporter || [], formatter, scope);
        if (transporter.length === 0) {
            this.transporter.push(this.memory);
        }
    }

    getOutput(): string {
        return this.memory.messageStrings.join('\n');
    }

    clear() {
        this.memory.messageStrings = [];
        this.memory.messages = [];
    }
}

export type ScopedLogger = Inject<Logger, 'scoped-logger'>;
export const ScopedLogger = {
    provide: 'scoped-logger',
    transient: true,
    useFactory(target: TransientInjectionTarget, logger: Logger = new Logger) {
        return logger.scoped(tokenLabel(target.token));
    },
} as const;
