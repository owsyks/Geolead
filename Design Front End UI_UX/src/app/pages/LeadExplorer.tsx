import { Header } from "../components/layout";
import { GlassCard, MetricCard, ScoreRing, StatusBadge, cn } from "../components/ui";
import { Search, ChevronDown, CheckCircle2, Play, Pause, Square, MapPin, Building2, User, Phone, Mail, FileText, CheckSquare, MoreHorizontal } from "lucide-react";
import { useState } from "react";

const leads = [
  { id: 1, name: "Apex Dental Group", website: "apexdental.com", location: "Dallas, TX", dmName: "Dr. Sarah Smith", dmRole: "CEO & Founder", dmScore: 92, intent: 88, priority: 95, match: 90, status: "NOT CONTACTED", emails: [{ addr: "sarah@apexdental.com", status: "VALID" }], phone: "+1 214-555-0192", channel: "EMAIL_FIRST", note: "" },
  { id: 2, name: "Lone Star Orthodontics", website: "lonestarortho.net", location: "Dallas, TX", dmName: "Mark Johnson", dmRole: "Director of Marketing", dmScore: 65, intent: 45, priority: 72, match: 85, status: "CONTACTED", emails: [{ addr: "mjohnson@lonestarortho.net", status: "RISKY" }], phone: "+1 214-555-0104", channel: "CALL_FIRST", note: "Called twice, left VM." },
  { id: 3, name: "Bright Smiles Clinic", website: "brightsmilestx.com", location: "Fort Worth, TX", dmName: "Emily Davis", dmRole: "Practice Manager", dmScore: 78, intent: 65, priority: 81, match: 80, status: "NOT CONTACTED", emails: [{ addr: "emily.davis@brightsmilestx.com", status: "VALID" }], phone: "+1 817-555-0129", channel: "WHATSAPP", note: "" },
  { id: 4, name: "Dallas Implant Center", website: "dallasimplant.com", location: "Dallas, TX", dmName: "Dr. Michael Chen", dmRole: "Owner", dmScore: 95, intent: 92, priority: 96, match: 98, status: "NOT CONTACTED", emails: [{ addr: "dr.chen@dallasimplant.com", status: "VALID" }, { addr: "info@dallasimplant.com", status: "VALID" }], phone: "+1 214-555-0188", channel: "EMAIL_FIRST", note: "High priority." },
];

export default function LeadExplorer() {
  const [selectedLeads, setSelectedLeads] = useState<number[]>([]);

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden">
      <Header
        eyebrow="Target: dallasdental.com"
        title="Lead Explorer"
        subtitle="Search depth: 200 sites"
      />
      
      <div className="flex-1 flex overflow-hidden">
        {/* Left Rail */}
        <div className="w-[320px] shrink-0 border-r border-border bg-surface-2/30 flex flex-col overflow-y-auto hidden md:flex">
          <div className="p-4 border-b border-border space-y-4">
            <h3 className="font-bold text-sm">Lead Discovery</h3>
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider mb-1 block">Domain Idea</label>
                <div className="relative">
                  <select className="w-full bg-surface-2 border border-border rounded px-3 py-2 text-sm appearance-none focus:border-brand focus:outline-none">
                    <option>dallasdental.com</option>
                    <option>austindental.com</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-2.5 w-4 h-4 text-text-muted pointer-events-none" />
                </div>
              </div>
              <div>
                <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider mb-1 block">Keyword Niche</label>
                <input type="text" className="w-full bg-surface-2 border border-border rounded px-3 py-2 text-sm focus:border-brand focus:outline-none" defaultValue="Dentist, Dental Clinic" />
              </div>
              <div>
                <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider mb-1 block">City/State</label>
                <input type="text" className="w-full bg-surface-2 border border-border rounded px-3 py-2 text-sm focus:border-brand focus:outline-none" defaultValue="Dallas, TX" />
              </div>
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider block">Search Depth</label>
                  <span className="text-[11px] text-text-muted font-mono">200</span>
                </div>
                <input type="range" min="10" max="500" defaultValue="200" className="w-full accent-brand" />
              </div>
              <button className="w-full bg-brand text-bg font-bold rounded py-2 text-sm hover:bg-brand-hover transition-colors shadow-[0_0_12px_rgba(20,184,166,0.3)]">
                Start Discovery
              </button>
            </div>
          </div>
          
          <div className="flex-1 p-4">
            <h3 className="font-bold text-sm mb-3">Task History</h3>
            <div className="space-y-2">
              <div className="bg-surface border border-border rounded-lg p-3 relative overflow-hidden group">
                <div className="absolute top-0 left-0 h-[2px] bg-brand w-[45%] animate-pulse" />
                <div className="flex justify-between items-start mb-2">
                  <div className="font-bold text-sm">dallasdental.com</div>
                  <StatusBadge status="PROCESSING" />
                </div>
                <div className="text-[12px] text-text-muted mb-3">Keyword: Dentist...</div>
                <div className="flex gap-2">
                  <button className="flex items-center justify-center p-1.5 bg-surface-2 rounded text-text-muted hover:text-text transition-colors" title="Pause"><Pause className="w-3.5 h-3.5" /></button>
                  <button className="flex items-center justify-center p-1.5 bg-surface-2 rounded text-text-muted hover:text-danger transition-colors" title="Stop"><Square className="w-3.5 h-3.5" /></button>
                </div>
              </div>

              <div className="bg-surface border border-border rounded-lg p-3 hover:border-brand/50 transition-colors cursor-pointer">
                <div className="flex justify-between items-start mb-2">
                  <div className="font-bold text-sm">austinlegal.com</div>
                  <StatusBadge status="COMPLETED" />
                </div>
                <div className="text-[12px] text-text-muted">Keyword: Law Firm...</div>
              </div>
            </div>
          </div>
        </div>

        {/* Main */}
        <div className="flex-1 flex flex-col min-w-0 bg-bg">
          <div className="p-4 border-b border-border bg-surface/50 backdrop-blur-md sticky top-0 z-10 space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <MetricCard title="Total Prospects" value="1,248" />
              <MetricCard title="Validated Emails" value="892" />
              <MetricCard title="Avg Match Score" value="84%" trend="5%" trendUp={true} />
              <MetricCard title="High Priority" value="312" />
            </div>
            
            <div className="flex items-center gap-3 overflow-x-auto pb-1 scrollbar-none">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                <input type="text" placeholder="Search name, keyword..." className="bg-surface-2 border border-border rounded-full pl-9 pr-4 py-1.5 text-sm focus:border-brand focus:outline-none w-[200px]" />
              </div>
              
              <select className="bg-surface border border-border rounded-full px-4 py-1.5 text-sm appearance-none pr-8 bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2024%2024%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cpath%20d%3D%22M7%2010L12%2015L17%2010%22%20stroke%3D%22%23a8a29e%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%20fill%3D%22none%22%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[right_10px_center]">
                <option>Min Score: &gt;75</option>
                <option>Min Score: &gt;90</option>
                <option>All Scores</option>
              </select>

              <select className="bg-surface border border-border rounded-full px-4 py-1.5 text-sm appearance-none pr-8 bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2024%2024%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cpath%20d%3D%22M7%2010L12%2015L17%2010%22%20stroke%3D%22%23a8a29e%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%20fill%3D%22none%22%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[right_10px_center]">
                <option>Channel: Email</option>
                <option>Channel: WhatsApp</option>
              </select>
              
              <div className="h-6 w-[1px] bg-border mx-1"></div>
              
              <button className="px-4 py-1.5 text-sm font-bold bg-success text-bg rounded-full hover:bg-success/90 transition-colors shadow-[0_0_8px_rgba(16,185,129,0.3)] whitespace-nowrap">
                Verify Emails
              </button>
              <button className="px-4 py-1.5 text-sm font-bold bg-brand text-bg rounded-full hover:bg-brand-hover transition-colors shadow-[0_0_8px_rgba(20,184,166,0.3)] whitespace-nowrap">
                Export Data
              </button>
              <button className="px-4 py-1.5 text-sm font-bold bg-danger text-bg rounded-full hover:bg-danger/90 transition-colors shadow-[0_0_8px_rgba(244,63,94,0.3)] whitespace-nowrap">
                Create Campaign {selectedLeads.length > 0 ? `(${selectedLeads.length})` : ""}
              </button>
            </div>
          </div>
          
          <div className="flex-1 overflow-auto">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead className="bg-surface-2/50 text-[11px] uppercase tracking-wider text-text-muted sticky top-0 z-10 backdrop-blur border-b border-border">
                <tr>
                  <th className="px-4 py-3 font-bold w-10">
                    <input type="checkbox" className="rounded border-border bg-transparent accent-brand" />
                  </th>
                  <th className="px-4 py-3 font-bold">Business Details</th>
                  <th className="px-4 py-3 font-bold">Contact Info</th>
                  <th className="px-4 py-3 font-bold text-center">AI Scores</th>
                  <th className="px-4 py-3 font-bold w-64">CRM Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {leads.map((lead, i) => (
                  <tr key={lead.id} className="hover:bg-surface-2/30 transition-colors group" style={{ animationDelay: `${i * 24}ms` }}>
                    <td className="px-4 py-4 align-top">
                      <input 
                        type="checkbox" 
                        className="rounded border-border bg-transparent accent-brand mt-1" 
                        checked={selectedLeads.includes(lead.id)}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedLeads([...selectedLeads, lead.id]);
                          else setSelectedLeads(selectedLeads.filter(id => id !== lead.id));
                        }}
                      />
                    </td>
                    <td className="px-4 py-4 align-top max-w-[240px]">
                      <div className="font-bold text-[14px] flex items-center gap-2 mb-1">
                        {lead.name}
                        {lead.dmScore >= 85 && <span className="text-[9px] uppercase font-bold bg-copper/10 text-copper px-1.5 rounded">CEO</span>}
                        <span className="text-[9px] font-bold bg-info/10 text-info px-1.5 rounded lowercase tracking-wider border border-info/20">in</span>
                      </div>
                      <a href="#" className="text-[12px] text-text-muted hover:text-brand flex items-center gap-1 mb-1">
                        <Building2 className="w-3 h-3" /> {lead.website}
                      </a>
                      <div className="text-[12px] text-text-muted flex items-center gap-1">
                        <MapPin className="w-3 h-3" /> {lead.location}
                      </div>
                    </td>
                    <td className="px-4 py-4 align-top min-w-[200px]">
                      <div className="mb-2">
                        <span className="text-[10px] uppercase tracking-wider text-text-muted font-bold block mb-1">Email First</span>
                        {lead.emails.map((e, idx) => (
                          <div key={idx} className="flex items-center gap-2 text-[13px] mb-1">
                            <Mail className="w-3.5 h-3.5 text-text-muted" />
                            <a href={`mailto:${e.addr}`} className="font-medium hover:text-brand truncate max-w-[150px]">{e.addr}</a>
                            <span className={cn(
                              "text-[9px] font-bold px-1.5 rounded",
                              e.status === "VALID" ? "bg-success/10 text-success" : "bg-copper/10 text-copper"
                            )}>{e.status}</span>
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center gap-2 text-[13px] text-text-muted">
                        <Phone className="w-3.5 h-3.5" />
                        <span>{lead.phone}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <div className="flex items-center justify-center gap-6">
                        <div className="flex flex-col items-center gap-1">
                          <ScoreRing score={lead.priority} size="lg" />
                          <span className="text-[10px] uppercase font-bold tracking-wider text-text-muted mt-1">Priority</span>
                        </div>
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center justify-between text-[11px] gap-3">
                            <span className="text-text-muted font-bold uppercase">Match</span>
                            <span className="font-mono text-brand font-bold">{lead.match}</span>
                          </div>
                          <div className="flex items-center justify-between text-[11px] gap-3">
                            <span className="text-text-muted font-bold uppercase">Intent</span>
                            <span className="font-mono font-bold text-copper">{lead.intent}</span>
                          </div>
                          <div className="flex items-center justify-between text-[11px] gap-3">
                            <span className="text-text-muted font-bold uppercase">DM</span>
                            <span className="font-mono font-bold text-success">{lead.dmScore}</span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <div className="relative group/note">
                        <textarea 
                          className="w-full h-[60px] bg-surface-2/50 border border-transparent rounded p-2 text-[13px] text-text placeholder:text-text-faint resize-none focus:border-brand focus:bg-bg focus:outline-none transition-colors group-hover/note:border-border"
                          placeholder="Add CRM note..."
                          defaultValue={lead.note}
                        />
                        <div className="absolute top-2 right-2 opacity-0 group-focus-within/note:opacity-100 transition-opacity">
                          <kbd className="text-[10px] font-mono text-text-muted bg-surface border border-border px-1 rounded shadow-sm">Esc to save</kbd>
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          <div className="p-3 border-t border-border bg-surface-2/50 flex justify-between items-center text-sm">
            <span className="text-text-muted font-medium">Page 1 of 62</span>
            <div className="flex gap-2">
              <button className="px-3 py-1 bg-surface border border-border rounded hover:bg-surface-2">Previous</button>
              <button className="px-3 py-1 bg-surface border border-border rounded hover:bg-surface-2">Next</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
