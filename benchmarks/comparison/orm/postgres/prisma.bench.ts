// Prisma 7 with the node-postgres driver adapter.
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../prisma-generated/postgres/client.js';
import { createRows, ormSuite, postgresUrl, resetPostgres, rowCount } from '../shared.js';

export default async function () {
    await resetPostgres(true);
    const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: postgresUrl }) });
    await prisma.user.createMany({ data: createRows(rowCount) });

    return ormSuite('postgres', 'Prisma', {
        findOne: id => prisma.user.findUnique({ where: { id } }),
        findAll: () => prisma.user.findMany(),
        insertMany: async rows => void (await prisma.inserted.createMany({ data: rows })),
        deleteInserted: async () => void (await prisma.inserted.deleteMany()),
        close: () => prisma.$disconnect(),
    });
}
