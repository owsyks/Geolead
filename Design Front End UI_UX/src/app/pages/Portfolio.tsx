import { Header } from "../components/layout";
import { GlassCard, MetricCard, ScoreRing, StatusBadge } from "../components/ui";
import { Plus, Upload, Download, MoreHorizontal, Edit2, Archive, DollarSign } from "lucide-react";

const domains = [
  { id: 1, name: "dallasdental.com", status: "Prospecting", purchase: "2024-01-12", price: "$2,400", expires: "2025-01-12", niche: "Dentist", brandScore: 92, value: "$12,500", demand: "High", tags: ["Premium", "Texas"] },
  { id: 2, name: "austinlegal.com", status: "Contacting Buyers", purchase: "2023-11-05", price: "$1,800", expires: "2024-11-05", niche: "Lawyer", brandScore: 88, value: "$9,000", demand: "Medium", tags: ["Law", "Texas"] },
  { id: 3, name: "miamiplumbers.com", status: "Negotiating", purchase: "2024-03-22", price: "$900", expires: "2025-03-22", niche: "Plumber", brandScore: 75, value: "$5,000", demand: "Low", tags: ["Trades"] },
  { id: 4, name: "seattlehvac.com", status: "Sold", purchase: "2023-08-14", price: "$1,200", expires: "2024-08-14", niche: "HVAC", brandScore: 82, value: "$6,500", demand: "Sold", tags: ["Trades", "Sold"] },
];

export default function Portfolio() {
  return (
    <>
      <Header
        eyebrow="Asset Management"
        title="Domain Portfolio"
      />
      <div className="p-8 space-y-6">
        <div className="flex justify-between items-center">
          <div className="flex gap-4 items-center">
            <MetricCard title="Total Domains" value="4" />
            <MetricCard title="Portfolio Value" value="$33,000" trend="12%" trendUp={true} />
            <MetricCard title="Total Investment" value="$6,300" />
            <MetricCard title="ROI" value="423%" trend="24%" trendUp={true} />
          </div>
          <div className="flex flex-col gap-2">
            <button className="flex items-center gap-2 px-4 py-2 bg-brand text-bg font-bold rounded-lg hover:bg-brand-hover shadow-[0_0_12px_rgba(20,184,166,0.2)]">
              <Plus className="w-4 h-4" /> Add Domain
            </button>
            <div className="flex gap-2">
              <button className="flex-1 flex items-center justify-center gap-2 px-3 py-1.5 bg-surface border border-border text-sm font-medium rounded hover:bg-surface-2">
                <Upload className="w-3.5 h-3.5" /> Import
              </button>
              <button className="flex-1 flex items-center justify-center gap-2 px-3 py-1.5 bg-surface border border-border text-sm font-medium rounded hover:bg-surface-2">
                <Download className="w-3.5 h-3.5" /> Export
              </button>
            </div>
          </div>
        </div>

        <GlassCard className="p-0 overflow-hidden">
          <div className="p-4 border-b border-border flex gap-4 bg-surface-2/50 backdrop-blur-md sticky top-0 z-10">
            <input type="text" placeholder="Search domains, tags..." className="bg-bg border border-border rounded px-3 py-1.5 text-sm focus:border-brand focus:outline-none w-[240px]" />
            <select className="bg-bg border border-border rounded px-3 py-1.5 text-sm focus:border-brand focus:outline-none w-[160px]">
              <option>Status: All</option>
              <option>Status: Prospecting</option>
            </select>
            <select className="bg-bg border border-border rounded px-3 py-1.5 text-sm focus:border-brand focus:outline-none w-[160px]">
              <option>Sort: Value (High to Low)</option>
              <option>Sort: Name</option>
            </select>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead className="bg-surface-2/30 text-[11px] uppercase tracking-wider text-text-muted">
                <tr>
                  <th className="px-4 py-3 font-bold">Domain</th>
                  <th className="px-4 py-3 font-bold">Status</th>
                  <th className="px-4 py-3 font-bold">Investment</th>
                  <th className="px-4 py-3 font-bold">Category</th>
                  <th className="px-4 py-3 font-bold text-center">Brand Score</th>
                  <th className="px-4 py-3 font-bold text-right">Est. Value</th>
                  <th className="px-4 py-3 font-bold">Tags</th>
                  <th className="px-4 py-3 font-bold text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {domains.map(d => (
                  <tr key={d.id} className="hover:bg-surface-2/30 transition-colors group">
                    <td className="px-4 py-3 font-bold text-[15px]">{d.name}</td>
                    <td className="px-4 py-3"><StatusBadge status={d.status} /></td>
                    <td className="px-4 py-3">
                      <div className="font-mono">{d.price}</div>
                      <div className="text-[11px] text-text-muted">{d.purchase}</div>
                    </td>
                    <td className="px-4 py-3 text-text-muted">{d.niche}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-center">
                        <ScoreRing score={d.brandScore} size="sm" />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="font-mono font-bold text-brand">{d.value}</div>
                      <div className="text-[11px] text-text-muted">{d.demand} Demand</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 flex-wrap">
                        {d.tags.map(t => (
                          <span key={t} className="px-1.5 py-0.5 bg-surface border border-border text-[10px] rounded text-text-muted">{t}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button className="p-1.5 bg-surface border border-border rounded text-text-muted hover:text-text hover:border-brand"><Edit2 className="w-3.5 h-3.5" /></button>
                        <button className="p-1.5 bg-surface border border-border rounded text-text-muted hover:text-success hover:border-success"><DollarSign className="w-3.5 h-3.5" /></button>
                        <button className="p-1.5 bg-surface border border-border rounded text-text-muted hover:text-danger hover:border-danger"><Archive className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>
      </div>
    </>
  );
}
