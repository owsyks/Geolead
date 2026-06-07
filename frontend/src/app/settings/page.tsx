"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Bot,
  Check,
  Globe2,
  Inbox as InboxIcon,
  KeyRound,
  Mail,
  RefreshCcw,
  Save,
  Search,
  Server,
  ShieldAlert,
  Settings as SettingsIcon,
  Webhook,
  Loader2,
} from "lucide-react";
import { ClientDate } from "@/lib/ClientDate";
import {
  fetchOutbound,
  authFetch,
  type MailboxConfig,
  type SettingItem,
  type SettingsTestResult,
  type SyncResult,
} from "@/lib/outbound";

interface AuditLogEntry {
  id: string;
  entityType: string;
  entityId?: string | null;
  action: string;
  createdAt: string;
  user?: { id: string; name: string; email: string; role: string } | null;
}

interface WebhookEventEntry {
  id: string;
  provider: string;
  type: string;
  externalId?: string | null;
  processed: boolean;
  createdAt: string;
  summary: string;
}

interface SuppressionEntry {
  id: string;
  email: string;
  reason: string;
  source: string;
  campaignId?: string | null;
  leadId?: string | null;
  createdAt: string;
  updatedAt: string;
}

type Category = SettingItem["category"];

const SECTION_META: Record<
  Category,
  { title: string; description: string; icon: typeof Bot; provider?: string }
> = {
  ai: { title: "AI (NVIDIA / Kimi)", description: "Email generation and AI lead scoring via NVIDIA NIM.", icon: Bot, provider: "nvidia" },
  discovery: { title: "Lead Discovery (Serper.dev)", description: "Google Maps & search enrichment for finding businesses.", icon: Search, provider: "serper" },
  email: { title: "Email Sending (Resend)", description: "Outbound email delivery and reply routing.", icon: Mail, provider: "resend" },
  smtp: { title: "SMTP Server", description: "Reusable SMTP credentials for a custom sending server.", icon: Server, provider: "smtp" },
  inbound: { title: "Inbound Webhook", description: "Secret that protects the inbound reply webhook.", icon: Webhook },
  branding: { title: "Branding & Compliance", description: "Sender identity and the physical address required in every email footer.", icon: Globe2 },
};

const SECTION_ORDER: Category[] = ["ai", "discovery", "email", "smtp", "inbound", "branding"];

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingItem[]>([]);
  // Draft holds only fields the user has touched. Secret fields left untouched
  // are never sent, so we don't overwrite stored secrets with masked dots.
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [message, setMessage] = useState("");
  const [testing, setTesting] = useState<string>("");
  const [testResults, setTestResults] = useState<Record<string, SettingsTestResult>>({});

  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [webhookEvents, setWebhookEvents] = useState<WebhookEventEntry[]>([]);
  const [suppressionEntries, setSuppressionEntries] = useState<SuppressionEntry[]>([]);
  const [suppressionEmail, setSuppressionEmail] = useState("");
  const [suppressionReason, setSuppressionReason] = useState("manual");
  const [suppressionMessage, setSuppressionMessage] = useState("");
  const [savingSuppression, setSavingSuppression] = useState(false);

  const loadSettings = useCallback(async () => {
    try {
      const data = await fetchOutbound<{ settings: SettingItem[] }>("/api/settings");
      setSettings(data.settings);
    } catch {
      setMessage("Could not load settings from the backend.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    let active = true;
    const loadOps = async () => {
      try {
        const data = await fetchOutbound<AuditLogEntry[]>("/api/outbound/audit?limit=5");
        if (active) setAuditLogs(data);
      } catch { if (active) setAuditLogs([]); }
      try {
        const data = await fetchOutbound<WebhookEventEntry[]>("/api/outbound/webhooks?limit=5");
        if (active) setWebhookEvents(data);
      } catch { if (active) setWebhookEvents([]); }
      try {
        const data = await fetchOutbound<SuppressionEntry[]>("/api/outbound/suppressions?limit=5");
        if (active) setSuppressionEntries(data);
      } catch { if (active) setSuppressionEntries([]); }
    };
    void loadOps();
    return () => { active = false; };
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<Category, SettingItem[]>();
    for (const item of settings) {
      const list = map.get(item.category) || [];
      list.push(item);
      map.set(item.category, list);
    }
    return map;
  }, [settings]);

  const setField = (key: string, value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setSaved(false);
  };

  const handleSave = async () => {
    if (Object.keys(draft).length === 0) {
      setMessage("No changes to save.");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const data = await fetchOutbound<{ settings: SettingItem[] }>("/api/settings", {
        method: "PATCH",
        body: JSON.stringify({ values: draft }),
      });
      setSettings(data.settings);
      setDraft({});
      setSaved(true);
      setMessage("Settings saved.");
      setTimeout(() => setSaved(false), 2500);
    } catch (err: any) {
      setMessage(err?.message || "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const runTest = async (provider: string) => {
    setTesting(provider);
    setTestResults((current) => ({ ...current, [provider]: { ok: false, message: "" } }));
    // Save any pending changes first so the test uses the latest values.
    if (Object.keys(draft).length > 0) {
      try {
        const data = await fetchOutbound<{ settings: SettingItem[] }>("/api/settings", {
          method: "PATCH",
          body: JSON.stringify({ values: draft }),
        });
        setSettings(data.settings);
        setDraft({});
      } catch { /* fall through to test anyway */ }
    }
    try {
      const result = await fetchOutbound<SettingsTestResult>(`/api/settings/test/${provider}`, { method: "POST" });
      setTestResults((current) => ({ ...current, [provider]: result }));
    } catch (err: any) {
      let msg = err?.message || "Test failed.";
      // fetchOutbound throws on non-2xx; the body has the real message.
      try {
        const res = await authFetch(`${process.env.NEXT_PUBLIC_OUTBOUND_API_BASE || "http://localhost:5000"}/api/settings/test/${provider}`, { method: "POST" });
        const body = await res.json();
        if (body?.message) msg = body.message;
      } catch { /* ignore */ }
      setTestResults((current) => ({ ...current, [provider]: { ok: false, message: msg } }));
    } finally {
      setTesting("");
    }
  };

  const handleAddSuppression = async () => {
    const email = suppressionEmail.trim();
    if (!email) { setSuppressionMessage("Enter an email address to suppress."); return; }
    setSavingSuppression(true);
    setSuppressionMessage("");
    try {
      const entry = await fetchOutbound<SuppressionEntry>("/api/outbound/suppressions", {
        method: "POST",
        body: JSON.stringify({ email, reason: suppressionReason.trim() || "manual" }),
      });
      setSuppressionEntries((current) => [entry, ...current.filter((item) => item.id !== entry.id)].slice(0, 5));
      setSuppressionEmail("");
      setSuppressionMessage(`Suppressed ${entry.email}.`);
    } catch {
      setSuppressionMessage("Could not save suppression entry.");
    } finally {
      setSavingSuppression(false);
    }
  };

  const dirty = Object.keys(draft).length > 0;

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <Link href="/" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-slate-800 dark:text-slate-200 transition-colors">
            <ArrowLeft className="h-4 w-4" />
            Back to overview
          </Link>
        </div>

        <div className="flex items-center justify-between gap-3 pb-6 border-b border-slate-200 dark:border-slate-900">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-lg border border-teal-400/20 bg-teal-500/10 flex items-center justify-center text-teal-200">
              <SettingsIcon className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-slate-100">Settings & Integrations</h1>
              <p className="mt-1 text-sm text-slate-500">API keys, sending providers, SMTP, webhooks, and compliance — saved securely server-side.</p>
            </div>
          </div>
          <button
            onClick={handleSave}
            disabled={saving || !dirty}
            className="h-11 rounded-lg bg-teal-600 px-5 text-sm font-black text-slate-900 dark:text-white hover:bg-teal-500 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
            {saving ? "Saving..." : saved ? "Saved" : dirty ? `Save ${Object.keys(draft).length} change(s)` : "Save settings"}
          </button>
        </div>

        {message ? (
          <div className="mt-4 rounded-lg border border-slate-300 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/60 px-4 py-3 text-sm text-slate-700 dark:text-slate-300">{message}</div>
        ) : null}

        <div className="mt-6 grid grid-cols-1 xl:grid-cols-[1fr_0.7fr] gap-5">
          <div className="space-y-5">
            {loading ? (
              <div className="rounded-lg border border-slate-300 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/35 p-6 text-sm text-slate-500">Loading settings…</div>
            ) : (
              SECTION_ORDER.map((category) => {
                const items = grouped.get(category) || [];
                if (items.length === 0) return null;
                const meta = SECTION_META[category];
                const Icon = meta.icon;
                const test = meta.provider ? testResults[meta.provider] : undefined;
                return (
                  <div key={category} className="rounded-lg border border-slate-300 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/35 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <Icon className="h-5 w-5 text-teal-300" />
                        <div>
                          <h2 className="text-base font-black text-slate-900 dark:text-slate-100">{meta.title}</h2>
                          <p className="text-[11px] text-slate-500">{meta.description}</p>
                        </div>
                      </div>
                      {meta.provider ? (
                        <button
                          onClick={() => void runTest(meta.provider!)}
                          disabled={testing === meta.provider}
                          className="h-9 px-3 rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-900 dark:text-white inline-flex items-center gap-2 shrink-0 disabled:opacity-60"
                        >
                          {testing === meta.provider ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                          Test connection
                        </button>
                      ) : null}
                    </div>

                    {test && test.message ? (
                      <div className={`mt-3 rounded-md border px-3 py-2 text-xs ${test.ok ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-200" : "border-red-400/25 bg-red-500/10 text-red-200"}`}>
                        {test.message}
                      </div>
                    ) : null}

                    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                      {items.map((item) => (
                        <SettingField key={item.key} item={item} value={draft[item.key]} onChange={(value) => setField(item.key, value)} />
                      ))}
                    </div>
                  </div>
                );
              })
            )}

            <GmailInboxCard />
          </div>

          <div className="space-y-5">
            <div className="rounded-lg border border-slate-300 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/35 p-5">
              <div className="flex items-center gap-2">
                <KeyRound className="h-5 w-5 text-teal-300" />
                <h2 className="text-base font-black text-slate-900 dark:text-slate-100">How keys are stored</h2>
              </div>
              <div className="mt-3 space-y-2 text-sm text-slate-400 leading-6">
                <p>Secrets are encrypted (AES-256-GCM) before they touch the database and are never sent back to the browser in plain text.</p>
                <p>Leave a secret field blank to keep the saved value. Type a new value to replace it; clear a non-secret field and save to revert to the server default.</p>
                <p>The <span className="text-slate-800 dark:text-slate-200">source</span> tag on each field shows whether the value comes from the database or an environment variable.</p>
              </div>
            </div>

            <div className="rounded-lg border border-slate-300 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/35 p-5">
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-red-300" />
                <h2 className="text-base font-black text-slate-900 dark:text-slate-100">Suppression List</h2>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-3">
                <input
                  value={suppressionEmail}
                  onChange={(event) => setSuppressionEmail(event.target.value)}
                  placeholder="prospect@example.com"
                  className="h-11 w-full rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-red-400"
                />
                <input
                  value={suppressionReason}
                  onChange={(event) => setSuppressionReason(event.target.value)}
                  placeholder="manual"
                  className="h-11 w-full rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-red-400"
                />
                <button
                  onClick={handleAddSuppression}
                  disabled={savingSuppression}
                  className="h-11 rounded-lg bg-red-600 px-4 text-sm font-black text-slate-900 dark:text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60 inline-flex items-center justify-center gap-2"
                >
                  {savingSuppression ? "Saving..." : "Add suppression"}
                </button>
                {suppressionMessage ? <p className="text-xs text-slate-500">{suppressionMessage}</p> : null}
              </div>
              <div className="mt-4 space-y-3">
                {suppressionEntries.length === 0 ? (
                  <p className="text-sm text-slate-500">No suppression entries yet.</p>
                ) : (
                  suppressionEntries.map((entry) => (
                    <div key={entry.id} className="rounded-lg border border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/45 p-3 text-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate font-bold text-slate-900 dark:text-slate-100">{entry.email}</div>
                          <div className="mt-1 text-xs text-slate-500">{entry.reason} / {entry.source}</div>
                        </div>
                        <span className="shrink-0 text-[11px] text-slate-500"><ClientDate value={entry.createdAt} format="date" /></span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-lg border border-slate-300 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/35 p-5">
              <div className="flex items-center gap-2">
                <Webhook className="h-5 w-5 text-cyan-300" />
                <h2 className="text-base font-black text-slate-900 dark:text-slate-100">Webhook Monitor</h2>
              </div>
              <div className="mt-4 space-y-3">
                {webhookEvents.length === 0 ? (
                  <p className="text-sm text-slate-500">No provider webhook events yet.</p>
                ) : (
                  webhookEvents.map((event) => (
                    <div key={event.id} className="rounded-lg border border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/45 p-3 text-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-bold text-slate-900 dark:text-slate-100">{event.type}</div>
                          <div className="mt-1 text-xs text-slate-500">{event.provider}{event.externalId ? ` / ${event.externalId}` : ""}</div>
                        </div>
                        <span className={`shrink-0 text-[11px] font-bold ${event.processed ? "text-emerald-300" : "text-amber-300"}`}>
                          {event.processed ? "Processed" : "Pending"}
                        </span>
                      </div>
                      <p className="mt-2 break-words text-xs leading-5 text-slate-500">{event.summary}</p>
                      <div className="mt-2 text-[11px] text-slate-600"><ClientDate value={event.createdAt} /></div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-lg border border-slate-300 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/35 p-5">
              <div className="flex items-center gap-2">
                <KeyRound className="h-5 w-5 text-teal-300" />
                <h2 className="text-base font-black text-slate-900 dark:text-slate-100">Recent Audit Log</h2>
              </div>
              <div className="mt-4 space-y-3">
                {auditLogs.length === 0 ? (
                  <p className="text-sm text-slate-500">No recent audit activity.</p>
                ) : (
                  auditLogs.map((log) => (
                    <div key={log.id} className="rounded-lg border border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/45 p-3 text-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-bold text-slate-900 dark:text-slate-100">{log.action}</div>
                          <div className="mt-1 text-xs text-slate-500">{log.entityType}{log.entityId ? ` / ${log.entityId}` : ""}</div>
                        </div>
                        <span className="text-[11px] text-slate-500"><ClientDate value={log.createdAt} /></span>
                      </div>
                      <div className="mt-2 text-xs text-slate-500">{log.user ? `${log.user.name} (${log.user.role})` : "System"}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingField({ item, value, onChange }: { item: SettingItem; value: string | undefined; onChange: (value: string) => void }) {
  const touched = value !== undefined;
  // For secret fields with a stored value, show the masked dots as a
  // placeholder so the user knows one exists; typing replaces it.
  const placeholder = item.secret && item.hasValue && !touched ? item.masked || "••••••••" : item.placeholder;
  const display = touched ? value : item.secret ? "" : item.value;

  return (
    <label className="text-xs font-bold text-slate-400">
      <div className="flex items-center justify-between">
        <span>{item.label}</span>
        <SourceTag source={item.source} />
      </div>
      <input
        type={item.secret ? "password" : "text"}
        value={display}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        autoComplete="off"
        className="mt-2 h-11 w-full rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-teal-400"
      />
      {item.hint ? <span className="mt-1 block text-[11px] font-normal text-slate-500">{item.hint}</span> : null}
    </label>
  );
}

function SourceTag({ source }: { source: SettingItem["source"] }) {
  if (source === "unset") return <span className="text-[10px] font-normal text-slate-600">not set</span>;
  const tone = source === "database" ? "text-emerald-400" : "text-amber-400";
  return <span className={`text-[10px] font-normal ${tone}`}>{source === "database" ? "saved" : "from env"}</span>;
}

// Gmail IMAP mailbox: configure inbound reply syncing. Separate from the generic
// settings registry because it has its own table, test, and sync actions.
function GmailInboxCard() {
  const [mailbox, setMailbox] = useState<MailboxConfig | null>(null);
  const [form, setForm] = useState({
    email: "",
    imapHost: "imap.gmail.com",
    imapPort: "993",
    useSsl: true,
    username: "",
    appPassword: "",
    enabled: false,
    syncIntervalSec: "60",
  });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"" | "save" | "test" | "sync">("");
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchOutbound<{ mailbox: MailboxConfig | null }>("/api/inbox/mailbox");
      if (data.mailbox) {
        setMailbox(data.mailbox);
        setForm((c) => ({
          ...c,
          email: data.mailbox!.email,
          imapHost: data.mailbox!.imapHost,
          imapPort: String(data.mailbox!.imapPort),
          useSsl: data.mailbox!.useSsl,
          username: data.mailbox!.username,
          enabled: data.mailbox!.enabled,
          syncIntervalSec: String(data.mailbox!.syncIntervalSec),
          appPassword: "",
        }));
      }
    } catch { /* backend offline */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    setBusy("save");
    setResult(null);
    try {
      const body: any = {
        email: form.email,
        imapHost: form.imapHost,
        imapPort: Number(form.imapPort) || 993,
        useSsl: form.useSsl,
        username: form.username || form.email,
        enabled: form.enabled,
        syncIntervalSec: Number(form.syncIntervalSec) || 60,
      };
      if (form.appPassword.trim()) body.appPassword = form.appPassword;
      const data = await fetchOutbound<{ mailbox: MailboxConfig }>("/api/inbox/mailbox", { method: "PATCH", body: JSON.stringify(body) });
      setMailbox(data.mailbox);
      setForm((c) => ({ ...c, appPassword: "" }));
      setResult({ ok: true, message: "Saved." });
    } catch (err: any) {
      setResult({ ok: false, message: err?.message || "Save failed." });
    } finally {
      setBusy("");
    }
  };

  const test = async () => {
    setBusy("test");
    setResult(null);
    try {
      const body: any = {
        email: form.email, imapHost: form.imapHost, imapPort: Number(form.imapPort) || 993,
        useSsl: form.useSsl, username: form.username || form.email,
      };
      if (form.appPassword.trim()) body.appPassword = form.appPassword;
      const r = await fetchOutbound<{ ok: boolean; message: string }>("/api/inbox/mailbox/test", { method: "POST", body: JSON.stringify(body) });
      setResult(r);
    } catch (err: any) {
      // fetchOutbound throws on 400; read the body for the real message.
      let msg = err?.message || "Test failed.";
      try {
        const res = await authFetch(`${process.env.NEXT_PUBLIC_OUTBOUND_API_BASE || "http://localhost:5000"}/api/inbox/mailbox/test`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: form.email, imapHost: form.imapHost, imapPort: Number(form.imapPort) || 993, useSsl: form.useSsl, username: form.username || form.email, ...(form.appPassword.trim() ? { appPassword: form.appPassword } : {}) }),
        });
        const b = await res.json();
        if (b?.message) msg = b.message;
      } catch { /* ignore */ }
      setResult({ ok: false, message: msg });
    } finally {
      setBusy("");
    }
  };

  const syncNow = async () => {
    setBusy("sync");
    setResult(null);
    try {
      const r = await fetchOutbound<SyncResult>("/api/inbox/sync", { method: "POST" });
      setResult({ ok: r.ok, message: r.ok ? `Sync complete — ${r.imported} new reply(ies), ${r.scanned} scanned.` : (r.error || "Sync failed.") });
      await load();
    } catch (err: any) {
      setResult({ ok: false, message: err?.message || "Sync failed." });
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="rounded-lg border border-slate-300 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/35 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <InboxIcon className="h-5 w-5 text-teal-300" />
          <div>
            <h2 className="text-base font-black text-slate-900 dark:text-slate-100">Gmail Inbox (IMAP)</h2>
            <p className="text-[11px] text-slate-500">Import replies from Gmail. Use an App Password (Google Account → Security → App Passwords) with IMAP enabled.</p>
          </div>
        </div>
        {mailbox ? (
          <span className={`text-[11px] font-bold ${mailbox.enabled ? "text-emerald-300" : "text-slate-500"}`}>
            {mailbox.enabled ? "Auto-sync ON" : "Auto-sync OFF"}
          </span>
        ) : null}
      </div>

      {result ? (
        <div className={`mt-3 rounded-md border px-3 py-2 text-xs ${result.ok ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-200" : "border-red-400/25 bg-red-500/10 text-red-200"}`}>
          {result.message}
        </div>
      ) : null}

      {loading ? (
        <div className="mt-4 text-sm text-slate-500">Loading…</div>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            <SmallField label="Gmail address">
              <input value={form.email} onChange={(e) => setForm((c) => ({ ...c, email: e.target.value }))} placeholder="you@gmail.com"
                className="h-10 w-full rounded-md border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-slate-100" />
            </SmallField>
            <SmallField label="Username (usually same)">
              <input value={form.username} onChange={(e) => setForm((c) => ({ ...c, username: e.target.value }))} placeholder="you@gmail.com"
                className="h-10 w-full rounded-md border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-slate-100" />
            </SmallField>
            <SmallField label="IMAP host">
              <input value={form.imapHost} onChange={(e) => setForm((c) => ({ ...c, imapHost: e.target.value }))}
                className="h-10 w-full rounded-md border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-slate-100" />
            </SmallField>
            <SmallField label="Port">
              <input value={form.imapPort} onChange={(e) => setForm((c) => ({ ...c, imapPort: e.target.value }))}
                className="h-10 w-full rounded-md border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-slate-100" />
            </SmallField>
            <SmallField label={`App Password ${mailbox?.hasPassword ? "(saved — leave blank to keep)" : ""}`}>
              <input type="password" value={form.appPassword} onChange={(e) => setForm((c) => ({ ...c, appPassword: e.target.value }))} placeholder="xxxx xxxx xxxx xxxx" autoComplete="off"
                className="h-10 w-full rounded-md border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-slate-100" />
            </SmallField>
            <SmallField label="Sync interval (seconds)">
              <input value={form.syncIntervalSec} onChange={(e) => setForm((c) => ({ ...c, syncIntervalSec: e.target.value }))}
                className="h-10 w-full rounded-md border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-slate-100" />
            </SmallField>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
              <input type="checkbox" checked={form.useSsl} onChange={(e) => setForm((c) => ({ ...c, useSsl: e.target.checked }))} className="h-4 w-4 accent-teal-500" />
              SSL (port 993)
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
              <input type="checkbox" checked={form.enabled} onChange={(e) => setForm((c) => ({ ...c, enabled: e.target.checked }))} className="h-4 w-4 accent-teal-500" />
              Auto-sync every minute
            </label>
            {mailbox?.lastSyncAt ? (
              <span className="text-[11px] text-slate-500">
                Last sync: <ClientDate value={mailbox.lastSyncAt} /> · {mailbox.totalImported} imported · {mailbox.lastSyncStatus}
              </span>
            ) : null}
          </div>

          <div className="mt-4 flex items-center gap-2">
            <button onClick={() => void save()} disabled={busy !== ""} className="h-10 px-3 rounded-lg border border-teal-400/30 bg-teal-500/15 text-sm text-teal-100 inline-flex items-center gap-2 disabled:opacity-60">
              {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
            </button>
            <button onClick={() => void test()} disabled={busy !== ""} className="h-10 px-3 rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 text-sm text-slate-700 dark:text-slate-300 inline-flex items-center gap-2 disabled:opacity-60">
              {busy === "test" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Test connection
            </button>
            <button onClick={() => void syncNow()} disabled={busy !== "" || !mailbox} className="h-10 px-3 rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 text-sm text-slate-700 dark:text-slate-300 inline-flex items-center gap-2 disabled:opacity-60">
              {busy === "sync" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />} Sync now
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function SmallField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs font-bold text-slate-400">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}
