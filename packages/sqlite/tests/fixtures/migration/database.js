const { Database } = require('@deepkit/orm');
const { SQLiteDatabaseAdapter } = require('@deepkit/sqlite');

exports.database = new Database(new SQLiteDatabaseAdapter(process.env.MIGRATION_DATABASE_PATH ?? ':memory:'));
