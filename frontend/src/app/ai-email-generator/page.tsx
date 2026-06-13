"use client";

import { useEffect, useState } from "react";
import { Bot, Languages, Mail, Save, Sparkles } from "lucide-react";
import { EmptyState, MetricCard, OutboundShell } from "@/components/OutboundShell";
import { GlassCard, ScoreRing } from "@/components/ui";
import { DomainSelector } from "@/components/DomainSelector";
import { useDomainContext } from "@/lib/domainContext";
import { fetchOutbound, type GeneratedOutboundEmail } from "@/lib/outbound";

const INPUT = "mt-2 h-10 w-full rounded-lg border border-border bg-bg px-3 text-sm text-text outline-none focus:border-brand transition-colors";
const LABEL = "block text-[11px] font-bold uppercase tracking-wider text-text-muted";

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
      eyebrow="Copy Engine"
      subtitle="Generate compliant cold emails, follow-ups, A/B subjects, multilingual copy, and deliverability-aware rewrites."
      actions={
        <button
          onClick={generate}
          disabled={loading}
          className="h-10 px-4 rounded-lg bg-brand text-sm font-bold text-bg hover:bg-brand-hover disabled:opacity-60 inline-flex items-center gap-2 shadow-[0_0_12px_rgba(20,184,166,0.3)] transition-colors"
        >
          <Sparkles className={`h-4 w-4 ${loading ? "animate-pulse" : ""}`} />
          {loading ? "Generating..." : "Generate"}
        </button>
      }
    >
      {message ? (
        <div className="mb-4 rounded-lg border border-border bg-surface-2 px-4 py-3 text-sm text-text-muted">
          {message}
        </div>
      ) : null}

      <section className="grid grid-cols-1 xl:grid-cols-[0.9fr_1.1fr] gap-5">
        <GlassCard className="p-5">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void generate();
          }}
        >
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-brand" />
            <h2 className="text-base font-black text-text">Personalization Inputs</h2>
          </div>

          <div className="mt-4">
            <DomainSelector
              label="Domain to pitch (from portfolio)"
              emptyAction={{ label: "Open portfolio", href: "/portfolio" }}
            />
            {activeDomain ? (
              <p className="mt-2 text-[11px] text-success">
                Recognized from portfolio — category “{activeDomain.category || activeDomain.industry || "—"}” in{" "}
                “{[activeDomain.city, activeDomain.state].filter(Boolean).join(", ") || "unknown location"}”. The AI
                writes a domain-for-sale pitch and personalizes each recipient with the {"{{businessName}}"} token.
              </p>
            ) : (
              <p className="mt-2 text-[11px] text-copper">
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
              <label key={field} className={LABEL}>
                {label}
                <input
                  value={form[field as keyof typeof form]}
                  onChange={(event) => updateField(field as keyof typeof form, event.target.value)}
                  className={INPUT}
                />
              </label>
            ))}
          </div>

          <label className={`mt-4 ${LABEL}`}>
            Pain points (optional)
            <textarea
              value={form.painPoints}
              onChange={(event) => updateField("painPoints", event.target.value)}
              className="mt-2 h-20 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-brand resize-none transition-colors"
            />
          </label>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            <label className={LABEL}>
              Tone
              <select
                value={form.tone}
                onChange={(event) => updateField("tone", event.target.value)}
                className={INPUT}
              >
                <option value="professional">Professional</option>
                <option value="friendly">Friendly</option>
                <option value="persuasive">Persuasive</option>
                <option value="concise">Concise</option>
              </select>
            </label>
            <label className={LABEL}>
              Variant
              <select
                value={form.variant}
                onChange={(event) => updateField("variant", event.target.value)}
                className={INPUT}
              >
                <option value="cold">Cold outreach</option>
                <option value="follow_up">Follow-up</option>
                <option value="short">Short</option>
                <option value="long">Long</option>
                <option value="persuasive">Persuasive</option>
                <option value="friendly">Friendly</option>
              </select>
            </label>
            <label className={LABEL}>
              Language
              <div className="mt-2 flex items-center gap-2 rounded-lg border border-border bg-bg px-3 focus-within:border-brand transition-colors">
                <Languages className="h-4 w-4 text-text-muted" />
                <input
                  value={form.language}
                  onChange={(event) => updateField("language", event.target.value)}
                  className="h-10 w-full bg-transparent text-sm text-text outline-none"
                />
              </div>
            </label>
          </div>
        </form>
        </GlassCard>

        <section className="space-y-5">
          {result ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <GlassCard className="p-5 flex items-center gap-3">
                  <ScoreRing score={Math.max(0, 100 - result.spamScore * 10)} size="sm" />
                  <div className="min-w-0">
                    <div className="text-[11px] uppercase tracking-[0.12em] text-text-muted font-bold">Spam score</div>
                    <div className="text-[20px] font-[800] font-mono tabular-nums leading-none text-text">{result.spamScore}/10</div>
                    <div className="text-xs text-text-muted">lower is safer</div>
                  </div>
                </GlassCard>
                <GlassCard className="p-5 flex items-center gap-3">
                  <ScoreRing score={result.deliverabilityScore} size="sm" />
                  <div className="min-w-0">
                    <div className="text-[11px] uppercase tracking-[0.12em] text-text-muted font-bold">Deliverability</div>
                    <div className="text-[20px] font-[800] font-mono tabular-nums leading-none text-text">{result.deliverabilityScore}/100</div>
                    <div className="text-xs text-text-muted">copy health</div>
                  </div>
                </GlassCard>
                <MetricCard label="A/B subjects" value={result.abSubjects.length} helper="ready to test" />
                <MetricCard label="Follow-ups" value={result.followUps.length} helper="sequence drafts" />
              </div>

              <GlassCard className="p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-black text-text">Generated Email</h2>
                    <p className="mt-1 text-sm text-text-muted">Subject, preview text, body, and compliance notes.</p>
                  </div>
                  <button
                    onClick={saveTemplate}
                    disabled={saving}
                    className="h-9 px-3 rounded-lg border border-success/25 bg-success/10 text-sm font-bold text-success hover:bg-success/15 inline-flex items-center gap-2 transition-colors disabled:opacity-60"
                  >
                    <Save className="h-4 w-4" />
                    {saving ? "Saving..." : "Save Template"}
                  </button>
                </div>

                <div className="mt-5 space-y-4">
                  <div>
                    <div className={LABEL}>Subject line</div>
                    <input
                      type="text"
                      value={result.subjectLine}
                      onChange={(event) => setResult({ ...result, subjectLine: event.target.value })}
                      className="mt-2 w-full rounded-lg border border-border bg-bg p-3 text-sm text-text outline-none focus:border-brand transition-colors"
                    />
                  </div>
                  <div>
                    <div className={LABEL}>Preview text</div>
                    <input
                      type="text"
                      value={result.previewText}
                      onChange={(event) => setResult({ ...result, previewText: event.target.value })}
                      className="mt-2 w-full rounded-lg border border-border bg-bg p-3 text-sm text-text-muted outline-none focus:border-brand transition-colors"
                    />
                  </div>
                  <div>
                    <div className={LABEL}>Body</div>
                    <textarea
                      value={result.body}
                      onChange={(event) => setResult({ ...result, body: event.target.value })}
                      className="mt-2 h-72 w-full rounded-lg border border-border bg-bg p-4 text-sm leading-6 text-text outline-none focus:border-brand resize-y transition-colors"
                    />
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {rewriteActions.map((item) => (
                    <button
                      key={item.action}
                      onClick={() => void rewrite(item.action)}
                      className="h-8 px-3 rounded-lg border border-border bg-surface text-xs font-bold text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </GlassCard>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                <GlassCard className="p-5">
                  <h3 className="text-sm font-black text-text">A/B Subject Lines</h3>
                  <p className="mt-1 text-[11px] text-text-muted">Click to use as subject</p>
                  <div className="mt-3 space-y-2">
                    {result.abSubjects.map((subject) => (
                      <button
                        key={subject}
                        onClick={() => setResult({ ...result, subjectLine: subject })}
                        className={`w-full text-left rounded-lg border p-3 text-sm transition-colors ${
                          result.subjectLine === subject
                            ? 'border-brand/50 bg-brand-soft text-brand'
                            : 'border-border bg-bg text-text-muted hover:border-brand/30 hover:bg-brand-soft'
                        }`}
                      >
                        {subject}
                      </button>
                    ))}
                  </div>
                </GlassCard>

                <GlassCard className="p-5">
                  <h3 className="text-sm font-black text-text">Follow-up Suggestions</h3>
                  <p className="mt-1 text-[11px] text-text-muted">Click to edit</p>
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
                        className="w-full rounded-lg border border-border bg-bg p-3 text-xs leading-5 text-text-muted outline-none focus:border-brand resize-y min-h-[80px] transition-colors"
                      />
                    ))}
                  </div>
                </GlassCard>

                <GlassCard className="p-5">
                  <h3 className="text-sm font-black text-text">Website Intel</h3>
                  <p className="mt-4 text-sm leading-6 text-text-muted">{result.websiteIntel.summary}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {result.variables.map((variable) => (
                      <span key={variable} className="rounded-full border border-border bg-bg px-2 py-1 text-[11px] text-text-muted font-mono">
                        {variable}
                      </span>
                    ))}
                  </div>
                </GlassCard>
              </div>

              <div className="rounded-lg border border-success/20 bg-success/10 p-5">
                <div className="flex items-center gap-2 text-sm font-black text-success">
                  <Mail className="h-4 w-4" />
                  Compliance Guardrails
                </div>
                <ul className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-success/90">
                  {result.complianceNotes.map((note) => (
                    <li key={note} className="rounded-lg border border-success/15 bg-success/5 p-3">
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
