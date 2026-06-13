"use client";

import { useCallback, useEffect, useState } from "react";
import { Layers3, RefreshCcw, Save } from "lucide-react";
import { EmptyState, MetricCard, OutboundShell } from "@/components/OutboundShell";
import { GlassCard, ScoreRing, StatusBadge } from "@/components/ui";
import { fetchOutbound, type OutboundTemplate } from "@/lib/outbound";

const INPUT =
  "mt-2 h-10 w-full rounded-lg border border-border bg-bg px-3 text-sm text-text outline-none focus:border-brand transition-colors";
const LABEL = "block text-[11px] font-bold uppercase tracking-wider text-text-muted";

const demoTemplates: OutboundTemplate[] = [
  {
    id: "demo-template",
    name: "Geo-domain first touch",
    type: "cold",
    purpose: "domain sale",
    language: "en",
    tone: "professional",
    subject: "{{geoDomain}} for {{businessName}}",
    previewText: "A relevant domain idea for your local market.",
    body: "Hello {{businessName}} team,\n\nI noticed your business is a fit for {{niche}} in {{cityState}}. I own {{geoDomain}}, and it looks like a clean fit for a focused landing page or memorable redirect.\n\nWould it be worth sending the price and transfer details?\n\nBest,\n{{senderName}}\n\n{{unsubscribeLine}}",
    followUpBody: null,
    variables: { required: ["businessName", "geoDomain", "cityState", "niche", "unsubscribeUrl"] },
    spamScore: 1,
    deliverabilityScore: 93,
    tags: ["cold", "geo-domain"],
    updatedAt: "2026-05-23T00:00:00.000Z",
  },
];

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<OutboundTemplate[]>(demoTemplates);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    name: "Custom geo-domain template",
    type: "cold",
    purpose: "domain sale",
    language: "en",
    tone: "professional",
    subject: "{{geoDomain}} for {{businessName}}",
    previewText: "A relevant domain idea for your local market.",
    body: "Hello {{businessName}} team,\n\nI noticed your business is a fit for {{niche}} in {{cityState}}. I own {{geoDomain}}, and it looks like a clean fit for a focused landing page or memorable redirect.\n\nWould it be worth sending the price and transfer details?\n\nBest,\n{{senderName}}\n\n{{unsubscribeLine}}",
    tags: "cold,geo-domain",
  });

  const load = useCallback(async () => {
    try {
      const data = await fetchOutbound<OutboundTemplate[]>("/api/outbound/templates");
      setTemplates(data);
    } catch {
      setTemplates(demoTemplates);
      setMessage("Backend offline. Showing demo template data.");
    }
  }, []);

  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      try {
        const data = await fetchOutbound<OutboundTemplate[]>("/api/outbound/templates");
        if (!active) return;
        setTemplates(data);
      } catch {
        if (!active) return;
        setTemplates(demoTemplates);
        setMessage("Backend offline. Showing demo template data.");
      }
    };

    void bootstrap();

    return () => {
      active = false;
    };
  }, []);

  const saveTemplate = async () => {
    setMessage("");
    try {
      await fetchOutbound("/api/outbound/templates", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          tags: form.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
        }),
      });
      setMessage("Template saved to the library.");
      await load();
    } catch {
      setMessage("Save failed because the backend is offline.");
    }
  };

  return (
    <OutboundShell
      title="Templates Library"
      eyebrow="Copy & Deliverability"
      subtitle="Store cold opens, follow-ups, persuasion variants, and localized templates with spam-aware scoring."
      actions={
        <button
          onClick={() => {
            setMessage("");
            void load();
          }}
          className="h-9 px-3 rounded-lg border border-border bg-surface text-sm text-text-muted hover:text-text hover:bg-surface-2 inline-flex items-center gap-2 transition-colors"
        >
          <RefreshCcw className="h-4 w-4" />
          Refresh
        </button>
      }
    >
      {message ? <div className="mb-4 rounded-lg border border-border bg-surface-2 px-4 py-3 text-sm text-text-muted">{message}</div> : null}

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard label="Templates" value={templates.length} helper="reusable copy" />
        <MetricCard label="Avg spam score" value={Math.round(templates.reduce((sum, item) => sum + item.spamScore, 0) / Math.max(1, templates.length))} helper="lower is safer" />
        <MetricCard label="Avg deliverability" value={`${Math.round(templates.reduce((sum, item) => sum + item.deliverabilityScore, 0) / Math.max(1, templates.length))}%`} helper="copy health" />
        <MetricCard label="AI-ready" value={templates.filter((template) => template.variables).length} helper="variables mapped" />
      </section>

      <section className="mt-6 grid grid-cols-1 xl:grid-cols-[0.8fr_1.2fr] gap-5">
        <GlassCard className="p-5">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void saveTemplate();
            }}
          >
            <div className="flex items-center gap-2">
              <Save className="h-5 w-5 text-brand" />
              <h2 className="text-base font-black text-text">Save Template</h2>
            </div>

            <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                ["name", "Template name"],
                ["type", "Type"],
                ["purpose", "Purpose"],
                ["language", "Language"],
                ["tone", "Tone"],
              ].map(([field, label]) => (
                <label key={field} className={LABEL}>
                  {label}
                  <input
                    value={form[field as keyof typeof form]}
                    onChange={(event) => setForm((current) => ({ ...current, [field]: event.target.value }))}
                    className={INPUT}
                  />
                </label>
              ))}
            </div>

            <label className={`mt-4 ${LABEL}`}>
              Subject
              <input
                value={form.subject}
                onChange={(event) => setForm((current) => ({ ...current, subject: event.target.value }))}
                className={INPUT}
              />
            </label>

            <label className={`mt-4 ${LABEL}`}>
              Preview text
              <input
                value={form.previewText}
                onChange={(event) => setForm((current) => ({ ...current, previewText: event.target.value }))}
                className={INPUT}
              />
            </label>

            <label className={`mt-4 ${LABEL}`}>
              Body
              <textarea
                value={form.body}
                onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))}
                className="mt-2 h-56 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm leading-6 text-text outline-none focus:border-brand transition-colors"
              />
            </label>

            <label className={`mt-4 ${LABEL}`}>
              Tags
              <input
                value={form.tags}
                onChange={(event) => setForm((current) => ({ ...current, tags: event.target.value }))}
                className={INPUT}
              />
            </label>

            <button className="mt-5 h-11 w-full rounded-lg bg-brand text-sm font-bold text-bg hover:bg-brand-hover shadow-[0_0_12px_rgba(20,184,166,0.3)] inline-flex items-center justify-center gap-2 transition-colors">
              <Save className="h-4 w-4" />
              Save template
            </button>
          </form>
        </GlassCard>

        <GlassCard className="p-5">
          <div className="flex items-center gap-2">
            <Layers3 className="h-5 w-5 text-brand" />
            <h2 className="text-base font-black text-text">Template Library</h2>
          </div>
          <div className="mt-5 space-y-4">
            {templates.length === 0 ? (
              <EmptyState title="No templates" body="Generate a template or save one from the AI writer." />
            ) : (
              templates.map((template) => (
                <article key={template.id} className="rounded-lg border border-border bg-surface-2 p-4 transition-colors hover:border-brand/40">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-black text-text">{template.name}</h3>
                      <p className="mt-1 text-xs text-text-muted">{template.subject}</p>
                    </div>
                    <StatusBadge status={template.type} />
                  </div>
                  <p className="mt-3 text-sm leading-6 text-text-muted line-clamp-4 whitespace-pre-wrap">{template.body}</p>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                    <div className="rounded-lg border border-border bg-surface p-3">
                      <div className="text-text-muted">Spam score</div>
                      <div className="mt-1 font-black text-text">{template.spamScore}/10</div>
                    </div>
                    <div className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3">
                      <ScoreRing score={template.deliverabilityScore} size="sm" />
                      <div>
                        <div className="text-text-muted">Deliverability</div>
                        <div className="mt-1 font-black text-success">{template.deliverabilityScore}/100</div>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {template.tags.map((tag) => (
                      <span key={tag} className="rounded-full border border-border bg-surface px-2 py-1 text-[11px] text-text-muted">
                        {tag}
                      </span>
                    ))}
                  </div>
                </article>
              ))
            )}
          </div>
        </GlassCard>
      </section>
    </OutboundShell>
  );
}
