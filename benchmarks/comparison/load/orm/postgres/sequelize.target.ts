// Sequelize with PostgreSQL under load.
import { DataTypes, Model, Op, Sequelize } from 'sequelize';

import { postgresUrl } from '../../../orm/shared.js';
import { ormTarget, pageSize } from '../../orm-load.js';

export const target = ormTarget(async ({ poolSize }) => {
    const sequelize = new Sequelize(postgresUrl, { dialect: 'postgres', logging: false, pool: { max: poolSize } });
    const attributes = {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        name: { type: DataTypes.TEXT, allowNull: false },
        ready: { type: DataTypes.BOOLEAN, allowNull: false },
        priority: { type: DataTypes.INTEGER, allowNull: false },
    };
    class User extends Model {
        declare name: string;
    }
    class Inserted extends Model {
        declare id: number;
    }
    User.init(attributes, { sequelize, tableName: 'bench_user', timestamps: false });
    Inserted.init(attributes, { sequelize, tableName: 'bench_insert', timestamps: false });
    return {
        findOne: id => User.findByPk(id),
        findPage: afterId =>
            User.findAll({ where: { id: { [Op.gt]: afterId } }, order: [['id', 'ASC']], limit: pageSize }),
        insertOne: async row => (await Inserted.create(row as any)).id,
    };
});
