"use client";

import { useCallback, useEffect, useState } from "react";
import { Layers3, RefreshCcw, Save } from "lucide-react";
import { EmptyState, MetricCard, OutboundShell, StatusBadge } from "@/components/OutboundShell";
import { fetchOutbound, type OutboundTemplate } from "@/lib/outbound";

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
      subtitle="Store cold opens, follow-ups, persuasion variants, and localized templates with spam-aware scoring."
      actions={
        <button
          onClick={() => {
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

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard label="Templates" value={templates.length} helper="reusable copy" />
        <MetricCard label="Avg spam score" value={Math.round(templates.reduce((sum, item) => sum + item.spamScore, 0) / Math.max(1, templates.length))} helper="lower is safer" />
        <MetricCard label="Avg deliverability" value={`${Math.round(templates.reduce((sum, item) => sum + item.deliverabilityScore, 0) / Math.max(1, templates.length))}%`} helper="copy health" />
        <MetricCard label="AI-ready" value={templates.filter((template) => template.variables).length} helper="variables mapped" />
      </section>

      <section className="mt-6 grid grid-cols-1 xl:grid-cols-[0.8fr_1.2fr] gap-5">
        <form
          className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/35 p-5"
          onSubmit={(event) => {
            event.preventDefault();
            void saveTemplate();
          }}
        >
          <div className="flex items-center gap-2">
            <Save className="h-5 w-5 text-indigo-300" />
            <h2 className="text-base font-black text-slate-900 dark:text-slate-100">Save Template</h2>
          </div>

          <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              ["name", "Template name"],
              ["type", "Type"],
              ["purpose", "Purpose"],
              ["language", "Language"],
              ["tone", "Tone"],
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
          </div>

          <label className="mt-4 block text-xs font-bold text-slate-400">
            Subject
            <input
              value={form.subject}
              onChange={(event) => setForm((current) => ({ ...current, subject: event.target.value }))}
              className="mt-2 h-10 w-full rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-400"
            />
          </label>

          <label className="mt-4 block text-xs font-bold text-slate-400">
            Preview text
            <input
              value={form.previewText}
              onChange={(event) => setForm((current) => ({ ...current, previewText: event.target.value }))}
              className="mt-2 h-10 w-full rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-400"
            />
          </label>

          <label className="mt-4 block text-xs font-bold text-slate-400">
            Body
            <textarea
              value={form.body}
              onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))}
              className="mt-2 h-56 w-full rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 py-2 text-sm leading-6 text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-400"
            />
          </label>

          <label className="mt-4 block text-xs font-bold text-slate-400">
            Tags
            <input
              value={form.tags}
              onChange={(event) => setForm((current) => ({ ...current, tags: event.target.value }))}
              className="mt-2 h-10 w-full rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-400"
            />
          </label>

          <button className="mt-5 h-11 w-full rounded-lg bg-indigo-600 text-sm font-black text-white hover:bg-indigo-500 inline-flex items-center justify-center gap-2">
            <Save className="h-4 w-4" />
            Save template
          </button>
        </form>

        <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/35 p-5">
          <div className="flex items-center gap-2">
            <Layers3 className="h-5 w-5 text-indigo-300" />
            <h2 className="text-base font-black text-slate-900 dark:text-slate-100">Template Library</h2>
          </div>
          <div className="mt-5 space-y-4">
            {templates.length === 0 ? (
              <EmptyState title="No templates" body="Generate a template or save one from the AI writer." />
            ) : (
              templates.map((template) => (
                <article key={template.id} className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-black text-slate-900 dark:text-slate-100">{template.name}</h3>
                      <p className="mt-1 text-xs text-slate-500">{template.subject}</p>
                    </div>
                    <StatusBadge value={template.type} />
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-400 line-clamp-4 whitespace-pre-wrap">{template.body}</p>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                    <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/60 p-3">
                      <div className="text-slate-500">Spam score</div>
                      <div className="mt-1 font-black text-slate-900 dark:text-slate-100">{template.spamScore}/10</div>
                    </div>
                    <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/60 p-3">
                      <div className="text-slate-500">Deliverability</div>
                      <div className="mt-1 font-black text-emerald-300">{template.deliverabilityScore}/100</div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {template.tags.map((tag) => (
                      <span key={tag} className="rounded-full border border-slate-400 dark:border-slate-700 bg-slate-100 dark:bg-slate-900 px-2 py-1 text-[11px] text-slate-400">
                        {tag}
                      </span>
                    ))}
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      </section>
    </OutboundShell>
  );
}
