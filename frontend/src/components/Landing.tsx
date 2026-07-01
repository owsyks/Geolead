"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  ArrowRight, Check, ChevronDown, MapPin, Search,
  Mail, ShieldCheck, Sparkles, Brain, Send,
  Building2, Lock, Star, Globe, Menu, X, LayoutDashboard,
} from "lucide-react";
import { useAuth } from "@/lib/auth";

/* ─── constants ─── */
const BC = "'Barlow Condensed', 'Geist', sans-serif";

const tickerItems = [
  { type: "REPLIED",     firm: "Apex Dental Group",        time: "0s ago",  col: "#14b8a6" },
  { type: "OPENED",      firm: "Lone Star Orthodontics",   time: "12s ago", col: "#10b981" },
  { type: "DISCOVERED",  firm: "Bright Smiles Clinic",     time: "28s ago", col: "#38bdf8" },
  { type: "VERIFIED",    firm: "Dallas Implant Center",    time: "41s ago", col: "#14b8a6" },
  { type: "CLICKED",     firm: "Austin Wellness Dentistry",time: "1m ago",  col: "#38bdf8" },
  { type: "REPLIED",     firm: "Texas Family Dental",      time: "1m ago",  col: "#14b8a6" },
  { type: "OPENED",      firm: "Park Slope Pediatrics",    time: "2m ago",  col: "#10b981" },
  { type: "DISCOVERED",  firm: "Plano Dental Associates",  time: "2m ago",  col: "#38bdf8" },
  { type: "VERIFIED",    firm: "Frisco Family Dentistry",  time: "3m ago",  col: "#14b8a6" },
];

const features = [
  {
    tag: "DISCOVERY",
    icon: Globe,
    headline: "Map every buyer in any market in minutes.",
    body: "Enter a domain idea and a city. GeoLead scrapes, cross-references, and surfaces the highest-value local businesses — names, roles, emails, phones — ranked by AI priority score before you touch a keyboard.",
    stat: "1,248",
    statLabel: "leads found · Dallas dental · 7 min",
    accent: "#14b8a6",
  },
  {
    tag: "INTELLIGENCE",
    icon: Brain,
    headline: "Know who to call before you dial.",
    body: "Every prospect gets a Priority, Match, and Intent score. GeoLead identifies the decision-maker by role — CEO, Owner, Director — and rates their accessibility so your pitch goes to the right person the first time.",
    stat: "96",
    statLabel: "priority score · Dr. Michael Chen · Owner",
    accent: "#d97706",
  },
  {
    tag: "OUTREACH",
    icon: Mail,
    headline: "Emails that read like you wrote them yourself.",
    body: "No templates. The AI writes hyper-personalized A/B/C variants per lead — referencing their niche, location, and decision-maker role. Campaigns launch in one click with automatic follow-up sequencing built in.",
    stat: "5.8×",
    statLabel: "avg reply rate vs standard cold email",
    accent: "#38bdf8",
  },
  {
    tag: "INBOX AI",
    icon: Sparkles,
    headline: "Every reply triaged before you read it.",
    body: "Replies land pre-categorized: Interested, Negotiating, Not Interested, Spam. An AI-written response is waiting in the compose box. You review, tweak, and send — instead of thinking from scratch.",
    stat: "88",
    statLabel: "intent score · Apex Dental · reply ready",
    accent: "#14b8a6",
  },
];

const plans = [
  {
    id: "free",
    badge: null as string | null,
    label: "FREE TRIAL",
    price: "$0",
    priceNote: "forever",
    tagline: "See the quality before you commit. No card. No clock.",
    quota: { searches: 5, leads: "~125", campaigns: 1 },
    accent: "#a8a29e",
    cta: "Start Free",
    ctaTo: "/register",
    features: [
      { text: "5 searches (lifetime)", included: true },
      { text: "~125 verified leads (25 per search)", included: true },
      { text: "1 active campaign", included: true },
      { text: "1 AI email variant per campaign", included: true },
      { text: "Basic email verification", included: true },
      { text: "AI lead scoring & prioritization", included: true },
      { text: "Inbox (read & triage)", included: true },
      { text: "CSV export", included: true },
      { text: "Monthly search quota", included: false },
      { text: "AI inbox response drafts", included: false },
      { text: "Follow-up sequences", included: false },
    ],
  },
  {
    id: "starter",
    badge: null as string | null,
    label: "STARTER",
    price: "$15",
    priceNote: "/month",
    tagline: "For solo operators closing their first deals every week.",
    quota: { searches: 25, leads: "~1,000", campaigns: 5 },
    accent: "#14b8a6",
    cta: "Get Starter",
    ctaTo: "/register",
    features: [
      { text: "25 searches / month", included: true },
      { text: "~1,000 verified leads / month", included: true },
      { text: "5 active campaigns", included: true },
      { text: "2 AI email variants per campaign", included: true },
      { text: "Multi-source email verification", included: true },
      { text: "AI lead scoring & prioritization", included: true },
      { text: "AI inbox triage + response drafts", included: true },
      { text: "1-click follow-up sequences", included: true },
      { text: "CSV export + basic analytics", included: true },
      { text: "100 searches / month (Pro only)", included: false },
      { text: "White-label reporting", included: false },
    ],
  },
  {
    id: "pro",
    badge: "MOST POPULAR" as string | null,
    label: "PRO",
    price: "$29",
    priceNote: "/month",
    tagline: "For power users running multiple markets at full throttle.",
    quota: { searches: 100, leads: "~4,000", campaigns: -1 },
    accent: "#14b8a6",
    cta: "Get Pro",
    ctaTo: "/register",
    features: [
      { text: "100 searches / month", included: true },
      { text: "~4,000 verified leads / month", included: true },
      { text: "Unlimited campaigns", included: true },
      { text: "A/B/C AI variants + personalization", included: true },
      { text: "Multi-source + real-time verification", included: true },
      { text: "Advanced intent & DM scoring", included: true },
      { text: "AI inbox triage + response drafts", included: true },
      { text: "1-click follow-up sequences", included: true },
      { text: "Live campaign analytics", included: true },
      { text: "White-label reporting", included: true },
      { text: "Priority support + onboarding call", included: true },
    ],
  },
];

const faqs = [
  { q: "What counts as a 'search'?", a: "One search = one geo-discovery run: a domain idea, niche keyword, and city. GeoLead scrapes and scores that full market (~25 verified leads per run). Free Trial gives you 5 searches for life. Starter gives you 25/month (~1,000 leads). Pro gives you 100/month (~4,000 leads)." },
  { q: "How does GeoLead find leads?", a: "GeoLead AI uses a proprietary geo-scraping engine that maps every local business in a given niche and city. It cross-references company websites, LinkedIn, Google Business, and domain registries to surface verified, high-intent prospects." },
  { q: "Is outreach CAN-SPAM and GDPR compliant?", a: "Yes. Every campaign enforces opt-out suppression, unsubscribe handling, and daily throttle limits automatically. We also flag risky emails before they're sent." },
  { q: "Can I use my own sending domain?", a: "Absolutely. Connect any SMTP account — Google Workspace, Microsoft 365, or custom SMTP — and GeoLead manages the sending schedule to protect your domain reputation." },
  { q: "Can I upgrade or cancel anytime?", a: "Yes. Upgrade from Free to Starter or Pro at any time. Cancel anytime — no contracts, no penalties. Your leads and campaign data stay exportable until the end of your billing period." },
];

/* ─── small components ─── */
function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-2 border border-brand/30 bg-brand/8 px-3 py-1 rounded-sm">
      <div className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse shadow-[0_0_6px_var(--brand)]" />
      <span className="text-[11px] font-mono font-bold uppercase tracking-[0.16em] text-brand">{children}</span>
    </div>
  );
}

function StatPill({ value, label }: { value: string; label: string }) {
  return (
    <div className="inline-flex items-center gap-2.5 bg-surface-2/60 border border-border rounded-sm px-3 py-1.5">
      <span className="font-mono font-black text-brand text-sm tabular-nums">{value}</span>
      <span className="text-[11px] text-text-faint font-medium">{label}</span>
    </div>
  );
}

/* Animated terminal window */
function TerminalWindow() {
  const lines = [
    { delay: 0,    text: "$ geolead discover --domain dallasdental.com --niche \"Dentist\" --city \"Dallas, TX\"", type: "cmd" },
    { delay: 600,  text: "→ Mapping geo market...", type: "info" },
    { delay: 1200, text: "→ Scraping 200 domains...", type: "info" },
    { delay: 2000, text: "✓ Found 1,248 prospects", type: "success" },
    { delay: 2600, text: "→ Running AI scoring...", type: "info" },
    { delay: 3200, text: "✓ #1  Apex Dental Group         priority: 95  match: 90", type: "lead" },
    { delay: 3600, text: "✓ #2  Dallas Implant Center     priority: 96  match: 98", type: "lead" },
    { delay: 4000, text: "✓ #3  Bright Smiles Clinic      priority: 81  match: 80", type: "lead" },
    { delay: 4400, text: "✓ #4  Lone Star Orthodontics    priority: 72  match: 85", type: "lead" },
    { delay: 4800, text: "→ Verifying 892 emails...", type: "info" },
    { delay: 5400, text: "✓ Campaign ready. 312 high-priority targets.", type: "success" },
    { delay: 5900, text: "$ _", type: "cmd" },
  ];

  const [visible, setVisible] = useState<number[]>([]);
  useEffect(() => {
    const timers = lines.map((l, i) => setTimeout(() => setVisible(v => [...v, i]), l.delay));
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="rounded-xl border border-border overflow-hidden shadow-[0_0_0_1px_rgba(20,184,166,0.06),0_24px_60px_rgba(0,0,0,0.7)]">
      {/* chrome */}
      <div className="flex items-center gap-2 px-4 py-3 bg-surface-2 border-b border-border">
        <div className="w-3 h-3 rounded-full bg-danger/50" />
        <div className="w-3 h-3 rounded-full bg-copper/50" />
        <div className="w-3 h-3 rounded-full bg-success/50" />
        <span className="ml-3 text-[11px] font-mono text-text-faint">geolead-terminal — zsh</span>
        <div className="ml-auto flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse" />
          <span className="text-[10px] font-mono text-brand font-bold">LIVE</span>
        </div>
      </div>
      {/* body */}
      <div className="bg-[#080706] p-5 font-mono text-[12px] leading-[1.8] min-h-[320px]">
        {lines.map((l, i) =>
          visible.includes(i) ? (
            <div key={i} className={
              l.type === "cmd"     ? "text-text" :
              l.type === "success" ? "text-brand" :
              l.type === "lead"    ? "text-text-muted" :
              "text-text-faint"
            }>
              {l.text}
              {l.type === "cmd" && i === lines.length - 1 && (
                <span className="inline-block w-2 h-4 bg-brand ml-0.5 animate-pulse align-middle" />
              )}
            </div>
          ) : null
        )}
      </div>
    </div>
  );
}

/* Scrolling ticker */
function Ticker() {
  const doubled = [...tickerItems, ...tickerItems];
  return (
    <div className="overflow-hidden border-y border-border bg-surface-2/20 py-3 relative">
      <div className="absolute left-0 top-0 bottom-0 w-20 z-10 pointer-events-none" style={{ background: "linear-gradient(to right, var(--bg), transparent)" }} />
      <div className="absolute right-0 top-0 bottom-0 w-20 z-10 pointer-events-none" style={{ background: "linear-gradient(to left, var(--bg), transparent)" }} />
      <div
        className="flex gap-8 whitespace-nowrap"
        style={{ animation: "ticker 40s linear infinite" }}
      >
        {doubled.map((item, i) => (
          <div key={i} className="flex items-center gap-2.5 text-[12px] flex-shrink-0">
            <span
              className="font-mono font-black text-[10px] px-1.5 py-0.5 rounded-sm border"
              style={{ color: item.col, background: `${item.col}18`, borderColor: `${item.col}40` }}
            >
              {item.type}
            </span>
            <span className="text-text font-medium">{item.firm}</span>
            <span className="text-text-faint">{item.time}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* FAQ item */
function FaqItem({ q, a, open, onToggle }: { q: string; a: string; open: boolean; onToggle: () => void }) {
  return (
    <div className={`border-b border-border transition-colors ${open ? "border-brand/20" : ""}`}>
      <button className="w-full flex items-center justify-between py-5 text-left gap-4 group" onClick={onToggle}>
        <span className="font-bold text-[15px] text-text group-hover:text-brand transition-colors">{q}</span>
        <ChevronDown className={`w-4 h-4 text-text-muted flex-shrink-0 transition-transform duration-300 ${open ? "rotate-180 text-brand" : ""}`} />
      </button>
      <div className={`overflow-hidden transition-all duration-300 ${open ? "max-h-48 pb-5" : "max-h-0"}`}>
        <p className="text-sm text-text-muted leading-relaxed">{a}</p>
      </div>
    </div>
  );
}

/* ─── main component ─── */
export default function Landing() {
  const { user } = useAuth();
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [mobileMenu, setMobileMenu] = useState(false);

  return (
    // `dark` is pinned here so the marketing page always renders on its dark
    // palette (it's designed dark-only and mixes theme tokens with hardcoded
    // dark colors) regardless of the user's app theme.
    <div className="dark min-h-screen bg-bg text-text overflow-x-hidden">

      {/* ticker keyframe */}
      <style>{`
        @keyframes ticker { from { transform: translateX(0) } to { transform: translateX(-50%) } }
        @keyframes float { 0%,100% { transform: translateY(0px) } 50% { transform: translateY(-12px) } }
        .float { animation: float 6s ease-in-out infinite; }
        .float-slow { animation: float 9s ease-in-out infinite; }
        html { scroll-behavior: smooth; }
      `}</style>

      {/* ── aurora background ── */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute top-[-20%] left-[-15%] w-[70%] h-[70%] rounded-full opacity-30" style={{ background: "radial-gradient(ellipse, rgba(20,184,166,0.18) 0%, transparent 70%)", filter: "blur(60px)" }} />
        <div className="absolute bottom-[-20%] right-[-15%] w-[60%] h-[60%] rounded-full opacity-25" style={{ background: "radial-gradient(ellipse, rgba(217,119,6,0.15) 0%, transparent 70%)", filter: "blur(80px)" }} />
        <div className="absolute top-[45%] right-[10%] w-[40%] h-[40%] rounded-full opacity-15" style={{ background: "radial-gradient(ellipse, rgba(56,189,248,0.12) 0%, transparent 70%)", filter: "blur(60px)" }} />
        {/* dot grid */}
        <div className="absolute inset-0 opacity-[0.025]" style={{
          backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.8) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }} />
        {/* scanlines */}
        <div className="absolute inset-0 opacity-[0.015]" style={{
          backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.4) 2px, rgba(255,255,255,0.4) 3px)",
        }} />
      </div>

      {/* ════════ NAV ════════ */}
      <nav className="sticky top-0 z-50 border-b border-border" style={{ background: "rgba(12,10,9,0.85)", backdropFilter: "blur(20px) saturate(150%)" }}>
        <div className="max-w-7xl mx-auto px-5 lg:px-8 h-[60px] flex items-center justify-between gap-6">
          <Link href="/" className="flex items-center gap-3 flex-shrink-0">
            <div className="w-8 h-8 rounded-md bg-brand flex items-center justify-center font-black text-sm text-bg" style={{ boxShadow: "0 0 16px rgba(20,184,166,0.35), inset 0 1px 2px rgba(255,255,255,0.3)" }}>GL</div>
            <span className="font-black tracking-tight text-[15px]" style={{ fontFamily: BC }}>GeoLead AI</span>
          </Link>

          <div className="hidden md:flex items-center gap-7 text-[13px] text-text-muted">
            {["#features","#how-it-works","#pricing","#faq"].map(h => (
              <a key={h} href={h} className="hover:text-text transition-colors capitalize">{h.replace("#","").replace("-"," ")}</a>
            ))}
            <Link href="/contact" className="hover:text-text transition-colors">Contact</Link>
          </div>

          <div className="hidden md:flex items-center gap-3">
            {user ? (
              <Link href="/overview" className="flex items-center gap-1.5 px-4 py-2 bg-brand text-bg text-[13px] font-bold rounded-md hover:bg-brand-hover transition-colors" style={{ boxShadow: "0 0 16px rgba(20,184,166,0.25)" }}>
                <LayoutDashboard className="w-3.5 h-3.5" /> Dashboard
              </Link>
            ) : (
              <>
                <Link href="/login" className="text-[13px] text-text-muted hover:text-text transition-colors px-2">Sign In</Link>
                <Link href="/register" className="flex items-center gap-1.5 px-4 py-2 bg-brand text-bg text-[13px] font-bold rounded-md hover:bg-brand-hover transition-colors" style={{ boxShadow: "0 0 16px rgba(20,184,166,0.25)" }}>
                  Get Started <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </>
            )}
          </div>

          <button className="md:hidden p-2 text-text-muted hover:text-text" onClick={() => setMobileMenu(!mobileMenu)}>
            {mobileMenu ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
        {mobileMenu && (
          <div className="md:hidden border-t border-border bg-bg/98 p-5 space-y-3">
            {["#features","#how-it-works","#pricing","#faq"].map(h => (
              <a key={h} href={h} onClick={() => setMobileMenu(false)} className="block py-2 text-text-muted hover:text-text text-sm capitalize">{h.replace("#","").replace("-"," ")}</a>
            ))}
            <Link href="/contact" onClick={() => setMobileMenu(false)} className="block py-2 text-text-muted hover:text-text text-sm">Contact</Link>
            <div className="pt-3 border-t border-border flex flex-col gap-3">
              {user ? (
                <Link href="/overview" onClick={() => setMobileMenu(false)} className="text-center py-2.5 bg-brand text-bg font-bold text-sm rounded-md">Dashboard</Link>
              ) : (
                <>
                  <Link href="/login" onClick={() => setMobileMenu(false)} className="text-center text-sm text-text-muted py-2">Sign In</Link>
                  <Link href="/register" onClick={() => setMobileMenu(false)} className="text-center py-2.5 bg-brand text-bg font-bold text-sm rounded-md">Get Started</Link>
                </>
              )}
            </div>
          </div>
        )}
      </nav>

      {/* ════════ HERO ════════ */}
      <section className="relative z-10 pt-16 lg:pt-24 pb-0 overflow-hidden">
        <div className="max-w-7xl mx-auto px-5 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_480px] gap-12 lg:gap-16 items-center">

            {/* left */}
            <div className="space-y-7">
              <Eyebrow>AI · Geo Lead Intelligence · v2.4</Eyebrow>

              <h1 className="text-[clamp(3.5rem,9vw,7rem)] font-black leading-[0.92] tracking-[-0.02em] uppercase" style={{ fontFamily: BC }}>
                Find local<br />
                <span style={{ WebkitTextStroke: "1px rgba(20,184,166,0.6)", color: "transparent" }}>buyers.</span><br />
                <span className="text-brand">Close with AI.</span>
              </h1>

              <p className="text-[15px] text-text-muted leading-relaxed max-w-lg">
                GeoLead maps every high-intent local business in your niche, scores the decision-makers by AI, and fires hyper-personalized outreach — so you spend zero time prospecting and all your time closing.
              </p>

              {/* inline stats */}
              <div className="flex flex-wrap gap-2">
                <StatPill value="14,000+" label="leads discovered daily" />
                <StatPill value="89%" label="deliverability rate" />
                <StatPill value="5.8×" label="reply rate vs cold email" />
              </div>

              <div className="flex flex-col sm:flex-row gap-3 pt-1">
                <Link href="/register" className="flex items-center justify-center gap-2 px-6 py-3.5 bg-brand text-bg font-bold rounded-md text-[14px] hover:bg-brand-hover transition-all" style={{ boxShadow: "0 0 32px rgba(20,184,166,0.3)" }}>
                  Start Free — No Card <ArrowRight className="w-4 h-4" />
                </Link>
                <a href="#how-it-works" className="flex items-center justify-center gap-2 px-6 py-3.5 border border-border bg-surface/50 text-text font-bold rounded-md text-[14px] hover:border-brand/40 hover:bg-surface transition-all">
                  See how it works
                </a>
              </div>
              <p className="text-[11px] text-text-faint font-mono">Cancel anytime · CAN-SPAM compliant · Secured by Stripe</p>
            </div>

            {/* right — terminal */}
            <div className="relative">
              <div className="absolute -inset-8 rounded-full opacity-20" style={{ background: "radial-gradient(ellipse, rgba(20,184,166,0.4) 0%, transparent 70%)", filter: "blur(40px)" }} />
              <div className="relative float">
                <TerminalWindow />
              </div>
            </div>
          </div>
        </div>

        {/* bottom overflow fade */}
        <div className="mt-16 relative">
          <Ticker />
        </div>
      </section>

      {/* ════════ OVERSIZED STATS ════════ */}
      <section className="relative z-10 py-20 lg:py-28 border-b border-border overflow-hidden">
        <div className="max-w-7xl mx-auto px-5 lg:px-8">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-0 divide-x divide-y lg:divide-y-0 divide-border">
            {[
              { n: "14K+",  label: "Leads discovered\nevery single day",   accent: "#14b8a6" },
              { n: "89%",   label: "Email deliverability\nrate guaranteed",  accent: "#d97706" },
              { n: "<8min", label: "Time to your\nfirst lead list",          accent: "#38bdf8" },
              { n: "5.8×",  label: "Reply rate vs\nstandard cold email",     accent: "#10b981" },
            ].map((s, i) => (
              <div key={i} className="px-6 lg:px-10 py-8 lg:py-10 group">
                <div
                  className="text-[3.5rem] lg:text-[5rem] font-black leading-none tabular-nums mb-3 transition-colors"
                  style={{ fontFamily: BC, color: s.accent }}
                >
                  {s.n}
                </div>
                <div className="text-[13px] text-text-muted leading-relaxed whitespace-pre-line">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════ HOW IT WORKS ════════ */}
      <section id="how-it-works" className="relative z-10 py-20 lg:py-32 border-b border-border">
        <div className="max-w-7xl mx-auto px-5 lg:px-8">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-16">
            <div>
              <Eyebrow>How It Works</Eyebrow>
              <h2 className="mt-4 text-[clamp(2.5rem,6vw,5rem)] font-black uppercase leading-[0.95] tracking-[-0.01em]" style={{ fontFamily: BC }}>
                Keyword to<br />closed deal.
              </h2>
            </div>
            <p className="text-text-muted max-w-sm text-[14px] leading-relaxed lg:pb-2">
              Three steps. Eight minutes from your first input to a fully scored, verified lead list with outreach ready to fire.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-border">
            {[
              {
                num: "01",
                icon: Search,
                title: "Define Your Target",
                body: "Enter a domain idea, niche keyword, and city. GeoLead maps the entire local market — every business in that category, ranked by value.",
                detail: "dallasdental.com · Dentist · Dallas TX",
              },
              {
                num: "02",
                icon: Brain,
                title: "AI Scores Every Lead",
                body: "Priority, Match, and Intent score per prospect. Decision-maker identified by name and role. Verified contact before you spend a second.",
                detail: "Priority 96 · Dr. Chen · Owner · VALID",
              },
              {
                num: "03",
                icon: Send,
                title: "Launch & Let It Run",
                body: "One click starts the campaign. AI writes the emails, handles follow-ups, triages replies, and drafts your response before you even open the thread.",
                detail: "142 sent · 42% open · 5.2% reply",
              },
            ].map((s, i) => (
              <div key={i} className="bg-bg p-8 lg:p-10 group hover:bg-surface/40 transition-colors flex flex-col justify-between gap-8">
                <div>
                  <div className="flex items-start justify-between mb-6">
                    <span className="text-[5rem] font-black leading-none text-border" style={{ fontFamily: BC }}>{s.num}</span>
                    <div className="w-10 h-10 rounded-md bg-brand/10 border border-brand/20 flex items-center justify-center group-hover:bg-brand/20 transition-colors mt-2">
                      <s.icon className="w-5 h-5 text-brand" />
                    </div>
                  </div>
                  <h3 className="text-[1.4rem] font-black mb-3 uppercase tracking-[-0.01em]" style={{ fontFamily: BC }}>{s.title}</h3>
                  <p className="text-[13px] text-text-muted leading-relaxed">{s.body}</p>
                </div>
                <div className="font-mono text-[11px] text-brand bg-brand/8 border border-brand/15 px-3 py-2 rounded-sm">
                  ✓ {s.detail}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════ FEATURES ════════ */}
      <section id="features" className="relative z-10">
        {features.map((f, i) => (
          <div key={i} className="border-b border-border">
            <div className="max-w-7xl mx-auto px-5 lg:px-8 py-16 lg:py-24">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">

                {/* text */}
                <div className={i % 2 === 1 ? "lg:order-2" : ""}>
                  <div className="inline-flex items-center gap-2 mb-5">
                    <span className="font-mono text-[10px] font-black uppercase tracking-[0.2em] text-text-faint">{String(i + 1).padStart(2, "0")}</span>
                    <div className="w-8 h-px bg-border" />
                    <Eyebrow>{f.tag}</Eyebrow>
                  </div>
                  <h3 className="text-[clamp(2rem,4.5vw,3.5rem)] font-black uppercase leading-[0.95] tracking-[-0.01em] mb-5" style={{ fontFamily: BC }}>
                    {f.headline}
                  </h3>
                  <p className="text-[14px] text-text-muted leading-relaxed mb-8 max-w-md">{f.body}</p>
                  <Link href="/register" className="inline-flex items-center gap-2 text-brand text-[13px] font-bold hover:gap-3 transition-all group">
                    Start using this <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </Link>
                </div>

                {/* visual */}
                <div className={`relative ${i % 2 === 1 ? "lg:order-1" : ""}`}>
                  <div className="absolute inset-0 rounded-xl opacity-20" style={{ background: `radial-gradient(ellipse, ${f.accent}40 0%, transparent 70%)`, filter: "blur(40px)" }} />
                  <div className="relative bg-surface border border-border rounded-xl p-6 lg:p-8 float-slow">
                    {/* big stat */}
                    <div className="flex items-end gap-3 mb-6 pb-6 border-b border-border">
                      <span className="text-[5rem] lg:text-[6.5rem] font-black leading-none tabular-nums" style={{ fontFamily: BC, color: f.accent }}>{f.stat}</span>
                      <span className="text-[12px] text-text-muted font-mono pb-4 max-w-[140px] leading-relaxed">{f.statLabel}</span>
                    </div>
                    {/* mini lead list */}
                    <div className="space-y-3">
                      {[
                        { name: "Apex Dental Group",      score: 95, status: "REPLIED",   col: "#14b8a6" },
                        { name: "Dallas Implant Center",   score: 96, status: "VERIFIED",  col: "#10b981" },
                        { name: "Bright Smiles Clinic",    score: 81, status: "OPENED",    col: "#38bdf8" },
                      ].map((lead, j) => (
                        <div key={j} className="flex items-center justify-between text-[12px] py-2 border-b border-border/50 last:border-0">
                          <div className="flex items-center gap-2">
                            <MapPin className="w-3 h-3 text-text-faint" />
                            <span className="font-medium">{lead.name}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="font-mono font-black" style={{ color: f.accent }}>{lead.score}</span>
                            <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded-sm border" style={{ color: lead.col, background: `${lead.col}18`, borderColor: `${lead.col}40` }}>{lead.status}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 flex items-center gap-2 text-[11px] text-text-faint font-mono">
                      <div className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse" />
                      Processing in real time
                    </div>
                  </div>
                </div>

              </div>
            </div>
          </div>
        ))}
      </section>

      {/* ════════ SOCIAL PROOF — console log style ════════ */}
      <section className="relative z-10 py-20 lg:py-28 border-b border-border bg-[#060504]">
        <div className="max-w-7xl mx-auto px-5 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-16 items-center">
            <div>
              <Eyebrow>Customer Results</Eyebrow>
              <h2 className="mt-4 text-[clamp(2.5rem,6vw,5rem)] font-black uppercase leading-[0.95]" style={{ fontFamily: BC }}>
                Real operators.<br />
                <span className="text-brand">Real numbers.</span>
              </h2>
              <div className="mt-8 space-y-6">
                {[
                  { name: "James R.", role: "Domain Investor, Austin TX", quote: "Closed 3 domain sales in my first month. The AI emails are scarily good — buyers respond like they've been waiting for the call.", stars: 5 },
                  { name: "Priya N.", role: "Local SEO Agency Owner", quote: "I used to spend 6 hours building lead lists. GeoLead does it in 8 minutes and the quality is 10x better.", stars: 5 },
                  { name: "Marcus T.", role: "B2B Sales Consultant", quote: "The intent scoring alone is worth the subscription. My close rate went from 12% to 38%.", stars: 5 },
                ].map((t, i) => (
                  <div key={i} className="border-l-2 border-brand/30 pl-5 group hover:border-brand transition-colors">
                    <div className="flex gap-0.5 mb-2">
                      {Array.from({ length: t.stars }).map((_, j) => <Star key={j} className="w-3 h-3 fill-copper text-copper" />)}
                    </div>
                    <p className="text-[13px] text-text-muted leading-relaxed mb-3 italic">&ldquo;{t.quote}&rdquo;</p>
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-brand/15 border border-brand/25 flex items-center justify-center font-black text-brand text-[10px]">
                        {t.name.split(" ").map(w => w[0]).join("")}
                      </div>
                      <div>
                        <span className="font-bold text-[12px]">{t.name}</span>
                        <span className="text-text-faint text-[11px] ml-2">{t.role}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* console log */}
            <div className="bg-[#0a0908] border border-border rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-surface-2/30">
                <div className="w-2 h-2 rounded-full bg-brand animate-pulse" />
                <span className="text-[11px] font-mono text-brand font-bold">LIVE ACTIVITY LOG</span>
                <span className="ml-auto text-[10px] font-mono text-text-faint">today · Dallas TX</span>
              </div>
              <div className="p-4 space-y-2 font-mono text-[11px]">
                {[
                  { t: "10:24:01", type: "REPLY",    msg: "Apex Dental Group → 'Yes, we are interested...'",     col: "#14b8a6" },
                  { t: "10:18:44", type: "OPEN",     msg: "Lone Star Ortho opened 'Dallas dental SEO'",           col: "#10b981" },
                  { t: "10:11:32", type: "CLICK",    msg: "Bright Smiles clicked pricing link",                   col: "#38bdf8" },
                  { t: "10:04:17", type: "VERIFY",   msg: "dr.chen@dallasimplant.com → VALID",                    col: "#10b981" },
                  { t: "09:58:50", type: "REPLY",    msg: "Texas Family Dental → 'What's the asking price?'",     col: "#14b8a6" },
                  { t: "09:51:23", type: "DISCOVER", msg: "1,248 prospects found · dallasdental.com",             col: "#38bdf8" },
                  { t: "09:44:09", type: "OPEN",     msg: "Park Slope Pediatrics opened variant B",               col: "#10b981" },
                  { t: "09:37:55", type: "REPLY",    msg: "Frisco Family Dentistry → 'Can we book a call?'",      col: "#14b8a6" },
                ].map((l, i) => (
                  <div key={i} className="flex items-start gap-3 py-1.5 border-b border-border/30 last:border-0">
                    <span className="text-text-faint flex-shrink-0 w-16">{l.t}</span>
                    <span className="font-black flex-shrink-0 w-16" style={{ color: l.col }}>{l.type}</span>
                    <span className="text-text-muted">{l.msg}</span>
                  </div>
                ))}
                <div className="flex items-center gap-2 pt-2 text-text-faint">
                  <span className="inline-block w-2 h-3 bg-brand/50 animate-pulse" />
                  <span>Streaming live events...</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ════════ PRICING ════════ */}
      <section id="pricing" className="relative z-10 py-20 lg:py-32 border-b border-border overflow-hidden">
        <div className="max-w-7xl mx-auto px-5 lg:px-8">

          {/* header */}
          <div className="mb-14">
            <Eyebrow>Pricing</Eyebrow>
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 mt-4">
              <h2 className="text-[clamp(2.5rem,6vw,5rem)] font-black uppercase leading-[0.95]" style={{ fontFamily: BC }}>
                Start free.<br />Scale when ready.
              </h2>
              <p className="text-text-muted text-[14px] max-w-xs leading-relaxed lg:pb-2">
                No card for the free tier. Upgrade when you see the quality. Cancel anytime.
              </p>
            </div>
          </div>

          {/* upgrade path indicator */}
          <div className="hidden lg:flex items-center gap-0 mb-0 text-[11px] font-mono text-text-faint">
            {plans.map((p, i) => (
              <div key={p.id} className="flex items-center gap-0">
                <span className={`px-3 py-1 border rounded-sm ${p.id === "pro" ? "border-brand/40 text-brand bg-brand/8" : "border-border text-text-faint"}`}>
                  {p.label}
                </span>
                {i < plans.length - 1 && (
                  <div className="flex items-center gap-1 px-3 text-text-faint/40">
                    <div className="w-6 h-px bg-border" />
                    <ArrowRight className="w-3 h-3" />
                    <div className="w-6 h-px bg-border" />
                  </div>
                )}
              </div>
            ))}
            <span className="ml-4 text-text-faint/50">← upgrade path as usage grows</span>
          </div>

          {/* 3-col plan grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-px bg-border mt-px">
            {plans.map((plan) => {
              const isPro = plan.id === "pro";
              const isFree = plan.id === "free";
              return (
                <div
                  key={plan.id}
                  className="relative bg-bg flex flex-col gap-0 overflow-hidden"
                  style={isPro ? { borderLeft: "2px solid rgba(20,184,166,0.5)" } : {}}
                >
                  {isPro && (
                    <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at top, rgba(20,184,166,0.06) 0%, transparent 55%)" }} />
                  )}

                  <div className="relative p-7 lg:p-9 border-b border-border flex flex-col gap-5">
                    {/* label + badge */}
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: isPro ? "#14b8a6" : "#6b645e" }}>
                        {plan.label}
                      </span>
                      {plan.badge && (
                        <span className="font-mono text-[9px] font-black uppercase tracking-widest bg-brand text-bg px-2 py-0.5 rounded-sm" style={{ boxShadow: "0 0 10px rgba(20,184,166,0.4)" }}>
                          {plan.badge}
                        </span>
                      )}
                    </div>

                    {/* price */}
                    <div>
                      <div className="flex items-end gap-1.5">
                        <span
                          className="font-black leading-none tabular-nums"
                          style={{ fontFamily: BC, fontSize: "clamp(3.5rem,6vw,5rem)", color: isPro ? "#14b8a6" : "var(--text)" }}
                        >
                          {plan.price}
                        </span>
                        <span className="text-text-muted text-[13px] mb-2">{plan.priceNote}</span>
                      </div>
                      <p className="text-[12px] text-text-muted mt-1.5 leading-relaxed">{plan.tagline}</p>
                    </div>

                    {/* quota chips */}
                    <div className="flex flex-wrap gap-2">
                      {[
                        `${plan.quota.searches} search${plan.quota.searches !== 1 ? "es" : ""}${isFree ? " (lifetime)" : "/mo"}`,
                        `${plan.quota.leads} leads${isFree ? "" : "/mo"}`,
                        plan.quota.campaigns === -1 ? "unlimited campaigns" : `${plan.quota.campaigns} campaign${plan.quota.campaigns !== 1 ? "s" : ""}`,
                      ].map((q, j) => (
                        <span key={j} className="font-mono text-[10px] font-bold px-2 py-1 rounded-sm border" style={{
                          color: isPro ? "#14b8a6" : "var(--text-faint)",
                          borderColor: isPro ? "rgba(20,184,166,0.25)" : "var(--border)",
                          background: isPro ? "rgba(20,184,166,0.07)" : "var(--surface-2)",
                        }}>
                          {q}
                        </span>
                      ))}
                    </div>

                    {/* CTA */}
                    <Link
                      href={plan.ctaTo}
                      className="flex items-center justify-center gap-2 py-3 font-bold text-[13px] rounded-md transition-all"
                      style={isPro
                        ? { background: "#14b8a6", color: "var(--bg)", boxShadow: "0 0 24px rgba(20,184,166,0.3)" }
                        : { border: "1px solid var(--border)", color: "var(--text)" }
                      }
                    >
                      {plan.cta} <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>

                  {/* feature list */}
                  <div className="relative p-7 lg:p-9 flex-1">
                    <div className="space-y-2.5">
                      {plan.features.map((f, j) => (
                        <div key={j} className="flex items-start gap-3 text-[12px]">
                          <div className="mt-0.5 flex-shrink-0">
                            {f.included
                              ? <Check className="w-3.5 h-3.5" style={{ color: isPro ? "#14b8a6" : "#10b981" }} />
                              : <div className="w-3.5 h-px bg-border mt-2" />
                            }
                          </div>
                          <span className={f.included ? "text-text-muted" : "text-text-faint line-through decoration-text-faint/40"}>
                            {f.text}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* enterprise footer row */}
          <div className="mt-px bg-surface-2/20 border border-border border-t-0 p-5 lg:p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <Building2 className="w-5 h-5 text-copper flex-shrink-0" />
              <div>
                <div className="font-bold text-[13px]">Enterprise & Agencies</div>
                <div className="text-[11px] text-text-muted font-mono">Volume discounts · white-label · team seats · custom SLAs</div>
              </div>
            </div>
            <Link href="/contact" className="flex-shrink-0 flex items-center gap-2 px-5 py-2.5 border border-copper/30 text-copper text-[12px] font-bold rounded-md hover:bg-copper/8 transition-all font-mono uppercase tracking-wide">
              Talk to Sales <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </section>

      {/* ════════ FAQ ════════ */}
      <section id="faq" className="relative z-10 py-20 lg:py-28 border-b border-border">
        <div className="max-w-7xl mx-auto px-5 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-16">
            <div className="lg:sticky lg:top-24 self-start">
              <Eyebrow>FAQ</Eyebrow>
              <h2 className="mt-4 text-[clamp(2.5rem,5vw,4rem)] font-black uppercase leading-[0.95]" style={{ fontFamily: BC }}>
                Questions<br />answered.
              </h2>
              <p className="mt-4 text-[13px] text-text-muted leading-relaxed">Can&apos;t find what you&apos;re looking for? <Link href="/contact" className="text-brand hover:underline font-medium">Contact us</Link>.</p>
            </div>
            <div className="border-t border-border">
              {faqs.map((f, i) => (
                <FaqItem key={i} q={f.q} a={f.a} open={openFaq === i} onToggle={() => setOpenFaq(openFaq === i ? null : i)} />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ════════ FINAL CTA ════════ */}
      <section className="relative z-10 py-24 lg:py-36 overflow-hidden">
        <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at center, rgba(20,184,166,0.08) 0%, transparent 60%)" }} />
        <div className="relative max-w-7xl mx-auto px-5 lg:px-8 text-center">
          <div className="inline-block mb-6">
            <Eyebrow>Get Started Today</Eyebrow>
          </div>
          <h2 className="text-[clamp(3rem,9vw,8rem)] font-black uppercase leading-[0.9] tracking-[-0.02em] mb-8" style={{ fontFamily: BC }}>
            Stop prospecting.<br />
            <span className="text-brand" style={{ textShadow: "0 0 60px rgba(20,184,166,0.4)" }}>Start closing.</span>
          </h2>
          <p className="text-[15px] text-text-muted max-w-xl mx-auto mb-10 leading-relaxed">
            Start free — 5 searches, ~125 verified leads, no card required. See the quality, then decide.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/register" className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-4 bg-brand text-bg font-bold text-[15px] rounded-md hover:bg-brand-hover transition-all" style={{ boxShadow: "0 0 40px rgba(20,184,166,0.35)" }}>
              Start Free — No Card Required <ArrowRight className="w-5 h-5" />
            </Link>
            <Link href="/contact" className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-4 border border-border text-text font-bold text-[15px] rounded-md hover:border-brand/40 hover:text-brand transition-all">
              Talk to Sales
            </Link>
          </div>
          <div className="mt-6 flex items-center justify-center gap-6 text-[12px] text-text-faint font-mono flex-wrap">
            <span className="flex items-center gap-1.5"><Lock className="w-3 h-3" /> Secured by Stripe</span>
            <span className="flex items-center gap-1.5"><ShieldCheck className="w-3 h-3" /> CAN-SPAM compliant</span>
            <span className="flex items-center gap-1.5"><Check className="w-3 h-3" /> Cancel anytime</span>
          </div>
        </div>
      </section>

      {/* ════════ FOOTER ════════ */}
      <footer className="relative z-10 border-t border-border py-10">
        <div className="max-w-7xl mx-auto px-5 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-md bg-brand/20 border border-brand/25 flex items-center justify-center font-black text-xs text-brand">GL</div>
            <span className="font-black text-[14px]" style={{ fontFamily: BC }}>GeoLead AI</span>
            <span className="text-text-faint text-[12px] font-mono">· Find. Connect. Close.</span>
          </div>
          <div className="flex items-center gap-6 flex-wrap justify-center text-[13px] text-text-muted">
            <a href="#features" className="hover:text-text transition-colors">Features</a>
            <a href="#pricing" className="hover:text-text transition-colors">Pricing</a>
            <a href="#faq" className="hover:text-text transition-colors">FAQ</a>
            <Link href="/contact" className="hover:text-text transition-colors">Contact</Link>
            {user ? (
              <Link href="/overview" className="hover:text-text transition-colors">Dashboard</Link>
            ) : (
              <Link href="/login" className="hover:text-text transition-colors">Sign In</Link>
            )}
          </div>
          <div className="text-[11px] text-text-faint font-mono">© 2025 GeoLead AI</div>
        </div>
      </footer>

    </div>
  );
}
