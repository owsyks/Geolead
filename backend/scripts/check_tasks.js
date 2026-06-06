const { PrismaClient } = require("./node_modules/@prisma/client");
const prisma = new PrismaClient();
(async () => {
  const tasks = await prisma.searchTask.findMany({
    take: 5,
    orderBy: { updatedAt: "desc" }
  });
  for (const t of tasks) {
    console.log(`${t.id} | ${t.status} | progress=${t.progress}% | leads=${t.totalLeads} | ${t.domainIdea} | depth=${t.searchDepth} | ${t.updatedAt}`);
  }
  await prisma.$disconnect();
})();
