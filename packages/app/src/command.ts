/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */

import { ClassType, getClassName, TypeAnnotation } from '@deepkit/core';
import {
    ClassDecoratorResult,
    createClassDecoratorContext,
    deserialize,
    hasDefaultValue,
    isCustomTypeClass,
    isDateType,
    isOptional,
    isReferenceType,
    reflect,
    ReflectionClass,
    ReflectionFunction,
    ReflectionKind,
    stringifyType,
    Type,
    typeAnnotation,
    TypeParameter,
    TypeProperty,
    TypePropertySignature,
    validate,
    ValidationError,
} from '@deepkit/type';
import { EventDispatcher } from '@deepkit/event';
import { getInjectOptions, InjectorContext, InjectorModule, ServiceNotFoundError } from '@deepkit/injector';
import { ControllerConfig } from './service-container.js';
import { LoggerInterface } from '@deepkit/logger';
import { onAppError, onAppExecute, onAppExecuted, onAppShutdown } from './app.js';
import { FrameCategory, Stopwatch } from '@deepkit/stopwatch';

/**
 * Flag is a command line argument that is prefixed with `--` and can have a value.
 */
export type Flag<Options extends {
    char?: string,
    hidden?: boolean,
    description?: string,
    prefix?: string
} = {}> = TypeAnnotation<'cli:flag', Options>;

class CommandDecoratorDefinition {
    name: string = '';
    description: string = '';
}

class CommandDecorator {
    t = new CommandDecoratorDefinition;

    controller(name: string, options?: { description?: string }) {
        this.t.name = name;
        if (options) {
            if (options.description) this.t.description = options.description;
        }
    }

}

export const cli: ClassDecoratorResult<typeof CommandDecorator> = createClassDecoratorContext(CommandDecorator);

export interface Command {
    execute(...args: any[]): Promise<number | void> | number | void;
}

function convert(parameter: CommandParameter, value: any) {
    if (value === undefined) {
        if (parameter.optional) return undefined;
        throw new Error(`Value is required`);
    }
    if (parameter.type.kind === ReflectionKind.array && !Array.isArray(value)) {
        value = [value];
    }
    value = deserialize(value, undefined, undefined, undefined, parameter.type);
    const errors = validate(value, parameter.type);
    if (errors.length) {
        throw errors[0];
    }
    return value;
}

/**
 * Auto-detect some types as flag.
 */
function isFlagForced(type: Type): boolean {
    if (supportedAsArgument(type)) return false;

    return type.kind === ReflectionKind.boolean;
}

function supportedFlags(type: Type): boolean {
    return supportedAsArgument(type) || isFlagForced(type);
}

function supportedAsArgument(type: Type): boolean {
    if (type.kind === ReflectionKind.string || type.kind === ReflectionKind.number
        || type.kind === ReflectionKind.any || type.kind === ReflectionKind.unknown || isDateType(type)
        || type.kind === ReflectionKind.bigint || type.kind === ReflectionKind.literal) return true;
    if (type.kind === ReflectionKind.union) return type.types.every(v => supportedAsArgument(v));
    if (type.kind === ReflectionKind.array) return supportedAsArgument(type.type);
    if (isReferenceType(type)) return true;
    return false;
}

declare const process: any;
declare const Deno: any;
declare const Bun: any;

export function getBinFromEnvironment(): string[] {
    if ('undefined' !== typeof process && process.argv) {
        return process.argv.slice(0, 2);
    }

    if ('undefined' !== typeof Deno && Deno.args) {
        return ['deno', 'run', Deno.main?.filename || ''];
    }

    if ('undefined' !== typeof Bun && Bun.argv) {
        return Bun.argv.slice(0, 2);
    }

    return [];
}

export function getArgsFromEnvironment(): string[] {
    if ('undefined' !== typeof process && process.argv) {
        return process.argv.slice(2);
    }

    if ('undefined' !== typeof Deno && Deno.args) {
        return Deno.args;
    }

    if ('undefined' !== typeof Bun && Bun.argv) {
        return Bun.argv.slice(2);
    }

    return [];
}

export function parseCliArgs(args: string[], aliases: { [name: string]: string } = {}): {
    [name: string]: boolean | string | string[]
} {
    const result: { [name: string]: boolean | string | string[] } = {};
    let current: string | undefined = undefined;

    function append(name: string, value: string | boolean) {
        name = aliases[name] || name;

        const existing = result[name];

        if ('string' === typeof existing) {
            result[name] = [existing];
        }

        if (Array.isArray(result[name])) {
            (result[name] as any).push(value);
        } else {
            result[name] = value;
        }
    }

    for (const arg of args) {
        if (arg.startsWith('--')) {
            if (current) {
                append(current, true);
            }
            current = arg.substr(2);
            if (current.includes(' ')) {
                const [name, value] = current.split(' ');
                append(name, value);
                current = undefined;
            }
        } else if (arg.startsWith('-')) {
            if (current) {
                append(current, true);
            }
            current = arg.substr(1);
        } else {
            if (current) {
                append(current, arg);
            } else {
                //no current flag, so it's a positional argument
                if (!result['@']) result['@'] = [];
                (result['@'] as any).push(arg);
            }
            current = undefined;
        }
    }

    if (current) {
        result[current] = true;
    }

    return result;
}

/**
 * Returns the longest string length of all names.
 */
function getSpacing(names: string[]): number {
    return names.reduce((max, name) => Math.max(max, name.length), 0) + 1;
}

/**
 * @internal
 */
export interface ParsedCliControllerConfig {
    controller?: ClassType,
    callback?: Function;
    description?: string;
    name: string;
    module: InjectorModule;
}

/**
 * Tries to create a command name from a class name or function name.
 * //test => test
 * //testCommand => test-command
 * //TestCommand => test-command
 * //Test => test
 * //TestSomething => test-something
 * //system_crazyCommand => system:crazy-command
 * //system_crazy => system:crazy
 * //system_crazyCommandSomething => system:crazy-command-something
 * //system_subSystem_test => system:sub-system:test
 */
function commandNameFromSymbol(symbolName: string) {
    return symbolName.replace(/_+/g, ':')
        .replace(/([A-Z])/g, '-$1').replace(/^-/, '').toLowerCase()
        .replace(/-command$/, '').replace(/-controller/, '-');
}

function parseControllerConfig(config: ControllerConfig): ParsedCliControllerConfig {
    let name = config.name || '';
    let description = '';
    if (!name && config.controller) {
        name = commandNameFromSymbol(getClassName(config.controller));
    } else if (!name && config.callback) {
        name = commandNameFromSymbol(config.callback.name);
    }

    const decoratorConfig = config.controller ? cli._fetch(config.controller) : undefined;
    if (decoratorConfig) {
        if (decoratorConfig.description) description = decoratorConfig.description;
        if (decoratorConfig.name) name = decoratorConfig.name;
    }

    if (!description) {
        const type = reflect(config.controller || config.callback);
        if (type.kind === ReflectionKind.function && type.description) description = type.description || '';
        if (type.kind === ReflectionKind.class && type.description) description = type.description || '';
    }

    return { controller: config.controller, callback: config.callback, description, name, module: config.module };
}

function printTopics(script: string, forTopic: string, commands: ParsedCliControllerConfig[], writer: CommandWriter) {
    writer('<yellow>USAGE</yellow>');
    writer(`  $ ${script} ${forTopic ? forTopic + ':' : ''}[COMMAND]`);
    writer('');
    writer('<yellow>COMMANDS</yellow>');
    const descriptionSpacing = getSpacing(commands.map(cmd => cmd.name));

    let lastTopic = '';
    for (const cmd of commands) {
        const topic = cmd.name.lastIndexOf(':') ? cmd.name.substr(0, cmd.name.lastIndexOf(':')) : '';
        if (lastTopic !== topic) {
            lastTopic = topic;
            writer(topic);
        }
        if (cmd.description) {
            const nameWithSpacing = `<green>${cmd.name}</green>` + ' '.repeat(descriptionSpacing - cmd.name.length);
            writer('  ' + nameWithSpacing + ' ' + cmd.description);
        } else {
            writer(`  <green>${cmd.name}</green>`);
        }
    }
    writer('');
    writer(`For more information on a specific command or topic, type '[command/topic] --help'`);
}

function getParamFlags(parameter: CommandParameter): string {
    const flags: string[] = [];
    if (!parameter.optional) flags.push('required');

    if (parameter.type.kind === ReflectionKind.array) {
        flags.push('multiple');
    }
    if (parameter.defaultValue !== undefined) flags.push('default=' + parameter.defaultValue);
    return flags.length ? `[${flags.join(', ')}]` : '';
}

function getParamIdentifier(parameter: CommandParameter): string {
    const elementType = parameter.type.kind === ReflectionKind.array ? parameter.type.type : parameter.type;

    if (parameter.kind === 'flag' || parameter.kind === 'flag-property') {
        let name = `--${parameter.name}`;
        if (parameter.char) name = `-${parameter.char}, ${name}`;

        if (parameter.type.kind === ReflectionKind.boolean) {
            return `<green>${name}</green>`;
        }
        let type = isReferenceType(elementType)
            ? stringifyType(ReflectionClass.from(elementType).getPrimary().type)
            : stringifyType(elementType);

        return `<green>${name} ${type}</green>`;
    }
    return `<green>${parameter.name}</green>`;
}

function printHelp(script: string, command: ParsedCliControllerConfig, writer: CommandWriter) {
    const commandParameters = collectCommandParameter(command);
    const args = commandParameters.filter(v => v.kind === 'argument');

    writer(`<yellow>Usage:</yellow> ${script} ${command.name} [OPTIONS] ${args.map(v => `[${v.name}]`).join(' ')}`);
    writer('');

    if (command.description) {
        writer(`${command.description || ''}`);
        writer('');
    }

    if (args.length) {
        writer('<yellow>Arguments:</yellow>');
        for (const parameter of args) {
            writer(`  ${parameter.name}</green>\t${parameter.description || ''}<yellow>${getParamFlags(parameter)}</yellow>`);
        }
    }

    writer('<yellow>Options:</yellow>');

    const descriptionSpacing = getSpacing(commandParameters.map(getParamIdentifier));

    for (const parameter of commandParameters) {
        if (parameter.kind === 'argument' || parameter.kind === 'service') continue;
        if (parameter.hidden) continue;
        const label = getParamIdentifier(parameter);
        const nameWithSpacing = label + ' '.repeat(descriptionSpacing - label.length);
        writer(`  ${nameWithSpacing}${parameter.description || ''}<yellow>${getParamFlags(parameter)}</yellow>`);
    }
}

type CommandWriter = (...message: any[]) => void;

interface ParameterMeta {
    flag: boolean;
    char: string;
    hidden: boolean;
    description: string;
    prefix?: string;
}

function getParameterMeta(parameter: TypeParameter | TypeProperty | TypePropertySignature): ParameterMeta {
    const metaFlag = typeAnnotation.getOption(parameter.type, 'cli:flag');
    const flagOptions = metaFlag || {};

    return {
        flag: !!metaFlag,
        char: flagOptions.char || '',
        hidden: flagOptions.hidden === true,
        prefix: flagOptions.prefix,
        description: flagOptions.description || '',
    };
}

/**
 * bin: the binary name, e.g. ['node', 'app.ts']
 * argv: the arguments, e.g. ['command', '--help']
 * writer: a function used to write the output. Defaults to console.log.
 */
export async function executeCommand(
    script: string,
    argv: string[],
    eventDispatcher: EventDispatcher,
    logger: LoggerInterface,
    injector: InjectorContext,
    commandsConfigs: ControllerConfig[],
    writer?: CommandWriter,
): Promise<number> {
    let commands = commandsConfigs.map(v => parseControllerConfig(v));

    if (!writer) {
        writer = (...message: string[]) => logger.log(...message);
    }
    const help = argv.some(v => v === '--help') || argv[0] === 'help';

    const first = argv[0] === 'help' || argv[0] === '--help' ? '' : argv[0];
    const command = commands.find(cmd => cmd.name === first);

    if (argv.length === 0 || (argv.length === 1) || help) {
        const topicPrefix = argv.length === 1 && first ? first + ':' : '';

        if (command && help) {
            printHelp(script, command, writer);
            return 0;
        } else if (!command) {
            //print topics
            commands = commands.filter(cmd => cmd.name?.startsWith(topicPrefix));

            //sort so that the ones without topics ( no ':' ) are first, then by name
            commands.sort((a, b) => {
                if (a.name?.includes(':') && !b.name?.includes(':')) return 1;
                if (!a.name?.includes(':') && b.name?.includes(':')) return -1;
                return a.name?.localeCompare(b.name || '') || 0;
            });

            printTopics(script, topicPrefix.slice(0, -1), commands, writer);
            return 0;
        }
    }

    if (!command) {
        writer(`Command "${first}" not found.`);
        return 1;
    }
    try {
        return await runCommand(command, argv.slice(1), injector, eventDispatcher, logger);
    } catch (e) {
        writer(`The command "${command.name}" failed.`);
        writer(e);
        return 1;
    }
}

function handleConvertError(logger: LoggerInterface, parameter: CommandParameter, value: any, error: any) {
    let group = parameter.kind === 'argument' ? 'argument' : 'property';
    let name = getActualCliParameterName(parameter);
    if (parameter.kind === 'flag' || parameter.kind === 'flag-property') {
        name = '--' + name;
        group = 'option';
    }
    if (error instanceof ValidationError) {
        logger.log(`<red>Invalid value for ${group} ${name}: ${value}.</red> ${error.errors[0].message} [${error.errors[0].code}]`);
        return;
    }
    logger.log(`<red>Invalid value for ${group} ${name}: ${value}.</red> ${String(error.message)}`);
}

interface CommandParameter {
    name: string;
    char: string;
    hidden: boolean;
    flag: boolean;
    optional: boolean;
    description: string;
    kind: 'argument' | 'flag' | 'flag-property' | 'service';
    defaultValue?: any;
    type: Type;
    prefix: string;
    collectInto?: string; //members of object literal
}

function collectCommandParameter(config: ParsedCliControllerConfig) {
    const parameters = config.callback
        ? ReflectionFunction.from(config.callback).getParameters()
        : config.controller
            ? ReflectionClass.from(config.controller).getMethod('execute').getParameters()
            : [];

    const result: CommandParameter[] = [];

    let objectLiterals = 0;
    for (const reflection of parameters) {
        if (reflection.parameter.type.kind === ReflectionKind.objectLiteral || reflection.parameter.type.kind === ReflectionKind.class) {
            objectLiterals++;
        }
    }

    const names = new Set<string>();

    function add(parameter: TypeParameter | TypeProperty | TypePropertySignature, prefixIn: string, collectInto?: string, forceFlag?: boolean) {
        const meta = getParameterMeta(parameter);
        const injectToken = getInjectOptions(parameter.type);
        const isSimple = supportedAsArgument(parameter.type);
        const char = meta.char || '';
        const hidden = meta.hidden || false;
        const prefix = prefixIn || meta.prefix || '';
        const optional = isOptional(parameter) || hasDefaultValue(parameter);
        const description = meta.description || parameter.description || '';
        const name = String(parameter.name);
        let defaultValue: any = undefined;
        try {
            defaultValue = parameter.kind === ReflectionKind.property || parameter.kind === ReflectionKind.parameter ? parameter.default?.() : undefined;
        } catch {
        }

        if (forceFlag || (meta.flag || isFlagForced(parameter.type)) && !injectToken) {
            // check if parameter.type is an object, e.g. { name: string, age: number }
            // split it into multiple flags, e.g. --name --age
            if (parameter.type.kind === ReflectionKind.objectLiteral || isCustomTypeClass(parameter.type)) {
                if (isReferenceType(parameter.type)) {
                    result.push({
                        name,
                        defaultValue,
                        char,
                        hidden,
                        optional,
                        description,
                        prefix,
                        collectInto,
                        kind: 'flag',
                        flag: true,
                        type: parameter.type,
                    });
                    return;
                }

                for (const property of parameter.type.types) {
                    if (property.kind !== ReflectionKind.property && property.kind !== ReflectionKind.propertySignature) continue;
                    if (!supportedFlags(property.type)) continue;
                    const subName = String(property.name);
                    if (names.has(prefix + '.' + subName)) {
                        throw new Error(`Duplicate CLI argument/flag name ${subName} in object literal. Try setting a prefix via ${name}: ${stringifyType(parameter.type)} & Flag<{prefix: '${name}'}> `);
                    }
                    names.add(prefix + '.' + subName);
                    add(property, prefix, name, true);
                }
            } else {
                names.add(name);
                result.push({
                    name,
                    defaultValue,
                    char,
                    hidden,
                    optional,
                    description,
                    prefix,
                    collectInto,
                    kind: 'flag',
                    flag: true,
                    type: parameter.type,
                });
            }
        } else {
            names.add(name);
            //it's either a simple string|number positional argument or a service
            if (isSimple && !injectToken) {
                result.push({
                    name,
                    defaultValue,
                    flag: false,
                    char,
                    optional,
                    description,
                    hidden,
                    collectInto,
                    prefix,
                    kind: 'argument',
                    type: parameter.type,
                });
            } else {
                result.push({
                    name,
                    defaultValue,
                    flag: false,
                    char,
                    optional,
                    description,
                    hidden,
                    collectInto,
                    prefix,
                    kind: 'service',
                    type: parameter.type,
                });
            }
        }
    }

    for (const reflection of parameters) {
        add(reflection.parameter, '');
    }

    if (config.controller) {
        const classSchema = ReflectionClass.from(config.controller);
        for (const reflection of classSchema.getProperties()) {
            const meta = getParameterMeta(reflection.property);
            const optional = reflection.isOptional() || reflection.hasDefault();
            const description = meta.description || reflection.property.description || '';

            if (!meta.flag) continue;
            result.push({
                name: reflection.name, hidden: meta.hidden || false, prefix: meta.prefix || '', char: meta.char || '',
                kind: 'flag-property', flag: true, description, optional, type: reflection.property.type,
            });
        }
    }

    return result;
}

function getActualCliParameterName(parameter: { prefix: string, name: string }) {
    return parameter.prefix ? parameter.prefix + '.' + parameter.name : parameter.name;
}

async function runCommand(
    config: ParsedCliControllerConfig,
    argv: string[],
    injector: InjectorContext,
    eventDispatcher: EventDispatcher,
    logger: LoggerInterface,
): Promise<any> {
    const parameters = config.callback
        ? ReflectionFunction.from(config.callback).getParameters()
        : config.controller
            ? ReflectionClass.from(config.controller).getMethod('execute').getParameters()
            : [];

    const stopwatch = injector.get(Stopwatch);
    const aliases: { [name: string]: string } = {};
    const parameterValues: { [name: string]: any } = {};

    for (const parameter of parameters) {
        const meta = getParameterMeta(parameter.parameter);
        if (meta.char) {
            aliases[meta.char] = parameter.name;
        }
    }

    const parsedArgs = parseCliArgs(argv, aliases);

    const args: any[] = [];
    let positionalIndex = 0;
    const positionalArguments: any[] = Array.isArray(parsedArgs['@']) ? parsedArgs['@'] : [];
    const commandParameters = collectCommandParameter(config);

    for (const parameter of commandParameters) {
        if (parameter.kind === 'service') {
            const injectToken = getInjectOptions(parameter.type);
            try {
                args.push(injector.get(injectToken || parameter.type));
            } catch (error) {
                if (parameter.optional && error instanceof ServiceNotFoundError) {
                    continue;
                }
                handleConvertError(logger, parameter, parsedArgs[parameter.name], error);
                return 1;
            }
            continue;
        }
        const id = getActualCliParameterName(parameter);
        let raw = parsedArgs[id];
        if (parameter.kind === 'argument') {
            raw = positionalArguments[positionalIndex];
            positionalIndex++;
        }

        try {
            const v = convert(parameter, raw) ?? parameter.defaultValue;
            if (parameter.collectInto) {
                if (!parameterValues[parameter.collectInto]) {
                    parameterValues[parameter.collectInto] = {};
                    if (parameter.kind !== 'flag-property') {
                        args.push(parameterValues[parameter.collectInto]);
                    }
                }
                if (v !== undefined) {
                    // Important to not have undefined properties in the object
                    parameterValues[parameter.collectInto][parameter.name] = v;
                }
            } else {
                parameterValues[parameter.name] = v;
                if (parameter.kind !== 'flag-property') {
                    args.push(v);
                }
            }
        } catch (error) {
            handleConvertError(logger, parameter, raw, error);
            return 1;
        }
    }

    const label = config.controller ? getClassName(config.controller) : config.callback ? config.callback.name : '';

    await eventDispatcher.dispatch(onAppExecute, { command: config.name, parameters: parameterValues, injector });
    const frame = stopwatch.active ? stopwatch.start(config.name + '(' + label + ')', FrameCategory.cli, true) : undefined;

    let exitCode: any = 1;
    try {
        //property injection possible, too
        if (config.controller) {
            const instance = injector.get(config.controller, config.module);
            for (const parameter of commandParameters) {
                if (parameter.kind !== 'flag-property') continue;
                // a flag not given keeps the property's default value
                if (parameterValues[parameter.name] === undefined) continue;
                instance[parameter.name] = parameterValues[parameter.name];
            }
            if (frame) {
                exitCode = await frame.run(() => instance.execute(...args));
            } else {
                exitCode = await instance.execute(...args);
            }
        } else if (config.callback) {
            if (frame) {
                exitCode = await frame.run(() => config.callback!(...args));
            } else {
                exitCode = await config.callback(...args);
            }
        }
        exitCode = 'number' === typeof exitCode ? exitCode : 0;
        await eventDispatcher.dispatch(onAppExecuted, {
            exitCode,
            command: config.name,
            parameters: parameterValues,
            injector,
        });
        return exitCode;
    } catch (error) {
        await eventDispatcher.dispatch(onAppError, {
            command: config.name,
            parameters: parameterValues,
            injector,
            error: error instanceof Error ? error : new Error(String(error)),
        });
        throw error;
    } finally {
        if (frame) frame.end();
        await eventDispatcher.dispatch(onAppShutdown, { command: config.name, parameters: parameterValues, injector });
    }
}
