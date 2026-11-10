// Prisma 7 with the node-postgres driver adapter under load.
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../../../orm/prisma-generated/postgres/client.js';
import { postgresUrl } from '../../../orm/shared.js';
import { ormTarget, pageSize } from '../../orm-load.js';

export const target = ormTarget(async ({ poolSize }) => {
    const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: postgresUrl, max: poolSize }) });
    return {
        findOne: id => prisma.user.findUnique({ where: { id } }),
        findPage: afterId =>
            prisma.user.findMany({ where: { id: { gt: afterId } }, orderBy: { id: 'asc' }, take: pageSize }),
        insertOne: async row => (await prisma.inserted.create({ data: row })).id,
    };
});
