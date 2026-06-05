"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Eye,
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
} from "lucide-react";
import { EmptyState, MetricCard, OutboundShell, StatusBadge } from "@/components/OutboundShell";
import { DomainSelector } from "@/components/DomainSelector";
import { useDomainContext } from "@/lib/domainContext";
import {
  fetchOutbound,
  type CampaignStatus,
  type OutboundCampaignSummary,
  type OutboundOverview,
} from "@/lib/outbound";

interface AvailableLead {
  id: string;
  businessName: string;
  location?: string;
  category?: string;
  domainMatchScore: number;
  emails: Array<{ email: string; status: string }>;
}

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
  const [message, setMessage] = useState("");
  const [variantsFor, setVariantsFor] = useState<{ id: string; name: string } | null>(null);
  const [opensFor, setOpensFor] = useState<{ id: string; name: string } | null>(null);
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

  // Default the "Send from" picker to a real (non dry-run) sender once loaded.
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
    try {
      const [campaignData, overviewData, leadData, templateData] = await Promise.all([
        fetchOutbound<OutboundCampaignSummary[]>("/api/outbound/campaigns"),
        fetchOutbound<OutboundOverview>("/api/outbound/overview"),
        fetchOutbound<{ leads: AvailableLead[] }>("/api/leads?hasEmails=true&limit=12&page=1"),
        fetchOutbound<Array<{ id: string; name: string; subject: string }>>("/api/outbound/templates"),
      ]);
      setCampaigns(campaignData);
      setOverview(overviewData);
      setLeads(leadData.leads);
      setTemplates(templateData);
    } catch {
      setCampaigns(demoCampaigns);
      setMessage("Backend offline. Showing demo campaign data.");
    } finally {
      setLoading(false);
    }
  }, []);

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
        if (active) {
          setLoading(false);
        }
      }
    };

    void bootstrap();

    return () => {
      active = false;
    };
  }, []);

  // Whenever the user picks a portfolio domain, hydrate the campaign form
  // so they never have to retype name/niche/city for a new campaign.
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

  const totals = useMemo(() => {
    return campaigns.reduce(
      (acc, campaign) => ({
        recipients: acc.recipients + campaign.recipients,
        sent: acc.sent + campaign.sent,
        replies: acc.replies + campaign.replies,
        opens: acc.opens + campaign.opens,
      }),
      { recipients: 0, sent: 0, replies: 0, opens: 0 }
    );
  }, [campaigns]);

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
      await fetchOutbound(`/api/outbound/campaigns/${campaignId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setLoading(true);
      await load();
    } catch {
      setMessage("Status update failed because the backend is offline.");
    }
  };

  const queueCampaign = async (campaignId: string) => {
    setMessage("");
    try {
      const result = await fetchOutbound<{ queued: number }>(`/api/outbound/campaigns/${campaignId}/queue`, {
        method: "POST",
      });
      setMessage(`${result.queued} email(s) queued with sender limits and suppression checks.`);
      setLoading(true);
      await load();
    } catch {
      setMessage("Queue action failed because the backend is offline.");
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

  const handleCSVUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const emailRe = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const found = new Set<string>();
    try {
      const isExcel = /\.(xlsx|xls)$/i.test(file.name);
      if (isExcel) {
        // Excel files are binary — parse with the xlsx library, not as text.
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

  return (
    <OutboundShell
      title="Campaign Manager"
      subtitle="Create campaigns, select leads, assign default AI templates, schedule sends, and pause or resume sequences."
      actions={
        <button
          onClick={() => {
            setLoading(true);
            setMessage("");
            void load();
          }}
          className="h-10 px-3 rounded-lg border border-slate-300 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/70 text-sm text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white inline-flex items-center gap-2"
        >
          <RefreshCcw className="h-4 w-4" />
          Refresh
        </button>
      }
    >
      {message ? <div className="mb-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/60 px-4 py-3 text-sm text-slate-700 dark:text-slate-300">{message}</div> : null}

      <section className="grid grid-cols-2 xl:grid-cols-6 gap-3">
        <MetricCard label="Campaigns" value={campaigns.length} helper={`${overview?.metrics.activeCampaigns ?? campaigns.filter((item) => item.status === "ACTIVE").length} active`} />
        <MetricCard label="Recipients" value={totals.recipients} helper="assigned leads" />
        <MetricCard label="Queued" value={overview?.metrics.queued ?? 0} helper="ready to send" />
        <MetricCard label="Sent" value={totals.sent} helper="all campaigns" />
        <MetricCard label="Opens" value={totals.opens} helper="pixel tracked" />
        <MetricCard label="Replies" value={totals.replies} helper="intent classified" />
      </section>

      <section className="mt-6 grid grid-cols-1 2xl:grid-cols-[0.78fr_1.22fr] gap-5">
        <form
          className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/35 p-5"
          onSubmit={(event) => {
            event.preventDefault();
            void createCampaign();
          }}
        >
          <div className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-indigo-300" />
            <h2 className="text-base font-black text-slate-900 dark:text-slate-100">Create Campaign</h2>
          </div>

          <div className="mt-4">
            <DomainSelector
              label="Source domain (from portfolio)"
              emptyAction={{ label: "Add to portfolio", href: "/portfolio" }}
            />
            {activeDomain ? (
              <p className="mt-2 text-[11px] text-emerald-300">
                Niche, geo, and objective auto-fill from {activeDomain.name}. The campaign will be linked to this domain.
              </p>
            ) : null}
          </div>

          <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              ["name", "Campaign name"],
              ["geoDomain", "Geo domain"],
              ["niche", "Niche/category"],
              ["cityState", "City/state"],
            ].map(([field, label]) => (
              <label key={field} className="text-xs font-bold text-slate-400">
                {label}
                <input
                  value={form[field as keyof typeof form]}
                  onChange={(event) => setForm((current) => ({ ...current, [field]: event.target.value }))}
                  className="mt-2 h-10 w-full rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-400"
                />
              </label>
            ))}

            <label className="text-xs font-bold text-slate-400">
              Tone
              <select
                value={form.tone}
                onChange={(event) => setForm((current) => ({ ...current, tone: event.target.value }))}
                className="mt-2 h-10 w-full rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-400"
              >
                <option value="professional">Professional</option>
                <option value="friendly">Friendly</option>
                <option value="persuasive">Persuasive</option>
              </select>
            </label>
          </div>

          <label className="mt-4 block text-xs font-bold text-slate-400">
            Objective
            <textarea
              value={form.objective}
              onChange={(event) => setForm((current) => ({ ...current, objective: event.target.value }))}
              className="mt-2 h-20 w-full rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-400"
            />
          </label>

          <div className="mt-4 p-4 rounded-lg border border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/30 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-wide text-slate-400">Sending Throttle</h3>
              <span className="text-[10px] text-slate-500">Controls send pace</span>
            </div>

            <label className="block text-xs font-bold text-slate-400">
              Sending Speed
              <select
                value={form.throttlePreset}
                onChange={(e) => setForm(current => ({ ...current, throttlePreset: e.target.value }))}
                className="mt-2 h-10 w-full rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-400"
              >
                {Object.entries(THROTTLE_PRESETS).map(([key, preset]) => (
                  <option key={key} value={key}>{preset.label}</option>
                ))}
              </select>
            </label>

            {form.throttlePreset === "custom" && (
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-xs font-bold text-slate-400">
                  Min Minutes Between
                  <input
                    type="number"
                    min={1}
                    max={1440}
                    value={form.smartDelayMin}
                    onChange={(e) => setForm(current => ({ ...current, smartDelayMin: e.target.value }))}
                    className="mt-2 h-10 w-full rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-400"
                  />
                </label>
                <label className="block text-xs font-bold text-slate-400">
                  Max Minutes Between
                  <input
                    type="number"
                    min={1}
                    max={1440}
                    value={form.smartDelayMax}
                    onChange={(e) => setForm(current => ({ ...current, smartDelayMax: e.target.value }))}
                    className="mt-2 h-10 w-full rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-400"
                  />
                </label>
              </div>
            )}

            <label className="block text-xs font-bold text-slate-400">
              Max Per Day
              <input
                type="number"
                min={1}
                max={1000}
                value={form.dailyLimit}
                onChange={(e) => setForm(current => ({ ...current, dailyLimit: e.target.value }))}
                className="mt-2 h-10 w-full rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-400"
              />
            </label>

            <p className="text-[10px] text-slate-500 leading-relaxed">
              {form.throttlePreset === "custom"
                ? `Sends 1 email every ${form.smartDelayMin}-${form.smartDelayMax} minutes, up to ${form.dailyLimit}/day.`
                : `${THROTTLE_PRESETS[form.throttlePreset]?.label}, capped at ${form.dailyLimit}/day.`
              }
            </p>
          </div>

          <label className="mt-4 block text-xs font-bold text-slate-400">
            Send from (email account)
            <select
              value={form.senderAccountId}
              onChange={(event) => setForm((current) => ({ ...current, senderAccountId: event.target.value }))}
              className="mt-2 h-10 w-full rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-400"
            >
              {(overview?.senders || []).length === 0 ? <option value="">No senders — add one in Senders</option> : null}
              {(overview?.senders || []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.provider === "DRY_RUN" ? "🧪 " : "📧 "}{s.fromEmail} ({s.provider}{s.status !== "active" ? ` · ${s.status}` : ""})
                </option>
              ))}
            </select>
            <span className="mt-1 block text-[11px] font-normal text-slate-500">
              Real delivery uses a configured provider (e.g. Resend). 🧪 Dry-run only simulates sends.
            </span>
          </label>

          <label className="mt-4 block text-xs font-bold text-slate-400">
            Email Template (optional)
            <select
              value={form.templateId}
              onChange={(event) => setForm((current) => ({ ...current, templateId: event.target.value }))}
              className="mt-2 h-10 w-full rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-400"
            >
              <option value="">Generate with AI</option>
              {templates.map(t => (
                <option key={t.id} value={t.id}>{t.name} — {t.subject}</option>
              ))}
            </select>
          </label>

          <div className="mt-4">
            <label className="block text-xs font-bold text-slate-400 mb-2">
              Upload Email List (CSV)
            </label>
            <div className="flex items-center gap-2">
              <label className="flex-1 h-10 px-3 rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 text-sm text-slate-400 flex items-center gap-2 cursor-pointer hover:border-indigo-500 transition-colors">
                <Upload className="w-4 h-4" />
                <span className="text-xs">{uploadedEmails.length > 0 ? `${uploadedEmails.length} emails loaded` : 'Choose CSV / Excel file'}</span>
                <input type="file" accept=".csv,.txt,.xlsx,.xls" onChange={handleCSVUpload} className="hidden" />
              </label>
              {uploadedEmails.length > 0 && (
                <button
                  type="button"
                  onClick={() => setUploadedEmails([])}
                  className="px-3 h-10 text-xs text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 rounded-lg border border-slate-300 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-700"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          <div className="mt-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-xs font-black uppercase tracking-wide text-slate-500">Select leads</h3>
              <span className="text-xs text-slate-500">{selectedLeadIds.length} selected</span>
            </div>
            <div className="mt-3 max-h-72 overflow-y-auto space-y-2 pr-1">
              {leads.length === 0 ? (
                <EmptyState title="No verified leads loaded" body="Run the lead explorer first, or create the campaign without assigned leads." />
              ) : (
                leads.map((lead) => (
                  <label key={lead.id} className="flex gap-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/45 p-3 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedLeadIds.includes(lead.id)}
                      onChange={() => toggleLead(lead.id)}
                      className="mt-1 h-4 w-4 accent-indigo-500"
                    />
                    <span className="min-w-0">
                      <span className="block font-bold text-slate-900 dark:text-slate-100 truncate">{lead.businessName}</span>
                      <span className="mt-1 block text-xs text-slate-500">
                        {lead.location || lead.category || "Verified lead"} - {lead.domainMatchScore}% match
                      </span>
                    </span>
                  </label>
                ))
              )}
            </div>
          </div>

          <button className="mt-5 h-11 w-full rounded-lg bg-indigo-600 text-sm font-black text-white hover:bg-indigo-500 inline-flex items-center justify-center gap-2">
            <Plus className="h-4 w-4" />
            Create campaign
          </button>
        </form>

        <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/35 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-black text-slate-900 dark:text-slate-100">Kanban Campaign View</h2>
              <p className="mt-1 text-sm text-slate-500">
                Queue-based sending uses sender limits, opt-out checks, smart delays, and reply stops.
              </p>
            </div>
            <StatusBadge value={loading ? "Loading" : "Ready"} />
          </div>

          <div className="mt-5 grid grid-cols-1 xl:grid-cols-4 gap-4">
            {statusColumns.map((status) => {
              const columnCampaigns = campaigns.filter((campaign) => campaign.status === status);
              return (
                <div key={status} className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/35 p-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-black uppercase tracking-wide text-slate-500">{status}</h3>
                    <span className="text-xs text-slate-600">{columnCampaigns.length}</span>
                  </div>
                  <div className="mt-3 space-y-3">
                    {columnCampaigns.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-800 p-4 text-xs text-slate-600">No campaigns</div>
                    ) : (
                      columnCampaigns.map((campaign) => (
                        <article key={campaign.id} className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/70 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <h4 className="text-sm font-black text-slate-900 dark:text-slate-100 truncate">{campaign.name}</h4>
                              <p className="mt-1 text-xs text-slate-500 truncate">{campaign.geoDomain}</p>
                            </div>
                            <span className="text-xs font-black text-emerald-300">{campaign.engagementScore}</span>
                          </div>
                          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                            <div className="rounded bg-slate-50 dark:bg-slate-950/60 p-2">
                              <div className="font-black text-slate-800 dark:text-slate-200">{campaign.sent}</div>
                              <div className="text-slate-600">sent</div>
                            </div>
                            <div className="rounded bg-slate-50 dark:bg-slate-950/60 p-2">
                              <div className="font-black text-slate-800 dark:text-slate-200">{campaign.opens}</div>
                              <div className="text-slate-600">open</div>
                            </div>
                            <div className="rounded bg-slate-50 dark:bg-slate-950/60 p-2">
                              <div className="font-black text-slate-800 dark:text-slate-200">{campaign.replies}</div>
                              <div className="text-slate-600">reply</div>
                            </div>
                          </div>
                          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                            <div className="h-full rounded-full bg-indigo-400" style={{ width: `${Math.min(campaign.engagementScore, 100)}%` }} />
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {campaign.status === "ACTIVE" ? (
                              <button
                                onClick={() => void updateStatus(campaign.id, "PAUSED")}
                                className="h-8 px-2 rounded border border-amber-400/25 bg-amber-500/10 text-xs font-bold text-amber-200 inline-flex items-center gap-1"
                              >
                                <Pause className="h-3.5 w-3.5" />
                                Pause
                              </button>
                            ) : (
                              <button
                                onClick={() => void updateStatus(campaign.id, "ACTIVE")}
                                className="h-8 px-2 rounded border border-emerald-400/25 bg-emerald-500/10 text-xs font-bold text-emerald-200 inline-flex items-center gap-1"
                              >
                                <Play className="h-3.5 w-3.5" />
                                Resume
                              </button>
                            )}
                            <button
                              onClick={() => void queueCampaign(campaign.id)}
                              className="h-8 px-2 rounded border border-slate-400 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/70 text-xs font-bold text-slate-700 dark:text-slate-300 inline-flex items-center gap-1"
                            >
                              <Send className="h-3.5 w-3.5" />
                              Queue
                            </button>
                            <button
                              onClick={() => setVariantsFor({ id: campaign.id, name: campaign.name })}
                              title="AI variants"
                              className="h-8 px-2 rounded border border-violet-400/25 bg-violet-500/10 text-xs font-bold text-violet-300 inline-flex items-center gap-1"
                            >
                              <Sparkles className="h-3.5 w-3.5" />
                              Variants
                            </button>
                            <button
                              onClick={() => setOpensFor({ id: campaign.id, name: campaign.name })}
                              title="Who opened"
                              className="h-8 px-2 rounded border border-indigo-400/25 bg-indigo-500/10 text-xs font-bold text-indigo-300 inline-flex items-center gap-1"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              Opens
                            </button>
                            <button
                              onClick={() => void deleteCampaign(campaign.id, campaign.name)}
                              title="Delete campaign"
                              className="h-8 px-2 rounded border border-rose-400/25 bg-rose-500/10 text-xs font-bold text-rose-300 inline-flex items-center gap-1 ml-auto"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </article>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </section>

      {variantsFor ? (
        <VariantsModal campaign={variantsFor} onClose={() => setVariantsFor(null)} />
      ) : null}
      {opensFor ? (
        <OpensModal campaign={opensFor} onClose={() => setOpensFor(null)} />
      ) : null}
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
  A: "border-indigo-400/30 bg-indigo-500/5",
  B: "border-emerald-400/30 bg-emerald-500/5",
  C: "border-violet-400/30 bg-violet-500/5",
  D: "border-amber-400/30 bg-amber-500/5",
  E: "border-sky-400/30 bg-sky-500/5",
};

// ─── Variants modal ───────────────────────────────────────────────────────────

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
        <p className="text-xs text-slate-500">
          5 distinct, professional variants. Each lead gets a rotated variant; high performers get sent more often.
        </p>
        <button
          onClick={() => void generate()}
          disabled={generating}
          className="h-9 px-3 shrink-0 rounded-lg border border-violet-400/30 bg-violet-500/15 text-xs font-bold text-violet-200 inline-flex items-center gap-1.5 disabled:opacity-60"
        >
          {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          {hasVariants ? "Regenerate" : "Generate variants"}
        </button>
      </div>

      {error ? <div className="mb-3 rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{error}</div> : null}

      {loading ? (
        <div className="py-10 flex items-center justify-center gap-2 text-sm text-slate-500"><Loader2 className="h-5 w-5 animate-spin" /> Loading…</div>
      ) : !hasVariants ? (
        <div className="py-10 text-center">
          <Sparkles className="h-9 w-9 mx-auto text-violet-400 mb-3" />
          <div className="text-sm font-black text-slate-900 dark:text-slate-100">No variants generated yet</div>
          <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">Generate 5 unique email styles (Direct, Consultative, Branding, SEO, Opportunity) that rotate across your leads.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Best performers */}
          {(data!.best.subject || data!.best.variant) && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <BestCard label="Best subject" value={data!.best.subject ? `${data!.best.subject.key}: "${data!.best.subject.subject}"` : "—"} sub={data!.best.subject ? `${data!.best.subject.openRate}% open` : "no data yet"} />
              <BestCard label="Best variant" value={data!.best.variant ? `${data!.best.variant.key} · ${data!.best.variant.style}` : "—"} sub={data!.best.variant ? `${data!.best.variant.replyRate}% reply` : "no data yet"} />
              <BestCard label="Best CTA" value={data!.best.cta ? `${data!.best.cta.key}` : "—"} sub={data!.best.cta ? `${data!.best.cta.replyRate}% reply` : "no data yet"} />
            </div>
          )}

          {/* Variant cards */}
          {data!.variants.map((v) => (
            <div key={v.key} className={`rounded-lg border p-4 ${VARIANT_COLORS[v.key] || "border-slate-200 dark:border-slate-800"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="h-7 w-7 rounded-lg bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-sm font-black text-slate-700 dark:text-slate-300">{v.key}</span>
                  <div>
                    <div className="text-sm font-black text-slate-900 dark:text-slate-100">{v.style}</div>
                    <div className="text-[11px] text-slate-500">{v.subject}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {v.approved ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" /> Approved</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-400" title={v.flags.join("; ")}><XCircle className="h-3.5 w-3.5" /> Blocked</span>
                  )}
                  <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${v.spamScore <= 4 ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"}`} title="Spam risk score (0-10)">
                    Spam {v.spamScore}
                  </span>
                </div>
              </div>

              <pre className="mt-3 whitespace-pre-wrap font-sans text-xs text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 rounded-md p-3 max-h-44 overflow-y-auto">{v.body}</pre>

              {v.flags.length > 0 && (
                <div className="mt-2 text-[11px] text-rose-400">{v.flags.join(" · ")}</div>
              )}

              {/* Performance bar */}
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
    <div className="rounded-lg border border-indigo-400/20 bg-indigo-500/5 p-3">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-indigo-400"><TrendingUp className="h-3 w-3" /> {label}</div>
      <div className="mt-1 text-xs font-bold text-slate-800 dark:text-slate-200 truncate" title={value}>{value}</div>
      <div className="text-[10px] text-slate-500">{sub}</div>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <div className="rounded bg-white dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 p-1.5">
      <div className={`font-black ${highlight ? "text-emerald-400" : "text-slate-800 dark:text-slate-200"}`}>{value}</div>
      <div className="text-slate-500">{label}</div>
    </div>
  );
}

// ─── Opens (recipient detail) modal ──────────────────────────────────────────

interface Recipient {
  emailLogId: string;
  leadId?: string;
  businessName: string;
  toEmail: string;
  subject: string;
  variant: string | null;
  status: string;
  sentAt: string | null;
  openCount: number;
  firstOpenedAt: string | null;
  lastOpenedAt: string | null;
  clicked: boolean;
  replied: boolean;
}

function OpensModal({ campaign, onClose }: { campaign: { id: string; name: string }; onClose: () => void }) {
  const [rows, setRows] = useState<Recipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [onlyOpened, setOnlyOpened] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetchOutbound<Recipient[]>(`/api/outbound/campaigns/${campaign.id}/recipients`);
        if (active) setRows(res);
      } catch { /* ignore */ }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [campaign.id]);

  const visible = onlyOpened ? rows.filter((r) => r.openCount > 0) : rows;
  const openedCount = rows.filter((r) => r.openCount > 0).length;
  const sentCount = rows.filter((r) => r.sentAt).length;

  return (
    <Modal title={`Opens · ${campaign.name}`} onClose={onClose}>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="text-xs text-slate-500">
          {sentCount} sent · <span className="text-emerald-400 font-bold">{openedCount} opened</span>
          {sentCount > 0 ? ` (${Math.round((openedCount / sentCount) * 100)}%)` : ""}
        </div>
        <button
          onClick={() => setOnlyOpened((v) => !v)}
          className={`h-8 px-3 rounded-lg text-xs font-bold border ${onlyOpened ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-300" : "border-slate-300 dark:border-slate-700 text-slate-500"}`}
        >
          Opened only
        </button>
      </div>

      {loading ? (
        <div className="py-10 flex items-center justify-center gap-2 text-sm text-slate-500"><Loader2 className="h-5 w-5 animate-spin" /> Loading…</div>
      ) : visible.length === 0 ? (
        <div className="py-10 text-center text-sm text-slate-500">No recipients{onlyOpened ? " have opened yet" : " yet — queue the campaign to start sending"}.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="text-[10px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-2 py-2 text-left">Recipient</th>
                <th className="px-2 py-2 text-center">Variant</th>
                <th className="px-2 py-2 text-center">Status</th>
                <th className="px-2 py-2 text-center">Opens</th>
                <th className="px-2 py-2 text-left">Last opened</th>
                <th className="px-2 py-2 text-center">Reply</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {visible.map((r) => (
                <tr key={r.emailLogId} className={r.openCount > 0 ? "bg-emerald-500/[0.03]" : ""}>
                  <td className="px-2 py-2">
                    <div className="font-bold text-slate-800 dark:text-slate-200 truncate max-w-[180px]">{r.businessName}</div>
                    <div className="text-[10px] text-slate-500 truncate max-w-[180px]">{r.toEmail}</div>
                  </td>
                  <td className="px-2 py-2 text-center">
                    {r.variant ? (
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-slate-200 dark:bg-slate-800 text-[10px] font-black text-slate-700 dark:text-slate-300">{r.variant}</span>
                    ) : <span className="text-slate-500">—</span>}
                  </td>
                  <td className="px-2 py-2 text-center">
                    <span className="text-[10px] font-bold text-slate-500">{r.status}</span>
                  </td>
                  <td className="px-2 py-2 text-center">
                    {r.openCount > 0 ? (
                      <span className={`inline-flex items-center gap-1 font-black ${r.openCount >= 3 ? "text-emerald-400" : "text-emerald-500/80"}`} title={r.firstOpenedAt ? `First: ${new Date(r.firstOpenedAt).toLocaleString()}` : ""}>
                        <Eye className="h-3 w-3" /> {r.openCount}×
                      </span>
                    ) : (
                      <span className="text-slate-500">—</span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-slate-500">
                    {r.lastOpenedAt ? new Date(r.lastOpenedAt).toLocaleString() : "—"}
                  </td>
                  <td className="px-2 py-2 text-center">
                    {r.replied ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 inline" /> : <span className="text-slate-600">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

// ─── Shared modal shell ───────────────────────────────────────────────────────

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-2xl mt-10 mb-10 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <h3 className="text-sm font-black text-slate-900 dark:text-slate-100 truncate pr-4">{title}</h3>
          <button onClick={onClose} className="h-8 w-8 shrink-0 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 flex items-center justify-center">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
