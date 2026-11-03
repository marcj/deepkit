export class SchemaMigration {
    databaseName = 'default';
    version = 1735776000;

    up() {
        return ['CREATE TABLE "second" ("id" integer PRIMARY KEY)'];
    }

    down() {
        return ['DROP TABLE "second"'];
    }
}
