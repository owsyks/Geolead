// Canned FAQ content for the SupportBubble chat widget. Rule-based, no AI call:
// quick-reply buttons plus simple keyword matching against free-text input.
export interface FaqEntry {
  id: string;
  question: string;
  answer: string;
  keywords: string[];
}

export const SUPPORT_FAQS: FaqEntry[] = [
  {
    id: "campaign",
    question: "How do I create a campaign?",
    answer: "Go to Campaigns → New Campaign, pick a lead list from Lead Explorer or Watchlist, choose a sender account and template, then launch. You can preview and edit each email variant before sending.",
    keywords: ["campaign", "send email", "outreach", "sequence"],
  },
  {
    id: "sender",
    question: "How do I add a sender account?",
    answer: "Open Senders → Add Sender Account, connect via OAuth (Gmail/Outlook) or SMTP, then verify it. New senders should be warmed up gradually before high-volume sending.",
    keywords: ["sender", "smtp", "mailbox", "connect email", "gmail", "outlook"],
  },
  {
    id: "billing",
    question: "I have a billing or plan question",
    answer: "You can view or change your plan anytime in Billing. If something looks wrong on an invoice or charge, use \"Talk to a human\" below and our team will take a look.",
    keywords: ["billing", "invoice", "charge", "plan", "subscription", "refund", "price"],
  },
  {
    id: "domain",
    question: "How do I verify a domain?",
    answer: "Go to Sender Accounts → Domains, add your sending domain, then add the SPF/DKIM/DMARC DNS records shown to your DNS provider. Verification usually completes within a few minutes of the records propagating.",
    keywords: ["domain", "dns", "spf", "dkim", "dmarc", "verify"],
  },
  {
    id: "bug",
    question: "I found a bug",
    answer: "Sorry about that! Use \"Talk to a human\" below and describe what happened — screenshots help a lot. Our team will follow up here and by email.",
    keywords: ["bug", "broken", "error", "not working", "crash", "issue"],
  },
];

export function matchFaq(text: string): FaqEntry | null {
  const q = text.toLowerCase();
  let best: { entry: FaqEntry; hits: number } | null = null;
  for (const entry of SUPPORT_FAQS) {
    const hits = entry.keywords.filter((k) => q.includes(k)).length;
    if (hits > 0 && (!best || hits > best.hits)) best = { entry, hits };
  }
  return best?.entry ?? null;
}
