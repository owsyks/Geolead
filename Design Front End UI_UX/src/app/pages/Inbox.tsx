import { Header } from "../components/layout";
import { GlassCard, StatusBadge, cn } from "../components/ui";
import { Search, Reply, Archive, MoreHorizontal, Sparkles, AlertCircle, Clock, User, Building2, Send } from "lucide-react";
import { useState } from "react";

const replies = [
  { id: 1, firm: "Apex Dental", email: "dr.smith@apexdental.com", subject: "Re: Dallas Dental Practice", category: "Interested", time: "10:24 AM", read: false, intent: 88, snippet: "Hi, thanks for reaching out. Yes, we are actually looking to expand our SEO presence..." },
  { id: 2, firm: "Lone Star Ortho", email: "mjohnson@lonestarortho.net", subject: "Re: Quick question about Dallas", category: "Negotiating", time: "Yesterday", read: true, intent: 65, snippet: "What's the asking price? We might be interested if the price is right, but $10k is a bit steep." },
  { id: 3, firm: "Bright Smiles", email: "emily@brightsmilestx.com", subject: "Re: Local SEO for dentists", category: "Not Interested", time: "Mon", read: true, intent: 12, snippet: "Please remove us from your list. We handle this in-house." },
  { id: 4, firm: "DFW Clinics", email: "admin@dfwclinics.com", subject: "Re: Dental marketing in TX", category: "Spam", time: "Mon", read: true, intent: 0, snippet: "Auto-reply: Out of office. For any inquiries please call..." },
];

export default function Inbox() {
  const [activeReply, setActiveReply] = useState(replies[0]);
  
  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <Header
        eyebrow="Triage & Respond"
        title="Inbox"
        subtitle="AI-triaged replies"
      />
      <div className="flex-1 flex overflow-hidden">
        {/* Reply List */}
        <div className="w-[380px] shrink-0 border-r border-border bg-bg flex flex-col">
          <div className="p-4 border-b border-border space-y-3 bg-surface-2/30">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <input type="text" placeholder="Search replies..." className="w-full bg-bg border border-border rounded px-3 py-1.5 pl-9 text-sm focus:border-brand focus:outline-none" />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
              {["All", "Unread", "Interested", "Negotiating"].map((f, i) => (
                <button key={f} className={cn(
                  "px-3 py-1 text-[12px] font-bold rounded-full whitespace-nowrap transition-colors",
                  i === 0 ? "bg-surface text-text border border-border" : "bg-transparent text-text-muted hover:bg-surface"
                )}>
                  {f}
                </button>
              ))}
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto divide-y divide-border">
            {replies.map(r => (
              <div 
                key={r.id} 
                onClick={() => setActiveReply(r)}
                className={cn(
                  "p-4 cursor-pointer transition-colors relative group",
                  activeReply.id === r.id ? "bg-brand/5 border-l-2 border-l-brand" : "hover:bg-surface-2/30 border-l-2 border-l-transparent",
                  !r.read && "font-medium"
                )}
              >
                {!r.read && <div className="absolute top-4 right-4 w-2 h-2 rounded-full bg-brand animate-pulse" />}
                <div className="flex justify-between items-start mb-1 pr-4">
                  <div className={cn("text-[14px] truncate", !r.read && "font-bold")}>{r.firm}</div>
                  <div className="text-[11px] text-text-muted whitespace-nowrap">{r.time}</div>
                </div>
                <div className="text-[12px] text-text-muted truncate mb-2">{r.subject}</div>
                <div className="text-[13px] text-text-muted line-clamp-2 leading-relaxed mb-3">
                  {r.snippet}
                </div>
                <StatusBadge status={r.category} />
              </div>
            ))}
          </div>
        </div>

        {/* Reply Detail */}
        <div className="flex-1 bg-surface-2/10 flex flex-col">
          {/* Header */}
          <div className="p-6 border-b border-border bg-bg flex justify-between items-start">
            <div>
              <h2 className="text-xl font-bold mb-1">{activeReply.subject}</h2>
              <div className="flex items-center gap-4 text-sm text-text-muted">
                <span className="flex items-center gap-1"><User className="w-4 h-4" /> {activeReply.email}</span>
                <span className="flex items-center gap-1"><Building2 className="w-4 h-4" /> {activeReply.firm}</span>
                <span className="flex items-center gap-1"><Clock className="w-4 h-4" /> {activeReply.time}</span>
              </div>
            </div>
            <div className="flex gap-2">
              <button className="flex items-center gap-2 px-3 py-1.5 bg-surface border border-border rounded text-sm font-medium hover:bg-surface-2 transition-colors">
                <Reply className="w-4 h-4" /> Reply
              </button>
              <button className="flex items-center gap-2 px-3 py-1.5 bg-surface border border-border rounded text-sm font-medium hover:bg-surface-2 transition-colors">
                <Archive className="w-4 h-4" /> Archive
              </button>
              <button className="p-1.5 bg-surface border border-border rounded hover:bg-surface-2 transition-colors">
                <MoreHorizontal className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
            {/* AI Summary Card */}
            <GlassCard className="bg-brand/5 border-brand/20 p-5 flex gap-6">
              <div className="flex flex-col items-center justify-center shrink-0">
                <div className="w-12 h-12 rounded-full border-2 border-brand flex items-center justify-center bg-bg relative">
                  <Sparkles className="w-5 h-5 text-brand" />
                  <div className="absolute -bottom-1 -right-1 bg-bg rounded-full p-0.5">
                    <div className="w-3 h-3 rounded-full bg-success"></div>
                  </div>
                </div>
                <div className="text-[10px] uppercase font-bold text-brand tracking-wider mt-2">AI Summary</div>
              </div>
              <div className="flex-1">
                <div className="flex gap-2 mb-2">
                  <StatusBadge status={activeReply.category} />
                  <span className="text-[12px] px-2 py-0.5 rounded border border-border bg-bg text-text-muted">Intent Score: {activeReply.intent}/100</span>
                </div>
                <p className="text-sm leading-relaxed text-text-muted">
                  The prospect is expressing clear interest in SEO expansion. They are asking for pricing details and timelines. Recommend responding with the standard consultative pitch emphasizing our Texas local SEO case studies.
                </p>
              </div>
            </GlassCard>

            {/* Email Thread */}
            <div className="bg-bg border border-border rounded-lg p-5">
              <div className="flex justify-between items-start mb-4">
                <div className="font-bold">{activeReply.firm}</div>
                <div className="text-[12px] text-text-muted">{activeReply.time}</div>
              </div>
              <div className="text-sm leading-relaxed whitespace-pre-wrap">
                {activeReply.snippet}
                <br /><br />
                Could you send over some more information regarding your pricing and how long it usually takes to see results? We currently work with a local agency but are open to exploring other options.
                <br /><br />
                Thanks,<br />
                Sarah Smith
              </div>
            </div>

            {/* Compose Area */}
            <div className="mt-auto pt-6">
              <div className="bg-bg border border-brand/40 shadow-[0_0_0_1px_rgba(20,184,166,0.1),0_8px_24px_rgba(0,0,0,0.2)] rounded-lg overflow-hidden flex flex-col">
                <div className="p-3 border-b border-border bg-surface-2 flex justify-between items-center">
                  <div className="flex items-center gap-2 text-sm">
                    <Sparkles className="w-4 h-4 text-brand" />
                    <span className="font-bold text-brand">AI Suggested Response</span>
                    <span className="text-[11px] text-text-muted ml-2">(Editable)</span>
                  </div>
                  <div className="flex gap-2">
                    <button className="text-[11px] px-2 py-1 bg-surface border border-border rounded hover:bg-surface-2">Make Shorter</button>
                    <button className="text-[11px] px-2 py-1 bg-surface border border-border rounded hover:bg-surface-2">Add Calendar Link</button>
                  </div>
                </div>
                <textarea 
                  className="w-full p-4 h-48 bg-transparent text-sm resize-none focus:outline-none"
                  defaultValue={`Hi Sarah,\n\nThanks for getting back to me. It's great to hear you're looking to expand your SEO presence in Dallas.\n\nOur pricing for local dental SEO starts at $1,500/mo, and clients typically see a 40% increase in organic booking volume within the first 90 days.\n\nI have a case study specifically for a Texas dental practice I'd love to share. Do you have 10 minutes next Tuesday for a quick intro call?\n\nBest,\nAlex`}
                />
                <div className="p-3 border-t border-border bg-surface-2 flex justify-between items-center">
                  <div className="text-[11px] text-text-muted">Draft saved</div>
                  <button className="flex items-center gap-2 px-4 py-2 bg-brand text-bg font-bold text-sm rounded-lg hover:bg-brand-hover shadow-[0_0_12px_rgba(20,184,166,0.3)]">
                    Send Reply <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
