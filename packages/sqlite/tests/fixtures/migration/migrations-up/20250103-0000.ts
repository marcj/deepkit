export class SchemaMigration {
    databaseName = 'other';
    version = 1735862400;

    up() {
        return ['CREATE TABLE "third" ("id" integer PRIMARY KEY)'];
    }

    down() {
        return ['DROP TABLE "third"'];
    }
}
