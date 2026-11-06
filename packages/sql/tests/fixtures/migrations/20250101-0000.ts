export class SchemaMigration {
    databaseName = 'default';
    version = 1735689600;

    up() {
        return ['CREATE TABLE "source" ("id" integer PRIMARY KEY)'];
    }

    down() {
        return ['DROP TABLE "source"'];
    }
}
