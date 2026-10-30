import { Flag } from '@deepkit/app';

export class BaseCommand {
    /**
     * @description Sets the migration directory.
     */
    protected migrationDir: string & Flag = '';

    /**
     * @description Files that export Database instances, e.g. --path database.ts. Not needed with FrameworkModule.
     */
    protected path: string[] & Flag = [];
}
