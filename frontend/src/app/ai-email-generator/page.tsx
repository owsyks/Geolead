"use client";

import { useEffect, useState } from "react";
import { Bot, Languages, Mail, Save, Sparkles } from "lucide-react";
import { EmptyState, MetricCard, OutboundShell } from "@/components/OutboundShell";
import { DomainSelector } from "@/components/DomainSelector";
import { useDomainContext } from "@/lib/domainContext";
import { fetchOutbound, type GeneratedOutboundEmail } from "@/lib/outbound";

const rewriteActions = [
  { action: "shorter", label: "Make shorter" },
  { action: "professional", label: "More professional" },
  { action: "persuasive", label: "More persuasive" },
  { action: "friendly", label: "More friendly" },
] as const;

export default function AiEmailGeneratorPage() {
  const { activeDomain, activeDomainId } = useDomainContext();
  // The portfolio domain is the source of truth: it fills the domain, category,
  // niche, and city. No business name — the AI writes a domain-for-sale pitch
  // that personalizes per recipient via the {{businessName}} merge token.
  const [form, setForm] = useState({
    geoDomain: "",
    category: "",
    niche: "",
    cityState: "",
    senderName: "",
    website: "",
    painPoints: "",
    tone: "professional",
    language: "en",
    variant: "cold",
  });
  const [result, setResult] = useState<GeneratedOutboundEmail | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const updateField = (field: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  // When the active portfolio domain changes, hydrate the form from the domain's
  // recognized intelligence (name, category, niche, city) so the user never
  // types these by hand.
  useEffect(() => {
    if (!activeDomain) return;
    setForm((current) => ({
      ...current,
      geoDomain: activeDomain.name,
      category: activeDomain.category || activeDomain.industry || current.category,
      niche: activeDomain.niche || activeDomain.industry || current.niche,
      cityState: [activeDomain.city, activeDomain.state].filter(Boolean).join(", ") || current.cityState,
    }));
  }, [activeDomain]);

  const generate = async () => {
    if (!activeDomainId && !form.geoDomain) {
      setMessage("Select a domain from your portfolio first.");
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const data = await fetchOutbound<GeneratedOutboundEmail>("/api/outbound/generate", {
        method: "POST",
        body: JSON.stringify({ ...form, domainId: activeDomainId || undefined }),
      });
      setResult(data);
    } catch {
      const signOff = form.senderName.trim() || "{{senderName}}";
      setResult({
        subjectLine: `${form.geoDomain} — available for acquisition`,
        previewText: `A practical domain idea for ${form.niche || form.category || "your market"}.`,
        body: `Hi there,\n\nI own ${form.geoDomain}, an exact-match geo-domain for ${form.niche || form.category || "your market"}${form.cityState ? ` in ${form.cityState}` : ""}. It is a strong fit for a focused landing page, paid search campaign, or memorable redirect.\n\nWould it be worth sending over the price and transfer details?\n\nBest,\n${signOff}`,
        followUps: [
          `Hi there,\n\nFollowing up on ${form.geoDomain}. If useful, I can send price and transfer details.\n\n${signOff}`,
          `Quick bump on ${form.geoDomain}. Should I close the loop or send the details?`,
          `Last note from me on ${form.geoDomain}. I will not follow up again unless this is relevant.`,
        ],
        variables: ["{{geoDomain}}", "{{cityState}}", "{{niche}}"],
        spamScore: 1,
        deliverabilityScore: 93,
        abSubjects: [
          `${form.geoDomain} — available for acquisition`,
          `Question about ${form.geoDomain}`,
          `${form.cityState || "Local"} domain for ${form.niche || form.category}`,
        ],
        websiteIntel: {
          sourceStatus: "LOCAL_FALLBACK",
          summary: "Backend unavailable. Local generation is showing compliant fallback copy.",
          detectedNiche: form.niche,
          services: [],
          slogans: [],
          painPointSignals: form.painPoints.split(",").map((item) => item.trim()).filter(Boolean),
        },
        complianceNotes: [
          "Include truthful sender identity, physical address, and an unsubscribe link.",
          "Stop the sequence after replies, bounces, complaints, or opt-outs.",
        ],
      });
      setMessage("Backend offline. Showing local fallback copy.");
    } finally {
      setLoading(false);
    }
  };

  const rewrite = async (action: (typeof rewriteActions)[number]["action"]) => {
    if (!result) return;
    try {
      const data = await fetchOutbound<{ body: string; spamScore: number }>("/api/outbound/rewrite", {
        method: "POST",
        body: JSON.stringify({ body: result.body, action }),
      });
      setResult({ ...result, body: data.body, spamScore: data.spamScore });
    } catch {
      setMessage("Rewrite failed because the backend is offline.");
    }
  };

  const saveTemplate = async () => {
    if (!result) return;
    setSaving(true);
    setMessage("");
    try {
      await fetchOutbound("/api/outbound/templates", {
        method: "POST",
        body: JSON.stringify({
          name: `${form.geoDomain} ${form.variant} template`,
          type: form.variant,
          purpose: "geo-domain outreach",
          language: form.language,
          tone: form.tone,
          subject: result.subjectLine,
          previewText: result.previewText,
          body: result.body,
          tags: ["ai-generated", "geo-domain"],
        }),
      });
      setMessage("Template saved to the library.");
    } catch {
      setMessage("Template save failed because the backend is offline.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <OutboundShell
      title="AI Email Generator"
      subtitle="Generate compliant cold emails, follow-ups, A/B subjects, multilingual copy, and deliverability-aware rewrites."
      actions={
        <button
          onClick={generate}
          disabled={loading}
          className="h-10 px-4 rounded-lg bg-indigo-600 text-sm font-bold text-white hover:bg-indigo-500 disabled:opacity-60 inline-flex items-center gap-2"
        >
          <Sparkles className="h-4 w-4" />
          {loading ? "Generating..." : "Generate"}
        </button>
      }
    >
      {message ? (
        <div className="mb-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/60 px-4 py-3 text-sm text-slate-700 dark:text-slate-300">
          {message}
        </div>
      ) : null}

      <section className="grid grid-cols-1 xl:grid-cols-[0.9fr_1.1fr] gap-5">
        <form
          className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/35 p-5"
          onSubmit={(event) => {
            event.preventDefault();
            void generate();
          }}
        >
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-indigo-300" />
            <h2 className="text-base font-black text-slate-900 dark:text-slate-100">Personalization Inputs</h2>
          </div>

          <div className="mt-4">
            <DomainSelector
              label="Domain to pitch (from portfolio)"
              emptyAction={{ label: "Open portfolio", href: "/portfolio" }}
            />
            {activeDomain ? (
              <p className="mt-2 text-[11px] text-emerald-300">
                Recognized from portfolio — category “{activeDomain.category || activeDomain.industry || "—"}” in{" "}
                “{[activeDomain.city, activeDomain.state].filter(Boolean).join(", ") || "unknown location"}”. The AI
                writes a domain-for-sale pitch and personalizes each recipient with the {"{{businessName}}"} token.
              </p>
            ) : (
              <p className="mt-2 text-[11px] text-amber-300">
                Pick a domain from your portfolio — its category and city auto-fill the email.
              </p>
            )}
          </div>

          <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              ["geoDomain", "Geo domain"],
              ["category", "Category"],
              ["niche", "Niche"],
              ["cityState", "City/state"],
              ["senderName", "Sender name (signs the email)"],
              ["website", "Reference website (optional)"],
            ].map(([field, label]) => (
              <label key={field} className="text-xs font-bold text-slate-400">
                {label}
                <input
                  value={form[field as keyof typeof form]}
                  onChange={(event) => updateField(field as keyof typeof form, event.target.value)}
                  className="mt-2 h-10 w-full rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-400"
                />
              </label>
            ))}
          </div>

          <label className="mt-4 block text-xs font-bold text-slate-400">
            Pain points (optional)
            <textarea
              value={form.painPoints}
              onChange={(event) => updateField("painPoints", event.target.value)}
              className="mt-2 h-20 w-full rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-400"
            />
          </label>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            <label className="text-xs font-bold text-slate-400">
              Tone
              <select
                value={form.tone}
                onChange={(event) => updateField("tone", event.target.value)}
                className="mt-2 h-10 w-full rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-400"
              >
                <option value="professional">Professional</option>
                <option value="friendly">Friendly</option>
                <option value="persuasive">Persuasive</option>
                <option value="concise">Concise</option>
              </select>
            </label>
            <label className="text-xs font-bold text-slate-400">
              Variant
              <select
                value={form.variant}
                onChange={(event) => updateField("variant", event.target.value)}
                className="mt-2 h-10 w-full rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-400"
              >
                <option value="cold">Cold outreach</option>
                <option value="follow_up">Follow-up</option>
                <option value="short">Short</option>
                <option value="long">Long</option>
                <option value="persuasive">Persuasive</option>
                <option value="friendly">Friendly</option>
              </select>
            </label>
            <label className="text-xs font-bold text-slate-400">
              Language
              <div className="mt-2 flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 px-3">
                <Languages className="h-4 w-4 text-slate-500" />
                <input
                  value={form.language}
                  onChange={(event) => updateField("language", event.target.value)}
                  className="h-10 w-full bg-transparent text-sm text-slate-100 outline-none"
                />
              </div>
            </label>
          </div>
        </form>

        <section className="space-y-5">
          {result ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <MetricCard label="Spam score" value={`${result.spamScore}/10`} helper="lower is safer" />
                <MetricCard label="Deliverability" value={`${result.deliverabilityScore}/100`} helper="copy health" />
                <MetricCard label="A/B subjects" value={result.abSubjects.length} helper="ready to test" />
                <MetricCard label="Follow-ups" value={result.followUps.length} helper="sequence drafts" />
              </div>

              <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/35 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-black text-slate-100">Generated Email</h2>
                    <p className="mt-1 text-sm text-slate-500">Subject, preview text, body, and compliance notes.</p>
                  </div>
                  <button
                    onClick={saveTemplate}
                    disabled={saving}
                    className="h-9 px-3 rounded-lg border border-emerald-400/25 bg-emerald-500/10 text-sm font-bold text-emerald-200 hover:bg-emerald-500/15 inline-flex items-center gap-2"
                  >
                    <Save className="h-4 w-4" />
                    {saving ? "Saving..." : "Save Template"}
                  </button>
                </div>

                <div className="mt-5 space-y-4">
                  <div>
                    <div className="text-xs font-bold text-slate-500">Subject line</div>
                    <input
                      type="text"
                      value={result.subjectLine}
                      onChange={(event) => setResult({ ...result, subjectLine: event.target.value })}
                      className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950/50 p-3 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-400"
                    />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-500">Preview text</div>
                    <input
                      type="text"
                      value={result.previewText}
                      onChange={(event) => setResult({ ...result, previewText: event.target.value })}
                      className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950/50 p-3 text-sm text-slate-700 dark:text-slate-300 outline-none focus:border-indigo-400"
                    />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-500">Body</div>
                    <textarea
                      value={result.body}
                      onChange={(event) => setResult({ ...result, body: event.target.value })}
                      className="mt-1 h-72 w-full rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 p-4 text-sm leading-6 text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-400"
                    />
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {rewriteActions.map((item) => (
                    <button
                      key={item.action}
                      onClick={() => void rewrite(item.action)}
                      className="h-8 px-3 rounded-lg border border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-xs font-bold text-slate-700 dark:text-slate-300 hover:text-indigo-200"
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/35 p-5">
                  <h3 className="text-sm font-black text-slate-900 dark:text-slate-100">A/B Subject Lines</h3>
                  <p className="mt-1 text-[11px] text-slate-500">Click to use as subject</p>
                  <div className="mt-3 space-y-2">
                    {result.abSubjects.map((subject) => (
                      <button
                        key={subject}
                        onClick={() => setResult({ ...result, subjectLine: subject })}
                        className={`w-full text-left rounded-lg border p-3 text-sm transition-colors ${
                          result.subjectLine === subject
                            ? 'border-indigo-500/50 bg-indigo-500/10 text-indigo-200'
                            : 'border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/45 text-slate-700 dark:text-slate-300 hover:border-indigo-500/30 hover:bg-indigo-500/5'
                        }`}
                      >
                        {subject}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/35 p-5">
                  <h3 className="text-sm font-black text-slate-900 dark:text-slate-100">Follow-up Suggestions</h3>
                  <p className="mt-1 text-[11px] text-slate-500">Click to edit</p>
                  <div className="mt-3 space-y-2">
                    {result.followUps.map((followUp, index) => (
                      <textarea
                        key={index}
                        value={followUp}
                        onChange={(event) => {
                          const newFollowUps = [...result.followUps];
                          newFollowUps[index] = event.target.value;
                          setResult({ ...result, followUps: newFollowUps });
                        }}
                        className="w-full rounded-lg border border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/45 p-3 text-xs leading-5 text-slate-400 outline-none focus:border-indigo-400 resize-y min-h-[80px]"
                      />
                    ))}
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/35 p-5">
                  <h3 className="text-sm font-black text-slate-900 dark:text-slate-100">Website Intel</h3>
                  <p className="mt-4 text-sm leading-6 text-slate-400">{result.websiteIntel.summary}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {result.variables.map((variable) => (
                      <span key={variable} className="rounded-full border border-slate-400 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2 py-1 text-[11px] text-slate-400">
                        {variable}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-emerald-400/20 bg-emerald-500/10 p-5">
                <div className="flex items-center gap-2 text-sm font-black text-emerald-200">
                  <Mail className="h-4 w-4" />
                  Compliance Guardrails
                </div>
                <ul className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-emerald-100/90">
                  {result.complianceNotes.map((note) => (
                    <li key={note} className="rounded-lg border border-emerald-400/15 bg-emerald-950/20 p-3">
                      {note}
                    </li>
                  ))}
                </ul>
              </div>
            </>
          ) : (
            <EmptyState
              title="Generate your first outbound email"
              body="Add lead context, choose tone and variant, then generate personalized copy with follow-ups and A/B subject lines."
            />
          )}
        </section>
      </section>
    </OutboundShell>
  );
}
