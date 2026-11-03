export class SchemaMigration {
    databaseName = 'default';
    version = 1735689600;

    up() {
        return ['CREATE TABLE "first" ("id" integer PRIMARY KEY)'];
    }

    down() {
        return ['DROP TABLE "first"'];
    }
}
