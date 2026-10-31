// Sequelize with PostgreSQL.
import { DataTypes, Model, Sequelize } from 'sequelize';

import { createRows, ormSuite, postgresUrl, resetPostgres, rowCount } from '../shared.js';

export default async function () {
    await resetPostgres(false);
    const sequelize = new Sequelize(postgresUrl, { dialect: 'postgres', logging: false });
    const attributes = {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        name: { type: DataTypes.TEXT, allowNull: false },
        ready: { type: DataTypes.BOOLEAN, allowNull: false },
        priority: { type: DataTypes.INTEGER, allowNull: false },
    };
    class User extends Model {
        declare name: string;
    }
    class Inserted extends Model {}
    User.init(attributes, { sequelize, tableName: 'bench_user', timestamps: false });
    Inserted.init(attributes, { sequelize, tableName: 'bench_insert', timestamps: false });
    await sequelize.sync();
    await User.bulkCreate(createRows(rowCount));

    return ormSuite('postgres', 'Sequelize', {
        findOne: id => User.findByPk(id),
        findAll: () => User.findAll(),
        insertMany: async rows => void (await Inserted.bulkCreate(rows)),
        deleteInserted: async () => void (await Inserted.destroy({ where: {} })),
        close: () => sequelize.close(),
    });
}
