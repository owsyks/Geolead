import prisma from '../config/db.js';

async function main() {
  const jwtSecret = process.env.JWT_SECRET || '';
  if (jwtSecret.length < 32) throw new Error('JWT_SECRET is missing or shorter than 32 characters.');

  await prisma.$transaction(async (tx) => {
    await tx.registrationChallenge.count();
    await tx.paymentAttempt.count();
  });

  console.log('[AuthBillingAudit] Registration and Paymento persistence are ready.');
}

main()
  .catch((error) => {
    console.error('[AuthBillingAudit] FAILED:', error instanceof Error ? error.message : 'unknown error');
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
