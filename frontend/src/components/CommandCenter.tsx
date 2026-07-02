"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Activity, ArrowRight, Bot, MapPin, RefreshCcw, ShieldAlert } from "lucide-react";
import { ClientDate } from "@/lib/ClientDate";
import { EmptyState, OutboundShell } from "@/components/OutboundShell";
import { GlassCard, MetricCard, ScoreRing, Sparkline, StatusBadge } from "@/components/ui";
import {
  fetchOutbound,
  OUTBOUND_API_BASE,
  type OutboundEventSummary,
  type OutboundOverview,
} from "@/lib/outbound";
import { readCache, writeCache } from "@/lib/cache";

const OVERVIEW_CACHE_KEY = "overview";

const demoOverview: OutboundOverview = {
  metrics: {
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
  campaigns: [
    {
      id: "demo-campaign",
      name: "Texas car-domain buyers",
      objective: "Convert verified dealership leads into domain buyers",
      geoDomain: "TexasCarVendor.com",
      niche: "used auto dealerships",
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
  ],
  senders: [
    {
      id: "demo-sender",
      label: "Warm Texas sender",
      provider: "DRY_RUN",
      fromName: "GeoLead AI",
      fromEmail: "outreach@geoleadai.local",
      replyTo: "admin@geoleadai.local",
      status: "active",
      dailyLimit: 35,
      hourlyLimit: 8,
      warmupEnabled: true,
      warmupTarget: 20,
      dkimStatus: "pending",
      spfStatus: "pending",
      dmarcStatus: "pending",
      deliverabilityScore: 76,
      bounceRate: 0.014,
      spamComplaintRate: 0,
      hasEncryptedConfig: false,
      createdAt: "2026-05-22T10:00:00.000Z",
      updatedAt: "2026-05-23T10:00:00.000Z",
    },
  ],
  replies: [
    {
      id: "demo-reply",
      campaignId: "demo-campaign",
      campaignName: "Texas car-domain buyers",
      leadId: "demo-lead",
      businessName: "Texas Auto Sales",
      fromEmail: "sales@texasautosales.example",
      subject: "Re: TexasCarVendor.com",
      body: "Send over the price and transfer details.",
      sentiment: "positive",
      intentScore: 88,
      buyingIntent: true,
      status: "NEW",
      suggestedResponse: "Thanks for the reply. I can send price and transfer details now.",
      receivedAt: "2026-05-23T09:30:00.000Z",
    },
  ],
  activity: [
    { id: "a1", type: "OPENED", campaignName: "Texas car-domain buyers", businessName: "Texas Auto Sales", toEmail: "sales@texasautosales.example", subject: "Re: TexasCarVendor.com", variant: "A", occurredAt: "2026-05-23T09:45:00.000Z" },
    { id: "a2", type: "REPLIED", campaignName: "Texas car-domain buyers", businessName: "Lone Star Motors", toEmail: "owner@lonestarmotors.example", subject: "Re: domain offer", variant: "B", occurredAt: "2026-05-23T09:30:00.000Z" },
  ],
  topLeads: [
    {
      id: "demo-lead",
      businessName: "Texas Auto Sales",
      website: "https://texasautosales.example",
      pipelineStage: "Interested",
      engagementScore: 86,
      emails: [{ email: "sales@texasautosales.example", status: "VALID" }],
      tags: ["buyer-intent"],
    },
  ],
  deliverabilityAlerts: [
    "SPF/DKIM verification is pending for at least one sender.",
    "Warm-up is enabled and daily volume is still below the safe campaign cap.",
  ],
};

function eventTone(type?: string) {
  switch ((type || "").toUpperCase()) {
    case "OPENED":
    case "DELIVERED":
      return { color: "text-success", bg: "bg-success/10", border: "border-success/20" };
    case "CLICKED":
      return { color: "text-info", bg: "bg-info/10", border: "border-info/20" };
    case "REPLIED":
    case "SENT":
      return { color: "text-brand", bg: "bg-brand/10", border: "border-brand/20" };
    case "BOUNCED":
      return { color: "text-danger", bg: "bg-danger/10", border: "border-danger/20" };
    case "UNSUBSCRIBED":
      return { color: "text-copper", bg: "bg-copper/10", border: "border-copper/20" };
    default:
      return { color: "text-text-muted", bg: "bg-surface-2", border: "border-border" };
  }
}

export default function CommandCenter() {
  // Seed from the last-known cached overview so returning users see their real
  // numbers instantly; the fetch below revalidates. Falls back to demo data.
  const [overview, setOverview] = useState<OutboundOverview>(() => readCache<OutboundOverview>(OVERVIEW_CACHE_KEY) ?? demoOverview);
  const [events, setEvents] = useState<OutboundEventSummary[]>(() => (readCache<OutboundOverview>(OVERVIEW_CACHE_KEY) ?? demoOverview).activity);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);

  const loadOverview = useCallback(async () => {
    try {
      const data = await fetchOutbound<OutboundOverview>("/api/outbound/overview");
      setOverview(data);
      setEvents(data.activity);
      writeCache(OVERVIEW_CACHE_KEY, data);
      setOffline(false);
    } catch {
      setOverview(demoOverview);
      setEvents(demoOverview.activity);
      setOffline(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      try {
        const data = await fetchOutbound<OutboundOverview>("/api/outbound/overview");
        if (!active) return;
        setOverview(data);
        setEvents(data.activity);
        writeCache(OVERVIEW_CACHE_KEY, data);
        setOffline(false);
      } catch {
        if (!active) return;
        setOverview(demoOverview);
        setEvents(demoOverview.activity);
        setOffline(true);
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

  useEffect(() => {
    const wsUrl = OUTBOUND_API_BASE.replace(/^http/, "ws") + "/ws/outbound";
    let socket: WebSocket | null = null;

    // Coalesce bursts of socket messages into ONE render per animation frame
    // (a chatty backend can emit many events/sec); skip rendering in hidden tabs.
    const pending: OutboundEventSummary[] = [];
    let rafScheduled = false;
    try {
      socket = new WebSocket(wsUrl);
      socket.onmessage = (message) => {
        try {
          const raw = JSON.parse(message.data);
          const event: OutboundEventSummary = {
            id: `${raw.type}-${Date.now()}`,
            type: raw.type,
            campaignName: raw.payload?.campaignName || undefined,
            occurredAt: raw.createdAt || new Date().toISOString(),
            toEmail: raw.payload?.toEmail || undefined,
            subject: raw.payload?.subject || undefined,
            variant: raw.payload?.variant || undefined,
            businessName: raw.payload?.businessName || undefined,
          };
          pending.unshift(event);
          if (!rafScheduled) {
            rafScheduled = true;
            requestAnimationFrame(() => {
              rafScheduled = false;
              const batch = pending.splice(0);
              if (typeof document !== "undefined" && document.hidden) return;
              setEvents((current) => [...batch, ...current].slice(0, 8));
            });
          }
        } catch {
          /* malformed message, ignore */
        }
      };
      socket.onerror = () => { /* expected when backend is offline */ };
      socket.onclose = () => { socket = null; };
    } catch {
      socket = null;
    }

    return () => {
      try { socket?.close(); } catch { /* ignore double-close */ }
    };
  }, []);

  const metrics = overview.metrics;
  const hottestCampaign = useMemo(
    () => [...overview.campaigns].sort((a, b) => b.engagementScore - a.engagementScore)[0],
    [overview.campaigns]
  );

  const engagement = overview.campaigns.length
    ? Math.round(overview.campaigns.reduce((s, c) => s + (c.engagementScore || 0), 0) / overview.campaigns.length)
    : Math.round(metrics.openRate);

  const sparkData = useMemo(
    () =>
      overview.campaigns.length >= 2
        ? overview.campaigns.map((c) => c.engagementScore || 0)
        : [42, 55, 48, 63, 58, 72, engagement],
    [overview.campaigns, engagement]
  );

  const geoPulse = useMemo(
    () =>
      overview.campaigns
        .filter((c) => c.cityState)
        .slice(0, 4)
        .map((c) => ({ loc: c.cityState as string, count: c.recipients ?? 0, active: c.status === "ACTIVE" })),
    [overview.campaigns]
  );

  return (
    <OutboundShell
      title="Command Center"
      subtitle="Live operation status"
      actions={
        <>
          <button
            onClick={() => {
              setLoading(true);
              void loadOverview();
            }}
            className="h-9 px-3 rounded-lg border border-border bg-surface text-sm text-text-muted hover:text-text hover:bg-surface-2 inline-flex items-center gap-2 transition-colors"
          >
            <RefreshCcw className="h-4 w-4" />
            Refresh
          </button>
          <Link
            href="/ai-email-generator"
            className="h-9 px-4 rounded-lg bg-brand text-sm font-bold text-bg hover:bg-brand-hover inline-flex items-center gap-2 shadow-[0_0_12px_rgba(20,184,166,0.3)] transition-colors"
          >
            <Bot className="h-4 w-4" />
            Write Email
          </Link>
        </>
      }
    >
      {offline ? (
        <div className="mb-6 rounded-lg border border-copper/20 bg-copper/10 px-4 py-3 text-sm text-copper">
          Backend offline. Showing seeded workspace data until {OUTBOUND_API_BASE} is available.
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Metric row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard
              title="Campaigns"
              value={String(metrics.campaigns)}
              trend={`${metrics.activeCampaigns} active`}
              trendUp
            />
            <MetricCard title="Active" value={String(metrics.activeCampaigns)} />
            <MetricCard title="Queued" value={metrics.queued.toLocaleString()} />
            <GlassCard className="flex flex-col gap-2 p-5 relative overflow-hidden">
              <div className="text-[11px] uppercase tracking-[0.12em] text-text-muted font-bold z-10">
                Engagement
              </div>
              <div className="text-[28px] font-[800] font-mono tabular-nums leading-none z-10">
                {engagement}%
              </div>
              <div className="absolute bottom-0 left-0 right-0 z-0 opacity-60">
                <Sparkline data={sparkData} />
              </div>
            </GlassCard>
          </div>

          {/* Hottest campaign + Geo pulse */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {hottestCampaign ? (
              <GlassCard className="flex flex-col gap-4">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-text-muted font-bold">Hottest Campaign</div>
                    <div className="text-lg font-bold mt-1">{hottestCampaign.name}</div>
                    <div className="text-sm text-text-muted">{hottestCampaign.geoDomain}</div>
                  </div>
                  <StatusBadge status={hottestCampaign.status} />
                </div>
                <div className="grid grid-cols-3 gap-4 py-4 border-y border-border">
                  <div>
                    <div className="text-[10px] text-text-muted uppercase font-bold">Open</div>
                    <div className="text-xl font-mono font-bold text-success">{hottestCampaign.openRate}%</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-text-muted uppercase font-bold">Click</div>
                    <div className="text-xl font-mono font-bold text-info">{hottestCampaign.clickRate}%</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-text-muted uppercase font-bold">Reply</div>
                    <div className="text-xl font-mono font-bold text-brand">{hottestCampaign.replyRate}%</div>
                  </div>
                </div>
                <Link href="/campaigns" className="text-brand text-sm font-bold flex items-center gap-1 hover:text-brand-hover transition-colors">
                  View Campaign <ArrowRight className="w-4 h-4" />
                </Link>
              </GlassCard>
            ) : (
              <GlassCard className="flex flex-col justify-center">
                <EmptyState title="No campaign data yet" body="Create a campaign to start scheduling respectful outreach." />
              </GlassCard>
            )}

            <GlassCard className="flex flex-col gap-4 relative">
              <div className="flex justify-between items-center">
                <div className="text-[11px] uppercase tracking-wider text-text-muted font-bold flex items-center gap-2">
                  <MapPin className="w-3 h-3 text-brand" />
                  Geo Pulse
                </div>
                <div className="w-2 h-2 rounded-full bg-brand animate-pulse" />
              </div>
              <div className="space-y-3">
                {geoPulse.length === 0 ? (
                  <div className="text-sm text-text-muted py-4">No active geographies yet.</div>
                ) : (
                  geoPulse.map((p) => (
                    <div key={p.loc} className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <div className={p.active ? "w-1.5 h-1.5 rounded-full bg-brand" : "w-1.5 h-1.5 rounded-full bg-surface-2"} />
                        <span className="text-sm font-medium">{p.loc}</span>
                      </div>
                      <span className="text-sm font-mono text-text-muted">{p.count} leads</span>
                    </div>
                  ))
                )}
              </div>
            </GlassCard>
          </div>

          {/* Top leads */}
          <GlassCard className="p-0 overflow-hidden">
            <div className="p-4 border-b border-border flex justify-between items-center bg-surface-2/50">
              <div className="font-bold text-sm">Top Leads</div>
              <Link href="/dashboard" className="text-brand text-sm font-bold flex items-center gap-1 hover:text-brand-hover transition-colors">
                View All <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
            <div className="divide-y divide-border">
              {overview.topLeads.length === 0 ? (
                <div className="p-6 text-sm text-text-muted text-center">No qualified leads yet.</div>
              ) : (
                overview.topLeads.map((lead) => {
                  const emails = lead.emails || [];
                  const valid = emails.filter((e) => String(e.status).toUpperCase() === "VALID").length;
                  const match = emails.length ? Math.round((valid / emails.length) * 100) : lead.engagementScore;
                  const tag = lead.tags?.[0] || lead.pipelineStage;
                  return (
                    <div key={lead.id} className="p-4 flex items-center justify-between hover:bg-surface-2/30 transition-colors cursor-pointer">
                      <div className="min-w-0">
                        <div className="font-bold text-sm flex items-center gap-2">
                          <span className="truncate">{lead.businessName}</span>
                          {tag ? <span className="text-[10px] uppercase font-bold bg-copper/10 text-copper px-1.5 rounded shrink-0">{tag}</span> : null}
                        </div>
                        <div className="text-[12px] text-text-muted mt-0.5">{emails.length} verified emails found</div>
                      </div>
                      <div className="flex gap-4 items-center shrink-0">
                        <div className="flex flex-col items-center">
                          <ScoreRing score={match} size="sm" />
                          <span className="text-[9px] uppercase tracking-wider text-text-muted mt-1">Match</span>
                        </div>
                        <div className="flex flex-col items-center">
                          <ScoreRing score={lead.engagementScore} size="sm" />
                          <span className="text-[9px] uppercase tracking-wider text-text-muted mt-1">Priority</span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </GlassCard>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          <GlassCard className="p-0 overflow-hidden flex flex-col h-[380px] lg:h-[500px]">
            <div className="p-4 border-b border-border flex justify-between items-center bg-surface-2/50 sticky top-0 z-10 backdrop-blur-md">
              <div className="font-bold text-sm flex items-center gap-2">
                <Activity className="w-4 h-4 text-brand" />
                The Trading Floor
              </div>
              <div className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full ${offline ? "bg-text-faint" : "bg-brand shadow-[0_0_8px_var(--brand)] animate-pulse"}`} />
                <span className={`text-[11px] uppercase tracking-wider font-bold ${offline ? "text-text-faint" : "text-brand"}`}>
                  {offline ? "Demo" : loading ? "Connecting" : "Live"}
                </span>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {events.length === 0 ? (
                <EmptyState title="No recent events" body="Open, click, reply, bounce, and unsubscribe events will appear here." />
              ) : (
                events.map((ev) => {
                  const tone = eventTone(ev.type);
                  return (
                    <div key={ev.id} className="flex gap-3 text-sm row-enter">
                      <div className={`mt-0.5 w-20 shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded border text-center break-all leading-[1.15] ${tone.color} ${tone.bg} ${tone.border}`}>
                        {ev.type}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex justify-between items-start mb-0.5">
                          <span className="font-bold truncate pr-2">
                            {ev.variant ? (
                              <span className="text-text-muted font-normal mr-1 border border-border rounded px-1 text-[10px]">{ev.variant}</span>
                            ) : null}
                            {ev.businessName || ev.campaignName || "Outbound"}
                          </span>
                          <span className="text-[11px] text-text-faint whitespace-nowrap">
                            {ev.occurredAt ? <ClientDate value={ev.occurredAt} format="time" /> : "now"}
                          </span>
                        </div>
                        {ev.toEmail ? <div className="text-[12px] text-text-muted truncate font-mono">{ev.toEmail}</div> : null}
                        {ev.subject ? <div className="text-[12px] text-text-faint truncate italic">&ldquo;{ev.subject}&rdquo;</div> : null}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </GlassCard>

          {overview.deliverabilityAlerts.length > 0 ? (
            <GlassCard className="bg-copper/5 border-copper/20">
              <div className="flex items-start gap-3">
                <ShieldAlert className="w-5 h-5 text-copper mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <div className="font-bold text-sm text-copper">Deliverability Alerts</div>
                  <ul className="mt-1 space-y-1.5">
                    {overview.deliverabilityAlerts.map((alert) => (
                      <li key={alert} className="text-sm text-text-muted">{alert}</li>
                    ))}
                  </ul>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link href="/sender-accounts" className="px-3 py-1.5 bg-copper/10 text-copper hover:bg-copper/20 transition-colors rounded text-[12px] font-bold border border-copper/20">
                      Review Senders
                    </Link>
                    <Link href="/analytics" className="px-3 py-1.5 bg-surface-2 text-text hover:bg-surface transition-colors rounded text-[12px] font-bold border border-border">
                      View Details
                    </Link>
                  </div>
                </div>
              </div>
            </GlassCard>
          ) : null}
        </div>
      </div>
    </OutboundShell>
  );
}
