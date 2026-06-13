"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Eye,
  Gauge,
  Loader2,
  Pause,
  Play,
  Plus,
  RefreshCcw,
  Send,
  Sparkles,
  Trash2,
  TrendingUp,
  Upload,
  X,
  XCircle,
  Zap,
} from "lucide-react";
import { EmptyState, OutboundShell } from "@/components/OutboundShell";
import { GlassCard, KanbanColumn, StatusBadge } from "@/components/ui";
import { DomainSelector } from "@/components/DomainSelector";
import { useDomainContext } from "@/lib/domainContext";
import {
  fetchOutbound,
  type CampaignStatus,
  type OutboundCampaignSummary,
  type OutboundOverview,
} from "@/lib/outbound";

type SendQuota = {
  senderCount: number;
  dailyLimit: number;
  hourlyLimit: number;
  sentToday: number;
  sentThisHour: number;
  dailyRemaining: number;
  hourlyRemaining: number;
  resetsAt: string;
};

interface AvailableLead {
  id: string;
  businessName: string;
  location?: string;
  category?: string;
  domainMatchScore: number;
  emails: Array<{ email: string; status: string }>;
}

const INPUT = "mt-2 h-10 w-full rounded-lg border border-border bg-bg px-3 text-sm text-text outline-none focus:border-brand transition-colors";
const LABEL = "block text-[11px] font-bold uppercase tracking-wider text-text-muted";

const demoCampaigns: OutboundCampaignSummary[] = [
  {
    id: "demo-campaign",
    name: "Texas car-domain buyers",
    objective: "Convert verified dealership leads into domain buyers",
    geoDomain: "TexasCarVendor.com",
    niche: "used auto dealers",
    cityState: "Texas",
    tone: "professional",
    language: "en",
    status: "ACTIVE",
    dailyLimit: 35,
    createdAt: "2026-05-22T10:00:00.000Z",
    updatedAt: "2026-05-23T10:00:00.000Z",
    recipients: 82,
    sent: 55,
    delivered: 53,
    opens: 26,
    clicks: 7,
    replies: 4,
    positiveReplies: 2,
    negativeReplies: 1,
    bounces: 1,
    unsubscribes: 0,
    openRate: 47.2,
    clickRate: 12.7,
    replyRate: 7.2,
    bounceRate: 1.8,
    unsubscribeRate: 0,
    engagementScore: 72,
  },
];

const statusColumns: CampaignStatus[] = ["DRAFT", "ACTIVE", "PAUSED", "COMPLETED"];

const THROTTLE_PRESETS: Record<string, { label: string; delayMin: number; delayMax: number }> = {
  "instant": { label: "⚡ Instant send (all now, no delay)", delayMin: 0, delayMax: 0 },
  "1per1min": { label: "1 email per 1 min (fastest)", delayMin: 1, delayMax: 1 },
  "1per5min": { label: "1 email per 5 min", delayMin: 5, delayMax: 5 },
  "5per5min": { label: "5 emails per 5 min (~1/min)", delayMin: 1, delayMax: 1 },
  "10per5min": { label: "10 emails per 5 min (~30s)", delayMin: 1, delayMax: 1 },
  "1per10min": { label: "1 email per 10 min", delayMin: 10, delayMax: 10 },
  "1per30min": { label: "1 email per 30 min (safest)", delayMin: 30, delayMax: 30 },
  "1perhour": { label: "1 email per hour", delayMin: 60, delayMax: 60 },
  "custom": { label: "Custom interval", delayMin: 5, delayMax: 30 },
};

export default function CampaignsPage() {
  const { activeDomain, activeDomainId } = useDomainContext();
  const [campaigns, setCampaigns] = useState<OutboundCampaignSummary[]>(demoCampaigns);
  const [overview, setOverview] = useState<OutboundOverview | null>(null);
  const [leads, setLeads] = useState<AvailableLead[]>([]);
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [templates, setTemplates] = useState<Array<{ id: string; name: string; subject: string }>>([]);
  const [uploadedEmails, setUploadedEmails] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [leadsScopedToDomain, setLeadsScopedToDomain] = useState(true);
  const [message, setMessage] = useState("");
  const [variantsFor, setVariantsFor] = useState<{ id: string; name: string } | null>(null);
  const [eventsFor, setEventsFor] = useState<{ id: string; name: string } | null>(null);
  const [quota, setQuota] = useState<SendQuota | null>(null);
  const [form, setForm] = useState({
    name: "Geo-domain buyer outreach",
    geoDomain: "TexasCarVendor.com",
    niche: "used auto dealers",
    cityState: "Texas",
    objective: "Convert verified geo-domain leads into interested buyers",
    tone: "professional",
    language: "en",
    dailyLimit: "30",
    status: "DRAFT",
    templateId: "",
    senderAccountId: "",
    throttlePreset: "5per5min",
    smartDelayMin: "1",
    smartDelayMax: "1",
  });

  useEffect(() => {
    const senders = overview?.senders || [];
    if (senders.length === 0) return;
    setForm((current) => {
      if (current.senderAccountId && senders.some((s) => s.id === current.senderAccountId)) return current;
      const preferred =
        senders.find((s) => s.provider === "RESEND" && s.status === "active") ||
        senders.find((s) => s.provider !== "DRY_RUN" && s.status === "active") ||
        senders[0];
      return preferred ? { ...current, senderAccountId: preferred.id } : current;
    });
  }, [overview]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [campaignData, overviewData, templateData] = await Promise.all([
        fetchOutbound<OutboundCampaignSummary[]>("/api/outbound/campaigns"),
        fetchOutbound<OutboundOverview>("/api/outbound/overview"),
        fetchOutbound<Array<{ id: string; name: string; subject: string }>>("/api/outbound/templates"),
      ]);
      setCampaigns(campaignData);
      setOverview(overviewData);
      setTemplates(templateData);
      setMessage("");
      void fetchOutbound<SendQuota>("/api/outbound/quota").then(setQuota).catch(() => setQuota(null));
    } catch {
      setCampaigns(demoCampaigns);
      setMessage("Backend offline. Showing demo campaign data.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadLeadsForDomain = useCallback(async (domain: string, scoped: boolean) => {
    setLeadsLoading(true);
    try {
      const params = new URLSearchParams({ hasEmails: "true", limit: "50", page: "1" });
      if (scoped && domain.trim()) params.set("domain", domain.trim());
      const res = await fetchOutbound<{ leads: AvailableLead[] }>(`/api/leads?${params.toString()}`);
      setLeads(res.leads);
    } catch {
      /* keep existing list on failure */
    } finally {
      setLeadsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (loading) return;
    const handle = setTimeout(() => void loadLeadsForDomain(form.geoDomain, leadsScopedToDomain), 400);
    return () => clearTimeout(handle);
  }, [form.geoDomain, leadsScopedToDomain, loading, loadLeadsForDomain]);

  useEffect(() => {
    let active = true;
    const bootstrap = async () => {
      try {
        const [campaignData, overviewData, leadData, templateData] = await Promise.all([
          fetchOutbound<OutboundCampaignSummary[]>("/api/outbound/campaigns"),
          fetchOutbound<OutboundOverview>("/api/outbound/overview"),
          fetchOutbound<{ leads: AvailableLead[] }>("/api/leads?hasEmails=true&limit=12&page=1"),
          fetchOutbound<Array<{ id: string; name: string; subject: string }>>("/api/outbound/templates"),
        ]);
        if (!active) return;
        setCampaigns(campaignData);
        setOverview(overviewData);
        setLeads(leadData.leads);
        setTemplates(templateData);
      } catch {
        if (!active) return;
        setCampaigns(demoCampaigns);
        setMessage("Backend offline. Showing demo campaign data.");
      } finally {
        if (active) setLoading(false);
      }
    };
    void bootstrap();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    const refreshQuota = () =>
      fetchOutbound<SendQuota>("/api/outbound/quota")
        .then((q) => { if (active) setQuota(q); })
        .catch(() => {});
    void refreshQuota();
    const id = setInterval(refreshQuota, 30000);
    return () => { active = false; clearInterval(id); };
  }, []);

  useEffect(() => {
    if (!activeDomain) return;
    setForm((current) => ({
      ...current,
      name: current.name === "Geo-domain buyer outreach"
        ? `${activeDomain.name.replace(/\.[a-z]+$/i, "")} Outreach`
        : current.name,
      geoDomain: activeDomain.name,
      niche: activeDomain.niche || activeDomain.industry || current.niche,
      cityState: [activeDomain.city, activeDomain.state].filter(Boolean).join(", ") || current.cityState,
      objective: activeDomain.outreachStrategy || current.objective,
    }));
  }, [activeDomain]);

  const createCampaign = async () => {
    setMessage("");
    try {
      const preset = THROTTLE_PRESETS[form.throttlePreset] || THROTTLE_PRESETS["5per5min"];
      const delayMin = form.throttlePreset === "custom" ? Number(form.smartDelayMin) : preset.delayMin;
      const delayMax = form.throttlePreset === "custom" ? Number(form.smartDelayMax) : preset.delayMax;
      const instant = form.throttlePreset === "instant";
      await fetchOutbound("/api/outbound/campaigns", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          domainId: activeDomainId || undefined,
          dailyLimit: Number(form.dailyLimit) || 30,
          smartDelayMin: delayMin,
          smartDelayMax: delayMax,
          instant,
          senderAccountId: form.senderAccountId || undefined,
          leadIds: selectedLeadIds,
          uploadedEmails: uploadedEmails.length > 0 ? uploadedEmails : undefined,
          templateId: form.templateId || undefined,
        }),
      });
      setMessage(
        instant
          ? "Campaign created in Instant mode (24/7 window, no delay). Set it ACTIVE and Queue to send right away."
          : "Campaign created with a compliant 3-step sequence."
      );
      setSelectedLeadIds([]);
      setUploadedEmails([]);
      setLoading(true);
      await load();
    } catch {
      setMessage("Campaign create failed because the backend is offline.");
    }
  };

  const updateStatus = async (campaignId: string, status: string) => {
    setMessage("");
    try {
      await fetchOutbound(`/api/outbound/campaigns/${campaignId}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
      setLoading(true);
      await load();
    } catch {
      setMessage("Status update failed because the backend is offline.");
    }
  };

  const queueCampaign = async (campaignId: string) => {
    setMessage("");
    try {
      const result = await fetchOutbound<{ queued: number }>(`/api/outbound/campaigns/${campaignId}/queue`, { method: "POST" });
      setMessage(`${result.queued} email(s) queued with sender limits and suppression checks.`);
      setLoading(true);
      await load();
    } catch {
      setMessage("Queue action failed because the backend is offline.");
    }
  };

  const forceSendCampaign = async (campaignId: string, name: string) => {
    if (!confirm(`Force-send "${name}"? This bypasses daily limits and send windows. Use sparingly.`)) return;
    setMessage("");
    try {
      const result = await fetchOutbound<{ forceSent: number; total: number }>(`/api/outbound/campaigns/${campaignId}/force-send`, { method: "POST" });
      setMessage(`Force-sent ${result.forceSent} of ${result.total} queued emails.`);
      setLoading(true);
      await load();
    } catch {
      setMessage("Force-send failed because the backend is offline.");
    }
  };

  const deleteCampaign = async (campaignId: string, name: string) => {
    if (campaignId === "demo-campaign") {
      setMessage("That's the demo card — create a real campaign to manage it.");
      return;
    }
    if (!confirm(`Delete campaign "${name}"? This removes its sends, replies, and history. This cannot be undone.`)) return;
    setMessage("");
    try {
      await fetchOutbound(`/api/outbound/campaigns/${campaignId}`, { method: "DELETE" });
      setMessage(`Deleted "${name}".`);
      setLoading(true);
      await load();
    } catch {
      setMessage("Delete failed because the backend is offline.");
    }
  };

  const toggleLead = (id: string) => {
    setSelectedLeadIds((current) => (current.includes(id) ? current.filter((leadId) => leadId !== id) : [...current, id]));
  };

  const allLeadsSelected = leads.length > 0 && leads.every((lead) => selectedLeadIds.includes(lead.id));
  const toggleSelectAll = () => {
    setSelectedLeadIds((current) => {
      if (allLeadsSelected) {
        const ids = new Set(leads.map((l) => l.id));
        return current.filter((id) => !ids.has(id));
      }
      const merged = new Set(current);
      leads.forEach((l) => merged.add(l.id));
      return Array.from(merged);
    });
  };

  const handleCSVUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const emailRe = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const found = new Set<string>();
    try {
      const isExcel = /\.(xlsx|xls)$/i.test(file.name);
      if (isExcel) {
        const XLSX = await import("xlsx");
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        for (const sheetName of wb.SheetNames) {
          const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], { header: 1, raw: false });
          for (const row of rows) {
            for (const cell of row as unknown[]) {
              const matches = String(cell ?? "").match(emailRe);
              if (matches) matches.forEach((m) => found.add(m.toLowerCase()));
            }
          }
        }
      } else {
        const text = await file.text();
        const matches = text.match(emailRe);
        if (matches) matches.forEach((m) => found.add(m.toLowerCase()));
      }
      const emails = Array.from(found);
      setUploadedEmails(emails);
      setMessage(
        emails.length > 0
          ? `Loaded ${emails.length} email(s) from ${file.name}`
          : `No email addresses found in ${file.name}. Make sure a column contains email addresses.`
      );
    } catch {
      setMessage(`Could not read ${file.name}. Use a .csv, .txt, or .xlsx file with email addresses.`);
    }
  };

  const iconBtn = "p-1.5 bg-surface border border-border rounded text-text-muted transition-colors inline-flex items-center justify-center";

  const renderActions = (campaign: OutboundCampaignSummary) => {
    if (campaign.status === "DRAFT") {
      return (
        <div className="mt-3 flex gap-2">
          <button onClick={() => void updateStatus(campaign.id, "ACTIVE")} className="flex-1 py-1.5 bg-brand/10 text-brand text-[12px] font-bold rounded border border-brand/20 hover:bg-brand hover:text-bg transition-colors">
            Launch Campaign
          </button>
          <button onClick={() => void deleteCampaign(campaign.id, campaign.name)} title="Delete" className={`${iconBtn} hover:text-danger hover:border-danger`}><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      );
    }
    if (campaign.status === "COMPLETED") {
      return (
        <div className="mt-3 flex gap-1.5">
          <button onClick={() => setEventsFor({ id: campaign.id, name: campaign.name })} title="Events" className={`${iconBtn} hover:text-success hover:border-success`}><Eye className="w-3.5 h-3.5" /></button>
          <button onClick={() => void deleteCampaign(campaign.id, campaign.name)} title="Delete" className={`${iconBtn} hover:text-danger hover:border-danger ml-auto`}><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      );
    }
    // ACTIVE or PAUSED
    return (
      <div className="mt-3 flex flex-wrap gap-1.5">
        {campaign.status === "ACTIVE" ? (
          <button onClick={() => void updateStatus(campaign.id, "PAUSED")} title="Pause" className={`${iconBtn} hover:text-copper hover:border-copper`}><Pause className="w-3.5 h-3.5" /></button>
        ) : (
          <button onClick={() => void updateStatus(campaign.id, "ACTIVE")} title="Resume" className={`${iconBtn} hover:text-success hover:border-success`}><Play className="w-3.5 h-3.5" /></button>
        )}
        <button onClick={() => void queueCampaign(campaign.id)} title="Queue" className={`${iconBtn} hover:text-text hover:border-border`}><Send className="w-3.5 h-3.5" /></button>
        <button onClick={() => forceSendCampaign(campaign.id, campaign.name)} title="Force-send (bypass limits)" className={`${iconBtn} hover:text-danger hover:border-danger`}><Zap className="w-3.5 h-3.5" /></button>
        <button onClick={() => setVariantsFor({ id: campaign.id, name: campaign.name })} title="AI variants" className={`${iconBtn} hover:text-copper hover:border-copper`}><Sparkles className="w-3.5 h-3.5" /></button>
        <button onClick={() => setEventsFor({ id: campaign.id, name: campaign.name })} title="Events" className={`${iconBtn} hover:text-info hover:border-info`}><Eye className="w-3.5 h-3.5" /></button>
        <button onClick={() => void deleteCampaign(campaign.id, campaign.name)} title="Delete" className={`${iconBtn} hover:text-danger hover:border-danger ml-auto`}><Trash2 className="w-3.5 h-3.5" /></button>
      </div>
    );
  };

  return (
    <OutboundShell
      title="Campaigns"
      eyebrow="Outreach Engine"
      fullBleed
      actions={
        <>
          {quota && quota.senderCount > 0 ? (
            <button
              onClick={() => void fetchOutbound<SendQuota>("/api/outbound/quota").then(setQuota).catch(() => {})}
              title={`${quota.sentToday}/${quota.dailyLimit} sent today across ${quota.senderCount} sender${quota.senderCount > 1 ? "s" : ""} · ${quota.hourlyRemaining} left this hour`}
              className={`h-9 px-3 rounded-lg border text-sm inline-flex items-center gap-2 transition-colors ${
                quota.dailyRemaining === 0
                  ? "border-danger/40 bg-danger/10 text-danger"
                  : quota.dailyRemaining <= 10
                    ? "border-copper/40 bg-copper/10 text-copper"
                    : "border-success/30 bg-success/10 text-success"
              }`}
            >
              <Gauge className="h-4 w-4" />
              {quota.dailyRemaining}/{quota.dailyLimit} left today
            </button>
          ) : quota ? (
            <span title="Add a sender in Senders to start sending" className="h-9 px-3 rounded-lg border border-copper/40 bg-copper/10 text-sm text-copper inline-flex items-center gap-2">
              <Gauge className="h-4 w-4" /> No sender configured
            </span>
          ) : null}
          <button
            onClick={() => { setLoading(true); setMessage(""); void load(); }}
            className="h-9 w-9 rounded-lg border border-border bg-surface text-text-muted hover:text-text hover:bg-surface-2 inline-flex items-center justify-center transition-colors"
            title="Refresh"
          >
            <RefreshCcw className="h-4 w-4" />
          </button>
        </>
      }
    >
      <div className="flex flex-col h-full">
        {message ? (
          <div className="shrink-0 mx-6 mt-3 rounded-lg border border-border bg-surface-2 px-4 py-2.5 text-sm text-text-muted">{message}</div>
        ) : null}

        <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
          {/* Create form — full width on mobile, 400px on desktop */}
          <form
            className="w-full lg:w-[400px] lg:min-w-[400px] shrink-0 border-b lg:border-b-0 lg:border-r border-border bg-surface-2/30 overflow-y-auto p-4 lg:p-6 space-y-5"
            onSubmit={(event) => { event.preventDefault(); void createCampaign(); }}
          >
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-brand" />
              <h2 className="font-black text-lg text-text">New Campaign</h2>
            </div>

            <div>
              <DomainSelector label="Source domain (from portfolio)" emptyAction={{ label: "Add to portfolio", href: "/portfolio" }} />
              {activeDomain ? (
                <p className="mt-2 text-[11px] text-success">
                  Niche, geo, and objective auto-fill from {activeDomain.name}. The campaign links to this domain.
                </p>
              ) : null}
            </div>

            <div className="grid grid-cols-1 gap-4">
              {([["name", "Campaign name"], ["geoDomain", "Geo domain"], ["niche", "Niche/category"], ["cityState", "City/state"]] as const).map(([field, label]) => (
                <label key={field} className={LABEL}>
                  {label}
                  <input value={form[field]} onChange={(e) => setForm((c) => ({ ...c, [field]: e.target.value }))} className={INPUT} />
                </label>
              ))}
              <label className={LABEL}>
                Tone
                <select value={form.tone} onChange={(e) => setForm((c) => ({ ...c, tone: e.target.value }))} className={INPUT}>
                  <option value="professional">Professional</option>
                  <option value="friendly">Friendly</option>
                  <option value="persuasive">Persuasive</option>
                </select>
              </label>
            </div>

            <label className={LABEL}>
              Objective
              <textarea value={form.objective} onChange={(e) => setForm((c) => ({ ...c, objective: e.target.value }))} className="mt-2 h-20 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-brand resize-none" />
            </label>

            <div className="p-4 rounded-lg border border-border bg-bg/40 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-[11px] font-black uppercase tracking-wide text-text-muted">Sending Throttle</h3>
                <span className="text-[10px] text-text-faint">Controls send pace</span>
              </div>
              <label className={LABEL}>
                Sending Speed
                <select value={form.throttlePreset} onChange={(e) => setForm((c) => ({ ...c, throttlePreset: e.target.value }))} className={INPUT}>
                  {Object.entries(THROTTLE_PRESETS).map(([key, preset]) => (<option key={key} value={key}>{preset.label}</option>))}
                </select>
              </label>
              {form.throttlePreset === "custom" && (
                <div className="grid grid-cols-2 gap-2">
                  <label className={LABEL}>Min Min Between
                    <input type="number" min={1} max={1440} value={form.smartDelayMin} onChange={(e) => setForm((c) => ({ ...c, smartDelayMin: e.target.value }))} className={INPUT} />
                  </label>
                  <label className={LABEL}>Max Min Between
                    <input type="number" min={1} max={1440} value={form.smartDelayMax} onChange={(e) => setForm((c) => ({ ...c, smartDelayMax: e.target.value }))} className={INPUT} />
                  </label>
                </div>
              )}
              <label className={LABEL}>
                Max Per Day
                <input type="number" min={1} max={1000} value={form.dailyLimit} onChange={(e) => setForm((c) => ({ ...c, dailyLimit: e.target.value }))} className={INPUT} />
              </label>
              <p className="text-[10px] text-text-faint leading-relaxed">
                {form.throttlePreset === "custom"
                  ? `Sends 1 email every ${form.smartDelayMin}-${form.smartDelayMax} minutes, up to ${form.dailyLimit}/day.`
                  : `${THROTTLE_PRESETS[form.throttlePreset]?.label}, capped at ${form.dailyLimit}/day.`}
              </p>
            </div>

            <label className={LABEL}>
              Send from (email account)
              <select value={form.senderAccountId} onChange={(e) => setForm((c) => ({ ...c, senderAccountId: e.target.value }))} className={INPUT}>
                {(overview?.senders || []).length === 0 ? <option value="">No senders — add one in Senders</option> : null}
                {(overview?.senders || []).map((s) => (
                  <option key={s.id} value={s.id}>{s.provider === "DRY_RUN" ? "🧪 " : "📧 "}{s.fromEmail} ({s.provider}{s.status !== "active" ? ` · ${s.status}` : ""})</option>
                ))}
              </select>
              <span className="mt-1 block text-[11px] font-normal normal-case text-text-faint">Real delivery uses a configured provider (e.g. Resend). 🧪 Dry-run only simulates sends.</span>
            </label>

            <label className={LABEL}>
              Email Template (optional)
              <select value={form.templateId} onChange={(e) => setForm((c) => ({ ...c, templateId: e.target.value }))} className={INPUT}>
                <option value="">Generate with AI</option>
                {templates.map((t) => (<option key={t.id} value={t.id}>{t.name} — {t.subject}</option>))}
              </select>
            </label>

            <div>
              <label className={`${LABEL} mb-2`}>Upload Email List (CSV)</label>
              <div className="flex items-center gap-2">
                <label className="flex-1 h-10 px-3 rounded-lg border border-border bg-bg text-sm text-text-muted flex items-center gap-2 cursor-pointer hover:border-brand transition-colors">
                  <Upload className="w-4 h-4" />
                  <span className="text-xs">{uploadedEmails.length > 0 ? `${uploadedEmails.length} emails loaded` : "Choose CSV / Excel file"}</span>
                  <input type="file" accept=".csv,.txt,.xlsx,.xls" onChange={handleCSVUpload} className="hidden" />
                </label>
                {uploadedEmails.length > 0 && (
                  <button type="button" onClick={() => setUploadedEmails([])} className="px-3 h-10 text-xs text-text-muted hover:text-text rounded-lg border border-border hover:bg-surface-2">Clear</button>
                )}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-[11px] font-black uppercase tracking-wide text-text-muted">Select leads</h3>
                <span className="text-xs text-text-muted">{selectedLeadIds.length} selected</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setLeadsScopedToDomain((v) => !v)}
                  className={`h-8 px-2.5 rounded-lg text-[11px] font-bold border inline-flex items-center gap-1.5 ${leadsScopedToDomain ? "border-brand/30 bg-brand-soft text-brand" : "border-border text-text-muted"}`}
                  title="Show only valid leads scraped for this domain"
                >
                  {leadsScopedToDomain ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                  {leadsScopedToDomain ? `Scraped for ${form.geoDomain || "this domain"}` : "All my leads"}
                </button>
                <button type="button" onClick={() => void loadLeadsForDomain(form.geoDomain, leadsScopedToDomain)} className="h-8 w-8 rounded-lg border border-border text-text-muted hover:text-text inline-flex items-center justify-center" title="Refresh leads">
                  {leadsLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
                </button>
                {leads.length > 0 && (
                  <button type="button" onClick={toggleSelectAll} className="h-8 px-2.5 rounded-lg border border-border text-[11px] font-bold text-text-muted hover:text-text ml-auto">
                    {allLeadsSelected ? "Clear all" : `Select all (${leads.length})`}
                  </button>
                )}
              </div>

              <div className="mt-3 max-h-72 overflow-y-auto space-y-2 pr-1">
                {leadsLoading ? (
                  <div className="py-8 flex items-center justify-center gap-2 text-xs text-text-muted"><Loader2 className="h-4 w-4 animate-spin" /> Loading leads…</div>
                ) : leads.length === 0 ? (
                  <EmptyState
                    title={leadsScopedToDomain ? `No valid leads for ${form.geoDomain || "this domain"}` : "No verified leads loaded"}
                    body={leadsScopedToDomain ? "Run the Lead Explorer for this domain first, or switch to All my leads." : "Run the lead explorer first, or create the campaign without assigned leads."}
                  />
                ) : (
                  leads.map((lead) => (
                    <label key={lead.id} className="flex gap-3 rounded-lg border border-border bg-bg p-3 text-sm">
                      <input type="checkbox" checked={selectedLeadIds.includes(lead.id)} onChange={() => toggleLead(lead.id)} className="mt-1 h-4 w-4 accent-brand" />
                      <span className="min-w-0 flex-1">
                        <span className="block font-bold text-text truncate">{lead.businessName}</span>
                        <span className="mt-1 block text-xs text-text-muted">
                          {lead.location || lead.category || "Verified lead"} · {lead.domainMatchScore}% match
                          {lead.emails.length > 0 ? ` · ${lead.emails.length} email${lead.emails.length > 1 ? "s" : ""}` : ""}
                        </span>
                      </span>
                    </label>
                  ))
                )}
              </div>
            </div>

            <button className="h-11 w-full rounded-lg bg-brand text-sm font-black text-bg hover:bg-brand-hover inline-flex items-center justify-center gap-2 shadow-[0_0_12px_rgba(20,184,166,0.3)] transition-colors">
              <Plus className="h-4 w-4" /> Create campaign
            </button>
          </form>

          {/* Kanban board */}
          <div className="flex-1 overflow-x-auto p-6 bg-bg flex gap-6">
            {statusColumns.map((status) => {
              const columnCampaigns = campaigns.filter((campaign) => campaign.status === status);
              return (
                <KanbanColumn key={status} title={status} count={columnCampaigns.length}>
                  {columnCampaigns.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border p-4 text-xs text-text-muted">No campaigns</div>
                  ) : (
                    columnCampaigns.map((campaign) => (
                      <GlassCard key={campaign.id} className="p-4 flex flex-col gap-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h4 className="text-[15px] font-bold text-text truncate leading-tight">{campaign.name}</h4>
                            <p className="mt-1 text-[12px] text-text-muted truncate">{campaign.geoDomain}</p>
                          </div>
                          <span className="text-xs font-mono font-bold text-success shrink-0">{campaign.engagementScore}</span>
                        </div>

                        {campaign.status !== "DRAFT" && (
                          <div className="grid grid-cols-3 gap-2 py-2 border-y border-border/50 text-center">
                            <div>
                              <div className="text-[10px] text-text-muted uppercase font-bold">Sent</div>
                              <div className="font-mono text-sm font-bold">{campaign.sent}</div>
                            </div>
                            <div>
                              <div className="text-[10px] text-text-muted uppercase font-bold">Open</div>
                              <div className="font-mono text-sm font-bold text-success">{campaign.opens}</div>
                            </div>
                            <div>
                              <div className="text-[10px] text-text-muted uppercase font-bold">Reply</div>
                              <div className="font-mono text-sm font-bold text-brand">{campaign.replies}</div>
                            </div>
                          </div>
                        )}

                        {campaign.status !== "DRAFT" && (
                          <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                            <div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(campaign.engagementScore, 100)}%` }} />
                          </div>
                        )}

                        {campaign.nextFollowUpAt && (
                          <div className="text-[11px] font-bold">
                            {(() => {
                              const diff = new Date(campaign.nextFollowUpAt).getTime() - Date.now();
                              if (diff <= 0) return <span className="text-success">Next follow-up: now</span>;
                              const hours = Math.floor(diff / 3600000);
                              const days = Math.floor(hours / 24);
                              const remainHours = hours % 24;
                              return (
                                <span className={days <= 1 ? "text-copper" : "text-text-muted"}>
                                  Next follow-up: {days > 0 ? `${days}d ` : ""}{remainHours}h
                                </span>
                              );
                            })()}
                          </div>
                        )}

                        {renderActions(campaign)}
                      </GlassCard>
                    ))
                  )}
                </KanbanColumn>
              );
            })}
          </div>
        </div>
      </div>

      {variantsFor ? <VariantsModal campaign={variantsFor} onClose={() => setVariantsFor(null)} /> : null}
      {eventsFor ? <EventsModal campaign={eventsFor} onClose={() => setEventsFor(null)} /> : null}
    </OutboundShell>
  );
}

// ─── Variant types ────────────────────────────────────────────────────────────

interface VariantPerf { sent: number; opens: number; replies: number; clicks: number; openRate: number; replyRate: number; clickRate: number }
interface CampaignVariant {
  key: string;
  style: string;
  subject: string;
  greeting: string;
  body: string;
  cta: string;
  signature: string;
  spamScore: number;
  approved: boolean;
  flags: string[];
  performance: VariantPerf;
}
interface VariantsResponse {
  generatedAt: string | null;
  variants: CampaignVariant[];
  best: {
    subject: { key: string; subject: string; openRate: number } | null;
    variant: { key: string; style: string; replyRate: number } | null;
    cta: { key: string; cta: string; replyRate: number } | null;
  };
}

const VARIANT_COLORS: Record<string, string> = {
  A: "border-brand/30 bg-brand/5",
  B: "border-success/30 bg-success/5",
  C: "border-copper/30 bg-copper/5",
  D: "border-copper/30 bg-copper/5",
  E: "border-info/30 bg-info/5",
};

function VariantsModal({ campaign, onClose }: { campaign: { id: string; name: string }; onClose: () => void }) {
  const [data, setData] = useState<VariantsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchOutbound<VariantsResponse>(`/api/outbound/campaigns/${campaign.id}/variants`);
      setData(res);
    } catch {
      setError("Could not load variants.");
    } finally {
      setLoading(false);
    }
  }, [campaign.id]);

  useEffect(() => { void load(); }, [load]);

  const generate = async () => {
    setGenerating(true);
    setError("");
    try {
      await fetchOutbound(`/api/outbound/campaigns/${campaign.id}/variants/generate`, { method: "POST" });
      await load();
    } catch {
      setError("Generation failed — check your NVIDIA key in Settings.");
    } finally {
      setGenerating(false);
    }
  };

  const hasVariants = (data?.variants?.length ?? 0) > 0;

  return (
    <Modal title={`AI Variants · ${campaign.name}`} onClose={onClose}>
      <div className="flex items-center justify-between gap-3 mb-4">
        <p className="text-xs text-text-muted">5 distinct, professional variants. Each lead gets a rotated variant; high performers get sent more often.</p>
        <button onClick={() => void generate()} disabled={generating} className="h-9 px-3 shrink-0 rounded-lg border border-copper/30 bg-copper/15 text-xs font-bold text-copper inline-flex items-center gap-1.5 disabled:opacity-60">
          {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          {hasVariants ? "Regenerate" : "Generate variants"}
        </button>
      </div>

      {error ? <div className="mb-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</div> : null}

      {loading ? (
        <div className="py-10 flex items-center justify-center gap-2 text-sm text-text-muted"><Loader2 className="h-5 w-5 animate-spin" /> Loading…</div>
      ) : !hasVariants ? (
        <div className="py-10 text-center">
          <Sparkles className="h-9 w-9 mx-auto text-copper mb-3" />
          <div className="text-sm font-black text-text">No variants generated yet</div>
          <p className="mt-1 text-xs text-text-muted max-w-sm mx-auto">Generate 5 unique email styles (Direct, Consultative, Branding, SEO, Opportunity) that rotate across your leads.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {(data!.best.subject || data!.best.variant) && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <BestCard label="Best subject" value={data!.best.subject ? `${data!.best.subject.key}: "${data!.best.subject.subject}"` : "—"} sub={data!.best.subject ? `${data!.best.subject.openRate}% open` : "no data yet"} />
              <BestCard label="Best variant" value={data!.best.variant ? `${data!.best.variant.key} · ${data!.best.variant.style}` : "—"} sub={data!.best.variant ? `${data!.best.variant.replyRate}% reply` : "no data yet"} />
              <BestCard label="Best CTA" value={data!.best.cta ? `${data!.best.cta.key}` : "—"} sub={data!.best.cta ? `${data!.best.cta.replyRate}% reply` : "no data yet"} />
            </div>
          )}

          {data!.variants.map((v) => (
            <div key={v.key} className={`rounded-lg border p-4 ${VARIANT_COLORS[v.key] || "border-border"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="h-7 w-7 rounded-lg bg-surface-2 flex items-center justify-center text-sm font-black text-text">{v.key}</span>
                  <div>
                    <div className="text-sm font-black text-text">{v.style}</div>
                    <div className="text-[11px] text-text-muted">{v.subject}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {v.approved ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-success"><CheckCircle2 className="h-3.5 w-3.5" /> Approved</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-danger" title={v.flags.join("; ")}><XCircle className="h-3.5 w-3.5" /> Blocked</span>
                  )}
                  <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${v.spamScore <= 4 ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`} title="Spam risk score (0-10)">Spam {v.spamScore}</span>
                </div>
              </div>

              <pre className="mt-3 whitespace-pre-wrap font-sans text-xs text-text-muted bg-bg border border-border rounded-md p-3 max-h-44 overflow-y-auto">{v.body}</pre>

              {v.flags.length > 0 && (<div className="mt-2 text-[11px] text-danger">{v.flags.join(" · ")}</div>)}

              <div className="mt-3 grid grid-cols-4 gap-2 text-center text-[11px]">
                <Stat label="sent" value={v.performance.sent} />
                <Stat label="opens" value={`${v.performance.openRate}%`} highlight={v.performance.openRate > 0} />
                <Stat label="clicks" value={`${v.performance.clickRate}%`} />
                <Stat label="replies" value={`${v.performance.replyRate}%`} highlight={v.performance.replyRate > 0} />
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

function BestCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg border border-brand/20 bg-brand/5 p-3">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-brand"><TrendingUp className="h-3 w-3" /> {label}</div>
      <div className="mt-1 text-xs font-bold text-text truncate" title={value}>{value}</div>
      <div className="text-[10px] text-text-muted">{sub}</div>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <div className="rounded bg-bg border border-border p-1.5">
      <div className={`font-black ${highlight ? "text-success" : "text-text"}`}>{value}</div>
      <div className="text-text-muted">{label}</div>
    </div>
  );
}

// ─── Events modal ─────────────────────────────────────────────────────────────

interface CampaignEvent {
  id: string;
  toEmail: string;
  fromEmail?: string;
  subject: string;
  variant: string | null;
  status: string;
  sentAt: string | null;
  deliveredAt: string | null;
  openedAt: string | null;
  firstOpenedAt?: string | null;
  lastOpenedAt?: string | null;
  openCount?: number;
  clickedAt: string | null;
  clickCount?: number;
  bouncedAt: string | null;
  unsubscribedAt: string | null;
  errorMessage: string | null;
  businessName: string;
  ipAddresses?: string[];
  userAgents?: string[];
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
function fmtTime(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function EventsModal({ campaign, onClose }: { campaign: { id: string; name: string } | null; onClose: () => void }) {
  const [events, setEvents] = useState<CampaignEvent[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (!campaign) return;
    let active = true;
    (async () => {
      try {
        const params = new URLSearchParams({ limit: "200" });
        if (filter) params.set("filter", filter);
        const res = await fetchOutbound<any>(`/api/outbound/campaigns/${campaign.id}/events?${params}`);
        if (active) { setEvents(res.events); setCounts(res.counts); setExpanded(null); }
      } catch { /* ignore */ }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [campaign?.id, filter]);

  if (!campaign) return null;

  const filters = [
    { label: "All", value: "" },
    { label: "Opened", value: "OPENED" },
    { label: "Bounced", value: "BOUNCED" },
    { label: "Unsub", value: "UNSUBSCRIBED" },
    { label: "Clicked", value: "CLICKED" },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-4xl mt-10 mb-10 glass rounded-2xl border border-border shadow-[0_24px_64px_rgba(0,0,0,.5)]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="text-sm font-black text-text">Events · {campaign.name}</h3>
          <button onClick={onClose} className="h-8 w-8 rounded-lg text-text-muted hover:text-text flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-4">
            {[
              { label: "sent", key: "sent", icon: "📨" },
              { label: "delivered", key: "delivered", icon: "✅" },
              { label: "opened", key: "opened", icon: "👁" },
              { label: "clicked", key: "clicked", icon: "🖱" },
              { label: "bounced", key: "bounced", icon: "❌" },
              { label: "unsub", key: "unsubscribed", icon: "🔕" },
            ].map(({ label, key, icon }) => (
              <div key={key} className="rounded-lg border border-border bg-surface-2/40 p-2 text-center">
                <div className="text-[10px] text-text-muted uppercase">{icon} {label}</div>
                <div className="text-sm font-black text-text">{counts[key] ?? 0}</div>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-1.5 mb-3 flex-wrap">
            {filters.map((f) => (
              <button key={f.value} onClick={() => setFilter(f.value)}
                className={`h-7 px-2.5 rounded-full text-[11px] font-bold border transition-colors ${filter === f.value ? "border-brand/30 bg-brand-soft text-brand" : "border-border text-text-muted hover:bg-surface-2"}`}>{f.label}</button>
            ))}
          </div>

          {loading ? (
            <div className="py-10 flex items-center justify-center gap-2 text-sm text-text-muted"><Loader2 className="h-5 w-5 animate-spin" /> Loading events…</div>
          ) : events.length === 0 ? (
            <div className="py-10 text-center text-sm text-text-muted">No email events yet.</div>
          ) : (
            <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
              {events.map((e) => {
                const isExpanded = expanded === e.id;
                return (
                  <div key={e.id}
                    onClick={() => setExpanded(isExpanded ? null : e.id)}
                    className={`rounded-xl border cursor-pointer transition-colors ${
                      e.openedAt ? "border-success/20 bg-success/[0.02]" : e.bouncedAt ? "border-danger/20 bg-danger/[0.02]" : "border-border bg-surface-2/40"
                    } ${isExpanded ? "ring-1 ring-brand/30" : "hover:border-brand/20"}`}>
                    <div className="px-4 py-3 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-text truncate">{e.businessName}</span>
                          {e.variant && <span className="shrink-0 inline-flex h-4 w-4 items-center justify-center rounded bg-brand/20 text-[9px] font-black text-brand">{e.variant}</span>}
                          {e.bouncedAt ? <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold bg-danger/10 text-danger border border-danger/20">Bounced</span> :
                           e.unsubscribedAt ? <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold bg-copper/10 text-copper border border-copper/20">Unsub</span> :
                           e.clickedAt ? <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold bg-info/10 text-info border border-info/20">Clicked</span> :
                           e.openedAt ? <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold bg-success/10 text-success border border-success/20">Opened</span> :
                           e.deliveredAt ? <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold bg-surface-2 text-text-muted">Delivered</span> :
                           <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold bg-surface-2 text-text-muted">Queued</span>}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[11px] text-text-muted truncate">{e.toEmail}</span>
                          <span className="text-[10px] text-text-faint">→</span>
                          <span className="text-[11px] text-text-muted truncate max-w-[300px]">{e.subject}</span>
                        </div>
                      </div>
                      <div className="shrink-0 flex items-center gap-3 text-[10px] text-text-muted">
                        {e.openCount != null && e.openCount > 0 && (
                          <span className="text-success font-bold" title={`First: ${fmtDate(e.firstOpenedAt)}\nLast: ${fmtDate(e.lastOpenedAt)}`}>👁 {e.openCount}×</span>
                        )}
                        <span className={e.bouncedAt ? "text-danger" : ""}>{fmtDate(e.sentAt)}</span>
                        <span className="text-text-faint">{isExpanded ? "▴" : "▾"}</span>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="px-4 pb-4 border-t border-border/50 pt-3 space-y-2">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <div className="rounded-lg bg-surface-2 p-2 text-center">
                            <div className="text-[9px] uppercase text-text-muted mb-0.5">📨 Sent</div>
                            <div className="text-xs font-bold text-text">{fmtTime(e.sentAt)}</div>
                            <div className="text-[9px] text-text-muted">{fmtDate(e.sentAt)}</div>
                          </div>
                          <div className={`rounded-lg p-2 text-center ${e.deliveredAt ? "bg-success/10" : "bg-surface-2"}`}>
                            <div className="text-[9px] uppercase text-text-muted mb-0.5">✅ Delivered</div>
                            <div className="text-xs font-bold text-text">{fmtTime(e.deliveredAt)}</div>
                            <div className="text-[9px] text-text-muted">{e.deliveredAt ? "✓" : "—"}</div>
                          </div>
                          <div className={`rounded-lg p-2 text-center ${e.openedAt ? "bg-success/10" : "bg-surface-2"}`}>
                            <div className="text-[9px] uppercase text-text-muted mb-0.5">👁 Opened {e.openCount && e.openCount > 1 ? `(${e.openCount}×)` : ""}</div>
                            <div className="text-xs font-bold text-text">{fmtTime(e.firstOpenedAt || e.openedAt)}</div>
                            {e.firstOpenedAt && e.lastOpenedAt && e.firstOpenedAt !== e.lastOpenedAt && (
                              <div className="text-[9px] text-text-muted">last: {fmtTime(e.lastOpenedAt)}</div>
                            )}
                          </div>
                          <div className={`rounded-lg p-2 text-center ${e.clickedAt ? "bg-info/10" : "bg-surface-2"}`}>
                            <div className="text-[9px] uppercase text-text-muted mb-0.5">🖱 Clicked {e.clickCount && e.clickCount > 1 ? `(${e.clickCount}×)` : ""}</div>
                            <div className="text-xs font-bold text-text">{fmtTime(e.clickedAt)}</div>
                            <div className="text-[9px] text-text-muted">{e.clickedAt ? "✓" : "—"}</div>
                          </div>
                        </div>
                        {(e.bouncedAt || e.unsubscribedAt || e.errorMessage) && (
                          <div className={`rounded-lg p-2.5 ${e.bouncedAt ? "bg-danger/10 border border-danger/20" : "bg-copper/10 border border-copper/20"}`}>
                            <div className="text-[10px] font-bold text-text-muted uppercase mb-1">{e.bouncedAt ? "❌ Bounce" : "🔕 Unsubscribed"}</div>
                            <div className="text-xs text-text-muted">{fmtDate(e.bouncedAt || e.unsubscribedAt)}</div>
                            {e.errorMessage && <div className="text-[10px] text-danger mt-1">{e.errorMessage}</div>}
                          </div>
                        )}
                        {e.ipAddresses && e.ipAddresses.length > 0 && (
                          <div className="text-[10px] text-text-muted"><span className="font-bold">IPs:</span> {e.ipAddresses.join(", ")}</div>
                        )}
                        {e.fromEmail && (
                          <div className="text-[10px] text-text-muted"><span className="font-bold">From:</span> {e.fromEmail}</div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-2xl mt-10 mb-10 glass rounded-2xl border border-border shadow-[0_24px_64px_rgba(0,0,0,.5)]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="text-sm font-black text-text truncate pr-4">{title}</h3>
          <button onClick={onClose} className="h-8 w-8 shrink-0 rounded-lg text-text-muted hover:text-text flex items-center justify-center">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
