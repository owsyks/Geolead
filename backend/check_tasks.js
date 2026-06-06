const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  const tasks = await prisma.searchTask.findMany({
    where: { status: { in: ['PROCESSING', 'PENDING'] } },
    orderBy: { updatedAt: 'desc' },
    take: 5,
  });
  console.log(JSON.stringify(tasks, null, 2));
  await prisma.$disconnect();
})();
