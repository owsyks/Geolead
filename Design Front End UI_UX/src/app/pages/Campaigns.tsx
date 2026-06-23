import { Header } from "../components/layout";
import { GlassCard, StatusBadge } from "../components/ui";
import { Zap, Settings, Play, Pause, Square, BarChart2 } from "lucide-react";

const campaigns = [
  { id: 1, status: "ACTIVE", name: "Dallas Dentists Outreach", domain: "dallasdental.com", sent: 142, open: 42, reply: 5.2, nextFollowUp: "2h 15m", urgent: true },
  { id: 2, status: "ACTIVE", name: "Austin Lawyers Q1", domain: "austinlegal.com", sent: 88, open: 35, reply: 2.1, nextFollowUp: "1d 4h", urgent: false },
  { id: 3, status: "PAUSED", name: "Miami Plumbers Test", domain: "miamiplumbers.com", sent: 24, open: 12, reply: 0, nextFollowUp: "-", urgent: false },
  { id: 4, status: "DRAFT", name: "Seattle HVAC Intro", domain: "seattlehvac.com", sent: 0, open: 0, reply: 0, nextFollowUp: "-", urgent: false },
];

export default function Campaigns() {
  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <Header
        eyebrow="Outreach Engine"
        title="Campaigns"
      />
      <div className="flex-1 flex overflow-hidden">
        {/* Create Form */}
        <div className="w-[400px] shrink-0 border-r border-border bg-surface-2/30 overflow-y-auto p-6 space-y-6">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-5 h-5 text-brand" />
            <h2 className="font-black text-lg">New Campaign</h2>
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider mb-1 block">Domain Target</label>
              <select className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:border-brand focus:outline-none">
                <option>dallasdental.com</option>
                <option>austinlegal.com</option>
              </select>
            </div>
            
            <div>
              <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider mb-1 block">Campaign Name</label>
              <input type="text" className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:border-brand focus:outline-none" defaultValue="Dallas Dentists Outreach" />
            </div>

            <div>
              <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider mb-1 block">Objective</label>
              <textarea className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm h-24 resize-none focus:border-brand focus:outline-none" placeholder="What are you trying to achieve? (e.g. Sell the domain, offer SEO services)"></textarea>
            </div>

            <div>
              <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider mb-2 block">Throttle (Daily Limit)</label>
              <div className="grid grid-cols-4 gap-2">
                {["5", "10", "20", "50"].map(limit => (
                  <button key={limit} className={`py-1.5 border rounded text-sm font-medium transition-colors ${limit === "20" ? "bg-brand/10 border-brand/30 text-brand" : "bg-bg border-border text-text-muted hover:border-brand/50"}`}>
                    {limit}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider mb-1 block">Sender Account</label>
              <select className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:border-brand focus:outline-none">
                <option>hello@geolead.ai (SMTP)</option>
              </select>
            </div>

            <div className="pt-4 border-t border-border">
              <button className="w-full bg-brand text-bg font-bold rounded-lg py-2.5 hover:bg-brand-hover transition-all shadow-[0_0_12px_rgba(20,184,166,0.3)]">
                Create & Generate Variants
              </button>
            </div>
          </div>
        </div>

        {/* Kanban Board */}
        <div className="flex-1 overflow-x-auto p-6 bg-bg flex gap-6">
          {["DRAFT", "ACTIVE", "PAUSED", "COMPLETED"].map(colStatus => (
            <div key={colStatus} className="w-[320px] shrink-0 flex flex-col gap-4">
              <div className="flex justify-between items-center px-1">
                <div className="text-[12px] font-bold text-text-muted uppercase tracking-wider">{colStatus}</div>
                <div className="bg-surface-2 px-2 py-0.5 rounded text-[11px] font-mono text-text-muted">
                  {campaigns.filter(c => c.status === colStatus).length}
                </div>
              </div>
              
              <div className="space-y-4">
                {campaigns.filter(c => c.status === colStatus).map(c => (
                  <GlassCard key={c.id} className="cursor-grab active:cursor-grabbing hover:border-brand/50 transition-colors p-4 flex flex-col gap-3">
                    <div>
                      <div className="font-bold text-[15px] mb-1 leading-tight">{c.name}</div>
                      <div className="text-[12px] text-text-muted">{c.domain}</div>
                    </div>
                    
                    {c.status !== "DRAFT" && (
                      <>
                        <div className="grid grid-cols-3 gap-2 py-2 border-y border-border/50">
                          <div className="text-center">
                            <div className="text-[10px] text-text-muted uppercase font-bold">Sent</div>
                            <div className="font-mono text-sm font-bold">{c.sent}</div>
                          </div>
                          <div className="text-center">
                            <div className="text-[10px] text-text-muted uppercase font-bold">Open</div>
                            <div className="font-mono text-sm font-bold text-success">{c.open}%</div>
                          </div>
                          <div className="text-center">
                            <div className="text-[10px] text-text-muted uppercase font-bold">Reply</div>
                            <div className="font-mono text-sm font-bold text-brand">{c.reply}%</div>
                          </div>
                        </div>
                        
                        <div className="flex justify-between items-center">
                          <div className={`text-[11px] font-bold ${c.urgent ? "text-copper" : "text-text-muted"}`}>
                            Next: {c.nextFollowUp}
                          </div>
                          <div className="flex gap-1">
                            {c.status === "ACTIVE" ? (
                              <button className="p-1.5 bg-surface border border-border rounded text-text-muted hover:text-copper hover:border-copper transition-colors" title="Pause"><Pause className="w-3.5 h-3.5" /></button>
                            ) : c.status === "PAUSED" ? (
                              <button className="p-1.5 bg-surface border border-border rounded text-text-muted hover:text-success hover:border-success transition-colors" title="Resume"><Play className="w-3.5 h-3.5" /></button>
                            ) : null}
                            <button className="p-1.5 bg-surface border border-border rounded text-text-muted hover:text-text hover:border-border transition-colors" title="Variants"><Settings className="w-3.5 h-3.5" /></button>
                            <button className="p-1.5 bg-surface border border-border rounded text-text-muted hover:text-info hover:border-info transition-colors" title="Events"><BarChart2 className="w-3.5 h-3.5" /></button>
                          </div>
                        </div>
                      </>
                    )}
                    
                    {c.status === "DRAFT" && (
                      <button className="w-full mt-2 py-1.5 bg-brand/10 text-brand text-[12px] font-bold rounded border border-brand/20 hover:bg-brand hover:text-bg transition-colors">
                        Launch Campaign
                      </button>
                    )}
                  </GlassCard>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
