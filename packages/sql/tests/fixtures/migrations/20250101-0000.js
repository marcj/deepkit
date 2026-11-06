exports.SchemaMigration = class {
    databaseName = 'default';
    version = 1735689600;

    up() {
        return ['CREATE TABLE "compiled" ("id" integer PRIMARY KEY)'];
    }

    down() {
        return ['DROP TABLE "compiled"'];
    }
};
