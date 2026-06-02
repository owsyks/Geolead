import prisma from './config/db.js';

async function main() {
  try {
    console.log("Testing Prisma query...");
    const count = await prisma.lead.count({
      where: {
        OR: [
          { emails: { some: { status: 'VALID' } } },
          { phoneNumbers: { isEmpty: false } }
        ]
      }
    });
    console.log("Success! Count of matching leads:", count);
  } catch (error: any) {
    console.error("Prisma query failed with error:", error.message || error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
