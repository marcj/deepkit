const { Database } = require('@deepkit/orm');
const { SQLiteDatabaseAdapter } = require('@deepkit/sqlite');

exports.database = new Database(new SQLiteDatabaseAdapter(':memory:'));
