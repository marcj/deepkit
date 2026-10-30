import { Database } from '@deepkit/orm';
import { SQLiteDatabaseAdapter } from '@deepkit/sqlite';
import { AutoIncrement, PrimaryKey } from '@deepkit/type';

class MigrationUser {
    id: number & PrimaryKey & AutoIncrement = 0;
    name: string = '';
}

export const database = new Database(new SQLiteDatabaseAdapter(':memory:'), [MigrationUser]);
