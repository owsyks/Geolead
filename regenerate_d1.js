const { PrismaClient } = require("@prisma/client");
const { localVariants } = require("./dist/services/campaignVariants");
const p = new PrismaClient();
(async () => {
  const campaign = await p.campaign.findFirst({ where: { name: 'D1' }, select: { id: true, name: true, geoDomain: true, niche: true, cityState: true, metadata: true } });
  if (!campaign) { console.log('D1 not found'); return; }
  const vars = localVariants({ geoDomain: campaign.geoDomain, niche: campaign.niche || undefined, cityState: campaign.cityState || undefined });
  const bundle = { generatedAt: new Date().toISOString(), variants: vars };
  await p.campaign.update({ where: { id: campaign.id }, data: { metadata: { ...(campaign.metadata || {}), variants: bundle } } });
  console.log(`Regenerated ${vars.length} variants for ${campaign.name}`);
  for (const v of vars) {
    console.log(`  ${v.key}: "${v.subject}"`);
  }
  await p.$disconnect();
})();
