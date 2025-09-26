import { Flag } from '@deepkit/app';

export class BaseCommand {
    /**
     * @description Sets the migration directory.
     */
    protected migrationDir: string & Flag = '';

    /**
     * @description Sets the database path
     */
    protected path?: string & Flag;
}
