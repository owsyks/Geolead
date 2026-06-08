const { PrismaClient } = require("@prisma/client");
const { localVariants } = require("./dist/services/campaignVariants");
const p = new PrismaClient();
(async () => {
  const campaigns = await p.campaign.findMany({ select: { id: true, name: true, geoDomain: true, niche: true, cityState: true, metadata: true } });
  let updated = 0;
  for (const c of campaigns) {
    const vars = localVariants({ geoDomain: c.geoDomain, niche: c.niche || undefined, cityState: c.cityState || undefined });
    const bundle = { generatedAt: new Date().toISOString(), variants: vars };
    await p.campaign.update({ where: { id: c.id }, data: { metadata: { ...(c.metadata || {}), variants: bundle } } });
    console.log(`${c.name}: regenerated ${vars.length} variants`);
    for (const v of vars) {
      console.log(`  ${v.key}: "${v.subject}"`);
    }
    updated++;
  }
  console.log(`\nRegenerated ${updated} campaigns`);
  await p.$disconnect();
})();
