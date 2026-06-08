"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Bot, Inbox, RefreshCcw, ShieldCheck, Sparkles } from "lucide-react";
import { ClientDate } from "@/lib/ClientDate";
import { EmptyState, MetricCard, OutboundShell, StatusBadge } from "@/components/OutboundShell";
import {
  fetchOutbound,
  OUTBOUND_API_BASE,
  type OutboundEventSummary,
  type OutboundOverview,
} from "@/lib/outbound";

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
    { id: "a1", type: "OPENED", campaignName: "Texas car-domain buyers", occurredAt: "2026-05-23T09:45:00.000Z" },
    { id: "a2", type: "REPLIED", campaignName: "Texas car-domain buyers", occurredAt: "2026-05-23T09:30:00.000Z" },
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

export default function HomePage() {
  const [overview, setOverview] = useState<OutboundOverview>(demoOverview);
  const [events, setEvents] = useState<OutboundEventSummary[]>(demoOverview.activity);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);

  const loadOverview = useCallback(async () => {
    try {
      const data = await fetchOutbound<OutboundOverview>("/api/outbound/overview");
      setOverview(data);
      setEvents(data.activity);
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
          setEvents((current) => [event, ...current].slice(0, 8));
        } catch {
          /* malformed message, ignore */
        }
      };
      // Silently handle errors — the user is on a local app, the WS is best-effort
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

  return (
    <OutboundShell
      title="Outbound Command Center"
      subtitle="Generate compliant AI emails, run geo-domain campaigns, watch replies, and keep sender health under control."
      actions={
        <>
          <button
            onClick={() => {
              setLoading(true);
              void loadOverview();
            }}
            className="h-10 px-3 rounded-lg border border-slate-300 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/70 text-sm text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white inline-flex items-center gap-2"
          >
            <RefreshCcw className="h-4 w-4" />
            Refresh
          </button>
          <Link
            href="/ai-email-generator"
            className="h-10 px-4 rounded-lg bg-teal-600 text-sm font-bold text-white hover:bg-teal-500 inline-flex items-center gap-2"
          >
            <Bot className="h-4 w-4" />
            Write Email
          </Link>
        </>
      }
    >
      {offline ? (
        <div className="mb-4 rounded-lg border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-100">
          Backend offline. Showing seeded workspace data until {OUTBOUND_API_BASE} is available.
        </div>
      ) : null}

      <section className="grid grid-cols-2 xl:grid-cols-6 gap-3">
        <MetricCard label="Campaigns" value={metrics.campaigns} helper={`${metrics.activeCampaigns} active`} />
        <MetricCard label="Queued" value={metrics.queued} helper="scheduled sends" />
        <MetricCard label="Sent" value={metrics.sent} helper="all campaigns" />
        <MetricCard label="Open rate" value={`${metrics.openRate}%`} helper="tracked pixels" />
        <MetricCard label="CTR" value={`${metrics.clickRate}%`} helper="tracked links" />
        <MetricCard label="Reply rate" value={`${metrics.replyRate}%`} helper="positive/negative tagged" />
      </section>

      <section className="mt-6 grid grid-cols-1 xl:grid-cols-[1.25fr_0.75fr] gap-5">
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/35 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-black text-slate-900 dark:text-slate-100">Campaign Operating View</h2>
              <p className="mt-1 text-sm text-slate-500">Status, sender health, and conversion signals in one place.</p>
            </div>
            <Link href="/campaigns" className="text-sm text-teal-700 dark:text-teal-300 hover:text-teal-600 dark:hover:text-teal-200 inline-flex items-center gap-1">
              Open campaigns <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          {hottestCampaign ? (
            <div className="mt-5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/45 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-slate-900 dark:text-slate-100">{hottestCampaign.name}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {hottestCampaign.geoDomain} for {hottestCampaign.niche}
                  </div>
                </div>
                <StatusBadge value={hottestCampaign.status} />
              </div>
              <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div>
                  <div className="text-slate-500">Recipients</div>
                  <div className="font-black text-slate-900 dark:text-slate-100">{hottestCampaign.recipients}</div>
                </div>
                <div>
                  <div className="text-slate-500">Opens</div>
                  <div className="font-black text-slate-900 dark:text-slate-100">{hottestCampaign.opens}</div>
                </div>
                <div>
                  <div className="text-slate-500">Replies</div>
                  <div className="font-black text-slate-900 dark:text-slate-100">{hottestCampaign.replies}</div>
                </div>
                <div>
                  <div className="text-slate-500">Engagement</div>
                  <div className="font-black text-emerald-300">{hottestCampaign.engagementScore}/100</div>
                </div>
              </div>
            </div>
          ) : (
            <EmptyState title="No campaign data yet" body="Create a campaign to start scheduling respectful outreach." />
          )}

          <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              { href: "/ai-email-generator", label: "Generate personalized email", icon: Sparkles },
              { href: "/inbox", label: "Review AI-categorized replies", icon: Inbox },
              { href: "/analytics", label: "Inspect deliverability alerts", icon: ShieldCheck },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/35 p-4 text-sm font-bold text-slate-800 dark:text-slate-200 hover:border-teal-400/40 hover:text-teal-100 transition-colors"
                >
                  <Icon className="h-5 w-5 text-teal-300 mb-3" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/35 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-black text-slate-900 dark:text-slate-100">Live Activity</h2>
              <p className="mt-1 text-sm text-slate-500">{loading ? "Connecting..." : "WebSocket feed plus latest events"}</p>
            </div>
            <StatusBadge value={offline ? "Demo" : "Live"} />
          </div>
          <div className="mt-4 space-y-3">
            {events.length === 0 ? (
              <EmptyState title="No recent events" body="Open, click, reply, bounce, and unsubscribe events will appear here." />
            ) : (
              events.map((event) => (
                <div key={event.id} className={`rounded-lg border p-3 ${
                  event.type === 'OPENED' ? 'border-emerald-500/20 bg-emerald-500/[0.03]' :
                  event.type === 'CLICKED' ? 'border-teal-500/20 bg-teal-500/[0.03]' :
                  event.type === 'REPLIED' ? 'border-teal-500/20 bg-teal-500/[0.03]' :
                  event.type === 'BOUNCED' ? 'border-red-500/20 bg-red-500/[0.03]' :
                  'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40'
                }`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                      <span className={`text-[10px] font-black uppercase px-1.5 py-0.5 rounded ${
                        event.type === 'OPENED' ? 'bg-emerald-500/10 text-emerald-400' :
                        event.type === 'CLICKED' ? 'bg-teal-500/10 text-teal-400' :
                        event.type === 'REPLIED' ? 'bg-teal-500/10 text-teal-400' :
                        event.type === 'BOUNCED' ? 'bg-red-500/10 text-red-400' :
                        event.type === 'UNSUBSCRIBED' ? 'bg-amber-500/10 text-amber-400' :
                        event.type === 'SENT' ? 'bg-slate-500/10 text-slate-400' :
                        'bg-slate-500/10 text-slate-400'
                      }`}>{event.type}</span>
                      {event.variant && <span className="text-[9px] font-black text-teal-400 bg-teal-500/10 px-1 rounded">{event.variant}</span>}
                      <span className="text-[11px] text-slate-400 truncate">{event.campaignName || 'Outbound'}</span>
                    </div>
                    <span className="text-[10px] text-slate-500 shrink-0">
                      {event.occurredAt ? <ClientDate value={event.occurredAt} /> : 'now'}
                    </span>
                  </div>
                  {(event.businessName || event.toEmail) && (
                    <div className="mt-1 text-[11px] text-slate-500 truncate">
                      {event.businessName && <span className="font-medium text-slate-600 dark:text-slate-400">{event.businessName}</span>}
                      {event.businessName && event.toEmail && <span className="mx-1 text-slate-600">·</span>}
                      {event.toEmail && <span className="font-mono">{event.toEmail}</span>}
                    </div>
                  )}
                  {event.subject && (
                    <div className="mt-0.5 text-[10px] text-slate-500 truncate">{event.subject}</div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="mt-6 grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/35 p-5">
          <h2 className="text-base font-black text-slate-900 dark:text-slate-100">Deliverability Alerts</h2>
          <div className="mt-4 space-y-3">
            {overview.deliverabilityAlerts.map((alert) => (
              <div key={alert} className="rounded-lg border border-amber-400/20 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-100">
                {alert}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/35 p-5">
          <h2 className="text-base font-black text-slate-900 dark:text-slate-100">Hottest Leads</h2>
          <div className="mt-4 space-y-3">
            {overview.topLeads.map((lead) => (
              <div key={lead.id} className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 p-3">
                <div className="text-sm font-bold text-slate-900 dark:text-slate-100">{lead.businessName}</div>
                <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
                  <span>{lead.pipelineStage}</span>
                  <span className="font-black text-emerald-300">{lead.engagementScore}/100</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/35 p-5">
          <h2 className="text-base font-black text-slate-900 dark:text-slate-100">Sender Health</h2>
          <div className="mt-4 space-y-3">
            {overview.senders.map((sender) => (
              <div key={sender.id} className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-bold text-slate-900 dark:text-slate-100">{sender.label}</div>
                    <div className="text-xs text-slate-500">{sender.fromEmail}</div>
                  </div>
                  <StatusBadge value={sender.status} />
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                  <div className="h-full rounded-full bg-emerald-400" style={{ width: `${sender.deliverabilityScore}%` }} />
                </div>
                <div className="mt-2 text-xs text-slate-500">Deliverability {sender.deliverabilityScore}/100</div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </OutboundShell>
  );
}
