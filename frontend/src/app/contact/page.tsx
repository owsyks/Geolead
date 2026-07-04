"use client";

// Public marketing "Contact us" page. Linked from the Landing nav, pricing,
// FAQ, and footer (and whitelisted as a PUBLIC_ROUTE in lib/auth). Submissions
// POST to /api/contact, which files a SupportTicket the admin team triages
// from the same Tickets tab as in-app support requests.
import { useState } from "react";
import Link from "next/link";
import {
  MapPin, Mail, MessageSquare, Send, CheckCircle2,
  ArrowLeft, Building2, Clock, Zap,
} from "lucide-react";
import { fetchOutbound } from "@/lib/outbound";

// Match Landing's heading font stack (falls back to Geist — neither marketing
// display font is loaded, so the fallback is what actually renders).
const BC = "'Barlow Condensed', 'Geist', sans-serif";

function GlowOrb({ className }: { className?: string }) {
  return <div className={`absolute rounded-full blur-[120px] pointer-events-none ${className}`} />;
}

export default function ContactPage() {
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", email: "", company: "", subject: "General", message: "" });
  const [hp, setHp] = useState(false); // honeypot checkbox — real users never check this

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSending(true);
    try {
      await fetchOutbound("/api/contact", { method: "POST", body: JSON.stringify({ ...form, hp }) });
      setSent(true);
    } catch (err: any) {
      setError(err?.message || "Something went wrong. Please try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    // `dark` is pinned so this marketing page always renders dark (same dark-only
    // design as the Landing), regardless of the user's app theme.
    <div className="dark min-h-screen bg-bg text-text overflow-x-hidden">
      {/* aurora */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <GlowOrb className="top-[-10%] left-[-5%] w-[50%] h-[50%] bg-brand/8 opacity-60" />
        <GlowOrb className="bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-copper/8 opacity-50" />
        <svg className="absolute inset-0 w-full h-full opacity-[0.025] mix-blend-overlay">
          <filter id="cnoise">
            <feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="4" stitchTiles="stitch" />
          </filter>
          <rect width="100%" height="100%" filter="url(#cnoise)" />
        </svg>
      </div>

      {/* nav */}
      <nav className="relative z-40 border-b border-border" style={{ background: "rgba(12,10,9,0.8)", backdropFilter: "blur(16px)" }}>
        <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 group">
            <ArrowLeft className="w-4 h-4 text-text-muted group-hover:text-text transition-colors" />
            <img src="/logo.png" alt="GeoLead AI" className="w-7 h-7 rounded-md object-contain" />
            <span className="font-black text-text">GeoLead AI</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm text-text-muted hover:text-text transition-colors">Sign In</Link>
            <Link href="/register" className="px-4 py-2 bg-brand text-bg text-sm font-bold rounded-lg hover:bg-brand-hover transition-colors shadow-[0_0_12px_rgba(20,184,166,0.25)]">
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      <div className="relative z-10 max-w-6xl mx-auto px-5 py-16 lg:py-24">
        {/* header */}
        <div className="max-w-2xl mb-14">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-brand bg-brand/10 border border-brand/20 px-3 py-1 rounded-full mb-4">
            <MessageSquare className="w-3.5 h-3.5" /> Contact Us
          </span>
          <h1
            className="text-[clamp(2.2rem,5vw,3.5rem)] font-black tracking-[-0.04em] leading-[1.05]"
            style={{ fontFamily: BC }}
          >
            Let{"'"}s talk.<br />
            <span className="text-brand">We{"'"}re fast.</span>
          </h1>
          <p className="mt-4 text-text-muted text-lg leading-relaxed max-w-lg">
            Whether you have a question, a custom plan request, or just want to see a live demo — drop us a message and we{"'"}ll get back to you within a few hours.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-10 items-start">
          {/* form */}
          <div className="bg-surface border border-border rounded-2xl p-6 lg:p-8">
            {sent ? (
              <div className="flex flex-col items-center justify-center py-16 text-center gap-4">
                <div className="w-16 h-16 rounded-full bg-success/10 border border-success/20 flex items-center justify-center">
                  <CheckCircle2 className="w-8 h-8 text-success" />
                </div>
                <div>
                  <h2 className="text-xl font-black mb-2">Message sent!</h2>
                  <p className="text-text-muted text-sm max-w-xs mx-auto">We{"'"}ll reply to <strong className="text-text">{form.email}</strong> within a few hours. Check your inbox.</p>
                </div>
                <button
                  onClick={() => setSent(false)}
                  className="mt-4 text-sm text-brand font-bold hover:underline"
                >
                  Send another message
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Honeypot — hidden from real users via off-screen positioning, not
                    display:none, since some bots skip inputs with display:none. A
                    checkbox (not a text input) specifically avoids browser/OS contact
                    autofill (e.g. Safari's Contact Info autofill), which will populate
                    any eligible hidden text field but never toggles a checkbox. */}
                <input
                  type="checkbox"
                  checked={hp}
                  onChange={e => setHp(e.target.checked)}
                  tabIndex={-1}
                  aria-hidden="true"
                  className="absolute -left-[9999px] w-px h-px opacity-0"
                />

                {error && (
                  <div className="text-sm text-danger bg-danger/10 border border-danger/20 rounded-xl px-4 py-2.5">{error}</div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider mb-1.5 block">Full Name *</label>
                    <input
                      required
                      type="text"
                      placeholder="Alex Johnson"
                      value={form.name}
                      onChange={e => setForm({ ...form, name: e.target.value })}
                      className="w-full bg-bg border border-border rounded-xl px-4 py-2.5 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/20 transition-colors placeholder:text-text-faint"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider mb-1.5 block">Email *</label>
                    <input
                      required
                      type="email"
                      placeholder="alex@company.com"
                      value={form.email}
                      onChange={e => setForm({ ...form, email: e.target.value })}
                      className="w-full bg-bg border border-border rounded-xl px-4 py-2.5 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/20 transition-colors placeholder:text-text-faint"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider mb-1.5 block">Company / Website</label>
                  <input
                    type="text"
                    placeholder="yourdomain.com"
                    value={form.company}
                    onChange={e => setForm({ ...form, company: e.target.value })}
                    className="w-full bg-bg border border-border rounded-xl px-4 py-2.5 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/20 transition-colors placeholder:text-text-faint"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider mb-1.5 block">Subject</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {["General", "Sales", "Support", "Enterprise"].map(s => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setForm({ ...form, subject: s })}
                        className={`py-2 rounded-xl text-sm font-bold border transition-colors ${
                          form.subject === s
                            ? "bg-brand/10 border-brand/40 text-brand"
                            : "bg-bg border-border text-text-muted hover:border-brand/30 hover:text-text"
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider mb-1.5 block">Message *</label>
                  <textarea
                    required
                    rows={5}
                    placeholder="Tell us what you need..."
                    value={form.message}
                    onChange={e => setForm({ ...form, message: e.target.value })}
                    className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/20 transition-colors resize-none placeholder:text-text-faint"
                  />
                </div>

                <button
                  type="submit"
                  disabled={sending}
                  className="w-full flex items-center justify-center gap-2 py-3.5 bg-brand text-bg font-bold rounded-xl hover:bg-brand-hover transition-all shadow-[0_0_20px_rgba(20,184,166,0.25)] text-sm disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {sending ? "Sending..." : "Send Message"} <Send className="w-4 h-4" />
                </button>
              </form>
            )}
          </div>

          {/* side info */}
          <div className="space-y-5 lg:sticky lg:top-8">
            {[
              {
                icon: Mail,
                color: "text-brand",
                bg: "bg-brand/10",
                border: "border-brand/20",
                title: "Email us directly",
                body: "hello@geolead.ai",
                sub: "We reply within 4 hours on business days.",
              },
              {
                icon: Clock,
                color: "text-copper",
                bg: "bg-copper/10",
                border: "border-copper/20",
                title: "Business hours",
                body: "Mon–Fri, 9am–6pm CST",
                sub: "Urgent? Mark your subject 'URGENT' for priority.",
              },
              {
                icon: Building2,
                color: "text-info",
                bg: "bg-info/10",
                border: "border-info/20",
                title: "Enterprise & agencies",
                body: "Custom pricing available",
                sub: "Volume discounts, white-label, and team seats.",
              },
              {
                icon: Zap,
                color: "text-success",
                bg: "bg-success/10",
                border: "border-success/20",
                title: "Need a live demo?",
                body: "Book a 20-min call",
                sub: "We'll walk you through a real campaign live.",
              },
            ].map((card, i) => (
              <div key={i} className={`bg-surface border ${card.border} rounded-2xl p-5 flex gap-4`}>
                <div className={`w-10 h-10 rounded-xl ${card.bg} flex items-center justify-center flex-shrink-0`}>
                  <card.icon className={`w-5 h-5 ${card.color}`} />
                </div>
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-text-muted mb-0.5">{card.title}</div>
                  <div className="font-bold text-sm text-text">{card.body}</div>
                  <div className="text-[12px] text-text-muted mt-0.5">{card.sub}</div>
                </div>
              </div>
            ))}

            {/* location */}
            <div className="bg-surface border border-border rounded-2xl p-5 flex gap-4">
              <div className="w-10 h-10 rounded-xl bg-surface-2 flex items-center justify-center flex-shrink-0">
                <MapPin className="w-5 h-5 text-text-muted" />
              </div>
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-text-muted mb-0.5">Headquartered</div>
                <div className="font-bold text-sm text-text">Austin, TX</div>
                <div className="text-[12px] text-text-muted mt-0.5">Serving operators across the US & Canada.</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
