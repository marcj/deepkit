/**
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */
import { BenchSuite } from '@deepkit/bench';
import {
    ColorFormatter,
    DefaultFormatter,
    LogMessage,
    Logger,
    LoggerFormatter,
    LoggerLevel,
    LoggerTransport,
    MemoryLogger,
    ScopeFormatter,
} from '@deepkit/logger';

/**
 * Logger benchmark - tests Deepkit's Logger performance
 *
 * This benchmark tests:
 * - Different log levels
 * - Logging with and without formatting
 * - Scoped loggers
 * - Log level filtering (disabled logs)
 * - Memory transport vs no-op transport
 */

// No-op transport that discards messages (measures pure logging overhead)
class NoopTransport implements LoggerTransport {
    write(message: LogMessage): void {
        // Intentionally empty - discards all messages
    }

    supportsColor(): boolean {
        return false;
    }
}

// Counting transport to verify logs are being sent
class CountingTransport implements LoggerTransport {
    count = 0;

    write(message: LogMessage): void {
        this.count++;
    }

    supportsColor(): boolean {
        return false;
    }
}

export default async function () {
    const suite = new BenchSuite('logger/core');

    // Test 1: Simple log with no-op transport (minimal overhead)
    {
        const logger = new Logger([new NoopTransport()], []);
        logger.level = LoggerLevel.info;

        suite.add('log info - no formatter', () => {
            logger.info('Hello world');
        });
    }

    // Test 2: Log with default formatter
    {
        const logger = new Logger([new NoopTransport()], [new DefaultFormatter()]);
        logger.level = LoggerLevel.info;

        suite.add('log info - default formatter', () => {
            logger.info('Hello world');
        });
    }

    // Test 3: Log with color formatter
    {
        const logger = new Logger([new NoopTransport()], [new ColorFormatter()]);
        logger.level = LoggerLevel.info;

        suite.add('log info - color formatter', () => {
            logger.info('Hello <green>world</green>');
        });
    }

    // Test 4: Different log levels
    {
        const logger = new Logger([new NoopTransport()], []);
        logger.level = LoggerLevel.debug;

        suite.add('log debug level', () => {
            logger.debug('Debug message');
        });
    }

    {
        const logger = new Logger([new NoopTransport()], []);
        logger.level = LoggerLevel.warning;

        suite.add('log warning level', () => {
            logger.warn('Warning message');
        });
    }

    {
        const logger = new Logger([new NoopTransport()], []);
        logger.level = LoggerLevel.error;

        suite.add('log error level', () => {
            logger.error('Error message');
        });
    }

    // Test 5: Disabled log level (should be fastest - early exit)
    {
        const logger = new Logger([new NoopTransport()], []);
        logger.level = LoggerLevel.error; // Only error and alert

        suite.add('log info - disabled (filtered)', () => {
            logger.info('This should be filtered');
        });
    }

    // Test 6: Scoped logger
    {
        const logger = new Logger([new NoopTransport()], [new ScopeFormatter()]);
        logger.level = LoggerLevel.info;
        const scopedLogger = logger.scoped('myModule');

        suite.add('scoped logger - info', () => {
            scopedLogger.info('Scoped message');
        });
    }

    // Test 7: Creating scoped logger (cached)
    {
        const logger = new Logger([new NoopTransport()], []);
        logger.level = LoggerLevel.info;

        suite.add('scoped logger creation (cached)', () => {
            const scoped = logger.scoped('testScope');
        });
    }

    // Test 8: Log with format arguments
    {
        const logger = new Logger([new NoopTransport()], []);
        logger.level = LoggerLevel.info;

        suite.add('log with format args', () => {
            logger.info('User %s logged in from %s', 'john', '192.168.1.1');
        });
    }

    // Test 9: Log with data
    {
        const logger = new Logger([new NoopTransport()], []);
        logger.level = LoggerLevel.info;

        suite.add('log with data', () => {
            logger.data({ userId: 123, action: 'login' }).info('User action');
        });
    }

    // Test 10: Memory logger (for comparison)
    {
        const logger = new MemoryLogger();
        logger.level = LoggerLevel.info;

        suite.add('memory logger - info', () => {
            logger.info('Memory log message');
        });

        // Clear after benchmark setup
        logger.clear();
    }

    // Test 11: Multiple transports
    {
        const logger = new Logger([new NoopTransport(), new NoopTransport(), new NoopTransport()], []);
        logger.level = LoggerLevel.info;

        suite.add('log info - 3 transports', () => {
            logger.info('Message to multiple transports');
        });
    }

    // Test 12: Logger.is() check performance
    {
        const logger = new Logger([new NoopTransport()], []);
        logger.level = LoggerLevel.info;

        suite.add('logger.is() check', () => {
            logger.is(LoggerLevel.debug);
            logger.is(LoggerLevel.info);
            logger.is(LoggerLevel.error);
        });
    }

    return suite;
}
