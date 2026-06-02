"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, RefreshCcw, TrendingUp } from "lucide-react";
import { EmptyState, MetricCard, OutboundShell, StatusBadge } from "@/components/OutboundShell";
import { ClientDate } from "@/lib/ClientDate";
import { fetchOutbound, type OutboundAnalytics } from "@/lib/outbound";

const demoAnalytics: OutboundAnalytics = {
  overview: {
    campaigns: 3,
    activeCampaigns: 1,
    queued: 18,
    sent: 142,
    openRate: 47.2,
    clickRate: 9.4,
    replyRate: 6.1,
    bounceRate: 1.4,
    unsubscribeRate: 0.8,
  },
  campaigns: [],
  snapshots: [
    { id: "d1", date: "2026-05-19T00:00:00.000Z", sent: 18, delivered: 18, opens: 8, clicks: 2, replies: 1, positiveReplies: 1, negativeReplies: 0, bounces: 0, unsubscribes: 0, complaints: 0, engagementScore: 56, deliverabilityScore: 82 },
    { id: "d2", date: "2026-05-20T00:00:00.000Z", sent: 32, delivered: 31, opens: 15, clicks: 3, replies: 2, positiveReplies: 1, negativeReplies: 1, bounces: 1, unsubscribes: 0, complaints: 0, engagementScore: 64, deliverabilityScore: 80 },
    { id: "d3", date: "2026-05-21T00:00:00.000Z", sent: 41, delivered: 40, opens: 22, clicks: 5, replies: 3, positiveReplies: 2, negativeReplies: 0, bounces: 0, unsubscribes: 1, complaints: 0, engagementScore: 72, deliverabilityScore: 78 },
  ],
  topTemplates: [
    { id: "t1", name: "Geo-domain first touch", subject: "{{geoDomain}} for {{businessName}}", spamScore: 1, deliverabilityScore: 93, tags: ["cold"], type: "cold" },
    { id: "t2", name: "Friendly follow-up", subject: "Following up on {{geoDomain}}", spamScore: 1, deliverabilityScore: 92, tags: ["follow-up"], type: "follow_up" },
  ],
  bestSubjectLines: [
    { subject: "TexasCarVendor.com for Texas Auto Sales", sent: 48 },
    { subject: "Question about TexasCarVendor.com", sent: 31 },
  ],
  sendTimeSuggestions: [
    { label: "Tuesday 9:30 AM local", confidence: 88 },
    { label: "Wednesday 10:15 AM local", confidence: 82 },
    { label: "Thursday 2:10 PM local", confidence: 74 },
  ],
  domainRecommendations: [
    {
      domain: "TexasCarVendor.com",
      niche: "auto sales",
      cityState: "Texas",
      confidence: 89,
      reason: "18 qualified leads match auto sales in Texas; average domain fit is 86/100.",
      leadCount: 18,
      exampleLead: "Texas Auto Sales",
    },
    {
      domain: "DallasRoofingQuotes.com",
      niche: "roofing services",
      cityState: "Dallas, TX",
      confidence: 81,
      reason: "Local service leads show strong exact-match domain fit and low bounce risk.",
      leadCount: 11,
      exampleLead: "North Dallas Roofing",
    },
  ],
  insights: [
    "Prioritize leads that opened and clicked before sending the second follow-up.",
    "Pause senders if bounce rate exceeds 5% or complaint rate exceeds 0.1%.",
    "Use shorter first-touch emails for local service leads.",
  ],
};

export default function AnalyticsPage() {
  const [analytics, setAnalytics] = useState<OutboundAnalytics>(demoAnalytics);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await fetchOutbound<OutboundAnalytics>("/api/outbound/analytics");
      setAnalytics(data);
    } catch {
      setAnalytics(demoAnalytics);
      setMessage("Backend offline. Showing demo analytics data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      try {
        const data = await fetchOutbound<OutboundAnalytics>("/api/outbound/analytics");
        if (!active) return;
        setAnalytics(data);
      } catch {
        if (!active) return;
        setAnalytics(demoAnalytics);
        setMessage("Backend offline. Showing demo analytics data.");
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

  const maxSent = useMemo(
    () => Math.max(1, ...analytics.snapshots.map((snapshot) => snapshot.sent)),
    [analytics.snapshots]
  );
  const forecast = Math.round(
    analytics.overview.openRate * 0.28 +
      analytics.overview.clickRate * 1.6 +
      analytics.overview.replyRate * 3 -
      analytics.overview.bounceRate * 2
  );

  return (
    <OutboundShell
      title="Analytics Center"
      subtitle="Track opens, clicks, replies, bounces, unsubscribes, sender health, and AI campaign recommendations."
      actions={
        <button
          onClick={() => {
            setLoading(true);
            setMessage("");
            void load();
          }}
          className="h-10 px-3 rounded-lg border border-slate-800 bg-slate-900/70 text-sm text-slate-300 hover:text-white inline-flex items-center gap-2"
        >
          <RefreshCcw className="h-4 w-4" />
          Refresh
        </button>
      }
    >
      {message ? <div className="mb-4 rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm text-slate-300">{message}</div> : null}

      <section className="grid grid-cols-2 xl:grid-cols-6 gap-3">
        <MetricCard label="Sent" value={analytics.overview.sent} helper={`${analytics.overview.queued} queued`} />
        <MetricCard label="Open rate" value={`${analytics.overview.openRate}%`} helper="pixel tracked" />
        <MetricCard label="CTR" value={`${analytics.overview.clickRate}%`} helper="redirect tracked" />
        <MetricCard label="Reply rate" value={`${analytics.overview.replyRate}%`} helper="webhook + inbox" />
        <MetricCard label="Bounce rate" value={`${analytics.overview.bounceRate}%`} helper="provider webhooks" />
        <MetricCard label="Buyer forecast" value={`${Math.max(0, forecast)}/100`} helper="AI priority score" />
      </section>

      <section className="mt-6 grid grid-cols-1 2xl:grid-cols-[1.1fr_0.9fr] gap-5">
        <div className="rounded-lg border border-slate-800 bg-slate-900/35 p-5">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-indigo-300" />
            <h2 className="text-base font-black text-slate-100">Campaign Timeline</h2>
          </div>
          {analytics.snapshots.length === 0 ? (
            <div className="mt-4">
              <EmptyState title="No snapshot history" body="Daily campaign analytics snapshots will render here." />
            </div>
          ) : (
            <div className="mt-5 space-y-4">
              {analytics.snapshots.slice(0, 12).map((snapshot) => (
                <div key={snapshot.id} className="grid grid-cols-[90px_1fr_56px] items-center gap-3">
                  <span className="text-xs text-slate-500"><ClientDate value={snapshot.date} format="date" /></span>
                  <div className="h-9 rounded-lg bg-slate-950 border border-slate-800 overflow-hidden flex">
                    <div className="bg-indigo-500/70" style={{ width: `${(snapshot.sent / maxSent) * 100}%` }} />
                    <div className="bg-emerald-500/70" style={{ width: `${(snapshot.replies / maxSent) * 100}%` }} />
                  </div>
                  <span className="text-xs font-black text-slate-300 text-right">{snapshot.sent}</span>
                </div>
              ))}
            </div>
          )}
          <div className="mt-5 flex flex-wrap gap-3 text-xs text-slate-500">
            <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-indigo-500" /> Sent</span>
            <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Replies</span>
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/35 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-black text-slate-100">AI Insights</h2>
              <p className="mt-1 text-sm text-slate-500">{loading ? "Analyzing..." : "Recommendations from engagement and deliverability data."}</p>
            </div>
            <StatusBadge value="Active" />
          </div>
          <div className="mt-4 space-y-3">
            {analytics.insights.map((insight) => (
              <div key={insight} className="rounded-lg border border-indigo-400/20 bg-indigo-500/10 p-3 text-sm leading-6 text-indigo-100">
                {insight}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-6 grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="rounded-lg border border-slate-800 bg-slate-900/35 p-5">
          <h2 className="text-base font-black text-slate-100">Best Subject Lines</h2>
          <div className="mt-4 space-y-3">
            {analytics.bestSubjectLines.length === 0 ? (
              <EmptyState title="No subject data" body="Sent campaign subjects will appear here." />
            ) : (
              analytics.bestSubjectLines.map((subject) => (
                <div key={subject.subject} className="rounded-lg border border-slate-800 bg-slate-950/45 p-3">
                  <div className="text-sm font-bold text-slate-100">{subject.subject}</div>
                  <div className="mt-2 h-2 rounded-full bg-slate-800">
                    <div className="h-full rounded-full bg-cyan-400" style={{ width: `${Math.min(100, subject.sent * 2)}%` }} />
                  </div>
                  <div className="mt-2 text-xs text-slate-500">{subject.sent} sends</div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/35 p-5">
          <h2 className="text-base font-black text-slate-100">Best Templates</h2>
          <div className="mt-4 space-y-3">
            {analytics.topTemplates?.length === 0 ? (
              <EmptyState title="No template data" body="Template performance signals will appear after sends." />
            ) : (
              analytics.topTemplates?.map((template) => (
                <div key={template.id} className="rounded-lg border border-slate-800 bg-slate-950/45 p-3">
                  <div className="text-sm font-bold text-slate-100">{template.name}</div>
                  <div className="mt-1 text-xs text-slate-500">{template.subject}</div>
                  <div className="mt-2 h-2 rounded-full bg-slate-800">
                    <div className="h-full rounded-full bg-emerald-400" style={{ width: `${template.deliverabilityScore}%` }} />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                    <span>Spam {template.spamScore}/10</span>
                    <span className="font-black text-emerald-300">{template.deliverabilityScore}/100</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/35 p-5">
          <h2 className="text-base font-black text-slate-100">Best Send Times</h2>
          <div className="mt-4 space-y-3">
            {analytics.sendTimeSuggestions.map((slot) => (
              <div key={slot.label} className="rounded-lg border border-slate-800 bg-slate-950/45 p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-bold text-slate-100">{slot.label}</span>
                  <span className="text-xs font-black text-emerald-300">{slot.confidence}%</span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-slate-800">
                  <div className="h-full rounded-full bg-emerald-400" style={{ width: `${slot.confidence}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/35 p-5 xl:col-span-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-emerald-300" />
            <h2 className="text-base font-black text-slate-100">Conversion Predictions</h2>
          </div>
          <p className="mt-4 text-sm leading-6 text-slate-400">
            Campaigns with opens plus clicks are the current highest-probability buyer pool. Prioritize those leads before broad follow-up volume.
          </p>
          <div className="mt-5 rounded-lg border border-emerald-400/20 bg-emerald-500/10 p-4">
            <div className="text-xs font-bold uppercase tracking-wide text-emerald-200">Likely buyer score</div>
            <div className="mt-2 text-4xl font-black text-emerald-200">{Math.max(0, forecast)}/100</div>
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/35 p-5 xl:col-span-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-black text-slate-100">AI Domain Recommendations</h2>
              <p className="mt-1 text-sm text-slate-500">Ranked by lead fit, engagement, and active campaign context.</p>
            </div>
            <StatusBadge value={`${analytics.domainRecommendations.length} picks`} />
          </div>

          <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-3">
            {analytics.domainRecommendations.length === 0 ? (
              <EmptyState title="No domain recommendations" body="Lead fit recommendations will appear after lead enrichment." />
            ) : (
              analytics.domainRecommendations.map((recommendation) => (
                <div key={`${recommendation.domain}-${recommendation.niche}`} className="rounded-lg border border-slate-800 bg-slate-950/45 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-black text-slate-100">{recommendation.domain}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        {recommendation.niche} - {recommendation.cityState}
                      </div>
                    </div>
                    <span className="shrink-0 text-xs font-black text-cyan-300">{recommendation.confidence}%</span>
                  </div>
                  <div className="mt-3 h-2 rounded-full bg-slate-800">
                    <div className="h-full rounded-full bg-cyan-400" style={{ width: `${recommendation.confidence}%` }} />
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-400">{recommendation.reason}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span>{recommendation.leadCount} leads</span>
                    <span className="text-slate-700">/</span>
                    <span>Example: {recommendation.exampleLead}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </OutboundShell>
  );
}
