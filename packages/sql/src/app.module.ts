import { AppModule, onAppShutdown } from '@deepkit/app';
import { ConsoleTransport, Logger } from '@deepkit/logger';
import { InjectorContext } from '@deepkit/injector';
import { DatabaseRegistry } from '@deepkit/orm';
import { MigrationCreateController } from './cli/migration-create-command.js';
import { MigrationDownCommand } from './cli/migration-down-command.js';
import { MigrationUpCommand } from './cli/migration-up-command.js';
import { MigrationPendingCommand } from './cli/migration-pending-command.js';
import { MigrationProvider } from './migration/migration-provider.js';

export const appModule = new AppModule({}, {
    providers: [
        MigrationProvider,
        { provide: DatabaseRegistry, useFactory: (ic: InjectorContext) => new DatabaseRegistry(ic) },
        { provide: Logger, useValue: new Logger([new ConsoleTransport]) }
    ],
    controllers: [
        MigrationCreateController,
        MigrationDownCommand,
        MigrationUpCommand,
        MigrationPendingCommand,
    ],
    listeners: [
        onAppShutdown.listen((event, databases: DatabaseRegistry) => databases.onShutDown()),
    ],
});
