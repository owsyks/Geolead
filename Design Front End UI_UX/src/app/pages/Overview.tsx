import { Header } from "../components/layout";
import { MetricCard, GlassCard, ScoreRing, StatusBadge } from "../components/ui";
import { Mail, Activity, ShieldAlert, ArrowRight, MapPin } from "lucide-react";
import { LineChart, Line, ResponsiveContainer } from "recharts";

const data = [
  { value: 400 }, { value: 300 }, { value: 550 },
  { value: 450 }, { value: 700 }, { value: 650 }, { value: 800 }
];

function Sparkline() {
  return (
    <div className="h-10 w-full mt-2 min-h-[40px]">
      <ResponsiveContainer width="100%" height={40}>
        <LineChart data={data}>
          <Line
            type="monotone"
            dataKey="value"
            stroke="var(--brand)"
            strokeWidth={2}
            dot={false}
            isAnimationActive={true}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function Overview() {
  return (
    <>
      <Header
        eyebrow="✉ AI outbound email automation"
        title="Command Center"
        subtitle="Live operation status"
      />
      <div className="p-8 grid grid-cols-1 lg:grid-cols-3 gap-6 relative">
        <div className="lg:col-span-2 space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard title="Campaigns" value="12" trend="2" trendUp={true} />
            <MetricCard title="Active" value="4" />
            <MetricCard title="Queued" value="1,204" />
            <GlassCard className="flex flex-col gap-2 p-5 relative overflow-hidden">
              <div className="text-[11px] uppercase tracking-[0.12em] text-text-muted font-bold z-10">
                Engagement
              </div>
              <div className="text-[28px] font-[800] font-mono tabular-nums leading-none z-10">
                8.4%
              </div>
              <div className="absolute bottom-0 left-0 right-0 z-0 opacity-50">
                <Sparkline />
              </div>
            </GlassCard>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <GlassCard className="flex flex-col gap-4">
              <div className="flex justify-between items-start">
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-text-muted font-bold">Hottest Campaign</div>
                  <div className="text-lg font-bold mt-1">Dallas Dentists Outreach</div>
                  <div className="text-sm text-text-muted">dallasdental.com</div>
                </div>
                <StatusBadge status="Active" />
              </div>
              
              <div className="grid grid-cols-3 gap-4 py-4 border-y border-border">
                <div>
                  <div className="text-[10px] text-text-muted uppercase font-bold">Open</div>
                  <div className="text-xl font-mono font-bold text-success">42%</div>
                </div>
                <div>
                  <div className="text-[10px] text-text-muted uppercase font-bold">Click</div>
                  <div className="text-xl font-mono font-bold text-info">12%</div>
                </div>
                <div>
                  <div className="text-[10px] text-text-muted uppercase font-bold">Reply</div>
                  <div className="text-xl font-mono font-bold text-brand">5.2%</div>
                </div>
              </div>
              <button className="text-brand text-sm font-bold flex items-center gap-1 hover:text-brand-hover transition-colors">
                View Campaign <ArrowRight className="w-4 h-4" />
              </button>
            </GlassCard>

            <GlassCard className="flex flex-col gap-4 bg-[url('https://images.unsplash.com/photo-1524661135-423995f22d0b?auto=format&fit=crop&q=80&w=800&sat=-100')] bg-cover bg-center bg-blend-overlay relative">
              <div className="absolute inset-0 bg-bg/90 backdrop-blur-[2px] rounded-[8px]" />
              <div className="relative z-10">
                <div className="flex justify-between items-center mb-4">
                  <div className="text-[11px] uppercase tracking-wider text-text-muted font-bold flex items-center gap-2">
                    <MapPin className="w-3 h-3 text-brand" />
                    Geo Pulse
                  </div>
                  <div className="w-2 h-2 rounded-full bg-brand animate-pulse" />
                </div>
                <div className="space-y-3">
                  {[
                    { loc: "Dallas, TX", count: 142, active: true },
                    { loc: "Austin, TX", count: 89, active: true },
                    { loc: "Houston, TX", count: 204, active: false }
                  ].map(p => (
                    <div key={p.loc} className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <div className={p.active ? "w-1.5 h-1.5 rounded-full bg-brand" : "w-1.5 h-1.5 rounded-full bg-surface-2"} />
                        <span className="text-sm font-medium">{p.loc}</span>
                      </div>
                      <span className="text-sm font-mono text-text-muted">{p.count} leads</span>
                    </div>
                  ))}
                </div>
              </div>
            </GlassCard>
          </div>

          <GlassCard className="p-0 overflow-hidden">
            <div className="p-4 border-b border-border flex justify-between items-center bg-surface-2/50">
              <div className="font-bold text-sm">Top Leads (Priority &gt; 85)</div>
              <button className="text-brand text-sm font-bold flex items-center gap-1">
                View All <ArrowRight className="w-4 h-4" />
              </button>
            </div>
            <div className="divide-y divide-border">
              {[
                { name: "Apex Dental Group", email: 3, match: 92, prio: 88, tag: "CEO" },
                { name: "Lone Star Orthodontics", email: 1, match: 85, prio: 86, tag: "Director" },
                { name: "Bright Smiles Clinic", email: 5, match: 78, prio: 72, tag: "Founder" },
                { name: "Dallas Implant Center", email: 2, match: 95, prio: 91, tag: "Owner" }
              ].map((lead, i) => (
                <div key={i} className="p-4 flex items-center justify-between hover:bg-surface-2/30 transition-colors cursor-pointer group">
                  <div>
                    <div className="font-bold text-sm flex items-center gap-2">
                      {lead.name}
                      <span className="text-[10px] uppercase font-bold bg-copper/10 text-copper px-1.5 rounded">{lead.tag}</span>
                    </div>
                    <div className="text-[12px] text-text-muted mt-0.5">{lead.email} verified emails found</div>
                  </div>
                  <div className="flex gap-4 items-center">
                    <div className="flex flex-col items-center">
                      <ScoreRing score={lead.match} size="sm" />
                      <span className="text-[9px] uppercase tracking-wider text-text-muted mt-1">Match</span>
                    </div>
                    <div className="flex flex-col items-center">
                      <ScoreRing score={lead.prio} size="sm" />
                      <span className="text-[9px] uppercase tracking-wider text-text-muted mt-1">Priority</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>
        </div>

        <div className="space-y-6">
          <GlassCard className="p-0 overflow-hidden flex flex-col h-[500px]">
            <div className="p-4 border-b border-border flex justify-between items-center bg-surface-2/50 sticky top-0 z-10 backdrop-blur-md">
              <div className="font-bold text-sm flex items-center gap-2">
                <Activity className="w-4 h-4 text-brand" />
                The Trading Floor
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-brand shadow-[0_0_8px_var(--brand)] animate-pulse" />
                <span className="text-[11px] uppercase tracking-wider text-brand font-bold">Live</span>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {[
                { type: "REPLIED", color: "text-brand", bg: "bg-brand/10", border: "border-brand/20", firm: "Apex Dental", variant: "B", email: "dr.smith@apex...", subject: "Re: Quick question about Dallas...", time: "Just now" },
                { type: "OPENED", color: "text-success", bg: "bg-success/10", border: "border-success/20", firm: "Lone Star", variant: "A", email: "info@lonestar...", subject: "Dental marketing in TX", time: "2m ago" },
                { type: "CLICKED", color: "text-info", bg: "bg-info/10", border: "border-info/20", firm: "Bright Smiles", variant: "C", email: "hello@brightsmil...", subject: "Local SEO for dentists", time: "5m ago" },
                { type: "BOUNCED", color: "text-danger", bg: "bg-danger/10", border: "border-danger/20", firm: "DFW Clinics", variant: "A", email: "admin@dfwclin...", subject: "Quick question about Dallas...", time: "12m ago" },
                { type: "OPENED", color: "text-success", bg: "bg-success/10", border: "border-success/20", firm: "Texas Tooth", variant: "B", email: "contact@tt...", subject: "Re: Practice growth", time: "18m ago" },
                { type: "UNSUBSCRIBED", color: "text-copper", bg: "bg-copper/10", border: "border-copper/20", firm: "Modern Smiles", variant: "C", email: "owner@modern...", subject: "Local SEO for dentists", time: "22m ago" },
              ].map((ev, i) => (
                <div key={i} className="flex gap-3 text-sm animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className={`mt-0.5 w-[72px] shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded border text-center ${ev.color} ${ev.bg} ${ev.border}`}>
                    {ev.type}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between items-start mb-0.5">
                      <span className="font-bold truncate pr-2">
                        <span className="text-text-muted font-normal mr-1 border border-border rounded px-1 text-[10px]">{ev.variant}</span>
                        {ev.firm}
                      </span>
                      <span className="text-[11px] text-text-faint whitespace-nowrap">{ev.time}</span>
                    </div>
                    <div className="text-[12px] text-text-muted truncate">
                      {ev.email}
                    </div>
                    <div className="text-[12px] text-text-faint truncate italic">
                      "{ev.subject}"
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>

          <GlassCard className="bg-copper/5 border-copper/20">
            <div className="flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-copper mt-0.5" />
              <div>
                <div className="font-bold text-sm text-copper">Deliverability Alert</div>
                <p className="text-sm text-text-muted mt-1">
                  Campaign <strong>Dallas Dentists</strong> has an elevated bounce rate (4.2%). Recommend pausing to scrub remaining list.
                </p>
                <div className="mt-3 flex gap-2">
                  <button className="px-3 py-1.5 bg-copper/10 text-copper hover:bg-copper/20 transition-colors rounded text-[12px] font-bold border border-copper/20">
                    Pause Campaign
                  </button>
                  <button className="px-3 py-1.5 bg-surface-2 text-text hover:bg-surface transition-colors rounded text-[12px] font-bold border border-border">
                    View Details
                  </button>
                </div>
              </div>
            </div>
          </GlassCard>
        </div>
      </div>
    </>
  );
}
