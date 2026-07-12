// Central tenant predicates for relations that do not carry userId directly.
// Keeping these fail-closed builders in one place makes it harder for a new
// route or background worker to accidentally omit an ownership constraint.

export function replyTenantWhere(userId: string) {
  return {
    AND: [
      { campaign: { userId } },
      { lead: { ownerId: userId } },
      { OR: [{ mailboxId: null }, { mailbox: { userId } }] },
    ],
  };
}

export function campaignEmailLogTenantWhere(campaignId: string, userId: string) {
  return { campaignId, campaign: { userId } };
}

export function ownedEmailLogWhere(userId: string, criteria: Record<string, unknown>) {
  return { AND: [{ campaign: { userId } }, criteria] };
}

export function isConsistentReplyThread(
  campaignLead: { id: string; campaignId: string; leadId: string },
  emailLog: { campaignId: string; leadId: string; campaignLeadId?: string | null },
) {
  return campaignLead.campaignId === emailLog.campaignId
    && campaignLead.leadId === emailLog.leadId
    && (!emailLog.campaignLeadId || emailLog.campaignLeadId === campaignLead.id);
}
