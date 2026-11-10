// Prisma 7 with the better-sqlite3 driver adapter, concurrent users in one process.
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';

import { PrismaClient } from '../../../orm/prisma-generated/sqlite/client.js';
import { ormTarget, pageSize } from '../../orm-load.js';

export const target = ormTarget(async ({ file }) => {
    const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: 'file:' + file }) });
    return {
        findOne: id => prisma.user.findUnique({ where: { id } }),
        findPage: afterId =>
            prisma.user.findMany({ where: { id: { gt: afterId } }, orderBy: { id: 'asc' }, take: pageSize }),
        insertOne: async row => (await prisma.inserted.create({ data: row })).id,
    };
});
