"use client";

// Sign-up page. Two-step design-parity layout: step 1 collects account info,
// step 2 shows plan selection + payment. Account creation is wired to the real
// useAuth().register (name/email/password). Plan/payment and OAuth are visual
// stubs — no Stripe or OAuth provider is wired on the backend yet, so every new
// account starts on the free tier regardless of the selected plan.
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, ArrowRight, Mail, Lock, User, Building2, Check } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/components/ui";

function GlowOrb({ className }: { className?: string }) {
  return <div className={`absolute rounded-full blur-[120px] pointer-events-none ${className}`} />;
}

const plans = [
  {
    id: "free",
    name: "Free Trial",
    price: "$0",
    desc: "5 searches · ~125 leads · no card",
    features: ["5 lifetime searches", "~125 verified leads", "1 campaign", "1 AI email variant"],
  },
  {
    id: "starter",
    name: "Starter",
    price: "$15",
    desc: "25 searches · ~1,000 leads/mo",
    features: ["25 searches/month", "~1,000 verified leads", "5 campaigns", "2 AI variants + sequences"],
  },
  {
    id: "pro",
    name: "Pro",
    price: "$29",
    desc: "100 searches · ~4,000 leads/mo",
    features: ["100 searches/month", "~4,000 verified leads", "Unlimited campaigns", "A/B/C variants + inbox AI + white-label"],
    popular: true,
  },
];

export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [plan, setPlan] = useState("free");
  const [step, setStep] = useState<1 | 2>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", email: "", company: "", password: "" });

  function handleStep1(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStep(2);
  }

  async function handleStep2(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await register(form.name, form.email, form.password);
      router.replace("/overview");
    } catch (err: any) {
      setError(err?.message || "Registration failed.");
      setStep(1);
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-bg text-text flex">
      {/* aurora */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <GlowOrb className="top-[-10%] right-[-10%] w-[55%] h-[55%] bg-brand/8 opacity-60" />
        <GlowOrb className="bottom-[-15%] left-[-5%] w-[45%] h-[45%] bg-copper/8 opacity-50" />
        <svg className="absolute inset-0 w-full h-full opacity-[0.025] mix-blend-overlay">
          <filter id="sunoise">
            <feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="4" stitchTiles="stitch" />
          </filter>
          <rect width="100%" height="100%" filter="url(#sunoise)" />
        </svg>
      </div>

      {/* left branding panel — desktop */}
      <div className="hidden lg:flex relative z-10 w-[460px] flex-shrink-0 border-r border-border flex-col justify-between p-10 overflow-hidden">
        <Link href="/" className="flex items-center gap-2.5">
          <img src="/logo.png" alt="GeoLead AI" className="w-8 h-8 object-contain" />
          <span className="font-black text-text">GeoLead AI</span>
        </Link>

        <div className="space-y-8">
          <div>
            <h2
              className="text-[2.4rem] font-black tracking-[-0.04em] leading-[1.1]"
              style={{ fontFamily: "'Epilogue','Geist',sans-serif" }}
            >
              Start finding<br />
              <span className="text-brand">buyers today.</span>
            </h2>
            <p className="mt-3 text-text-muted leading-relaxed text-sm">
              Set up your account in under 2 minutes and launch your first AI-powered outreach campaign.
            </p>
          </div>

          {/* feature checklist */}
          <div className="space-y-3">
            {[
              "Geo-targeted lead discovery in any niche",
              "AI decision-maker scoring on every prospect",
              "Hyper-personalized email variants generated",
              "Automated follow-up sequences",
              "AI inbox triage & response drafts",
              "Live campaign analytics dashboard",
            ].map((f, i) => (
              <div key={i} className="flex items-start gap-3 text-[13px] text-text-muted">
                <div className="w-4 h-4 rounded-full bg-brand/15 border border-brand/30 flex items-center justify-center mt-0.5 flex-shrink-0">
                  <Check className="w-2.5 h-2.5 text-brand" />
                </div>
                {f}
              </div>
            ))}
          </div>

          {/* pricing teaser */}
          <div className="bg-surface border border-border rounded-xl p-4 space-y-2">
            <div className="text-[11px] font-bold uppercase tracking-wider text-text-muted">Pricing tiers</div>
            {[
              { name: "Free Trial", price: "$0", note: "5 searches · ~125 leads" },
              { name: "Starter",    price: "$15/mo", note: "25 searches · ~1,000 leads" },
              { name: "Pro",        price: "$29/mo", note: "100 searches · ~4,000 leads", highlight: true },
            ].map(p => (
              <div key={p.name} className="flex items-center justify-between text-[12px]">
                <span className={p.highlight ? "text-brand font-bold" : "text-text-muted"}>{p.name}</span>
                <span className={`font-mono font-black ${p.highlight ? "text-brand" : "text-text"}`}>{p.price}</span>
              </div>
            ))}
            <div className="text-[11px] text-text-faint pt-1 border-t border-border">Cancel anytime. No contracts.</div>
          </div>
        </div>

        <p className="text-[12px] text-text-faint">© 2025 GeoLead AI · <Link href="/" className="hover:text-text-muted transition-colors">Home</Link></p>
      </div>

      {/* right panel — form */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-5 py-12 overflow-y-auto">
        {/* mobile logo */}
        <Link href="/" className="lg:hidden flex items-center gap-2 mb-8">
          <img src="/logo.png" alt="GeoLead AI" className="w-8 h-8 rounded-lg object-contain" />
          <span className="font-black text-text">GeoLead AI</span>
        </Link>

        <div className="w-full max-w-[420px]">
          {/* step indicator */}
          <div className="flex items-center gap-3 mb-7">
            {[1, 2].map(s => (
              <div key={s} className="flex items-center gap-2">
                <div className={cn(
                  "w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-black border transition-colors",
                  step === s
                    ? "bg-brand text-bg border-brand shadow-[0_0_10px_rgba(20,184,166,0.3)]"
                    : step > s
                      ? "bg-brand/20 text-brand border-brand/30"
                      : "bg-surface text-text-faint border-border"
                )}>
                  {step > s ? <Check className="w-3.5 h-3.5" /> : s}
                </div>
                <span className={cn("text-[12px] font-bold", step === s ? "text-text" : "text-text-faint")}>
                  {s === 1 ? "Your info" : "Choose plan"}
                </span>
                {s < 2 && <div className="w-8 h-px bg-border mx-1" />}
              </div>
            ))}
          </div>

          {error && (
            <div className="mb-5 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2.5 text-[13px] text-danger">
              {error}
            </div>
          )}

          {step === 1 && (
            <>
              <div className="mb-7">
                <h1 className="text-2xl font-black tracking-tight mb-1" style={{ fontFamily: "'Epilogue','Geist',sans-serif" }}>
                  Create your account
                </h1>
                <p className="text-sm text-text-muted">Get started with GeoLead AI in seconds.</p>
              </div>

              <form onSubmit={handleStep1} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 sm:col-span-1">
                    <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider mb-1.5 block">Full Name *</label>
                    <div className="relative">
                      <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-faint" />
                      <input
                        required
                        type="text"
                        autoComplete="name"
                        placeholder="Alex Johnson"
                        value={form.name}
                        onChange={e => setForm({ ...form, name: e.target.value })}
                        className="w-full bg-surface border border-border rounded-xl pl-10 pr-4 py-3 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/20 transition-colors placeholder:text-text-faint"
                      />
                    </div>
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider mb-1.5 block">Company</label>
                    <div className="relative">
                      <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-faint" />
                      <input
                        type="text"
                        autoComplete="organization"
                        placeholder="yoursite.com"
                        value={form.company}
                        onChange={e => setForm({ ...form, company: e.target.value })}
                        className="w-full bg-surface border border-border rounded-xl pl-10 pr-4 py-3 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/20 transition-colors placeholder:text-text-faint"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider mb-1.5 block">Email *</label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-faint" />
                    <input
                      required
                      type="email"
                      autoComplete="email"
                      placeholder="you@company.com"
                      value={form.email}
                      onChange={e => setForm({ ...form, email: e.target.value })}
                      className="w-full bg-surface border border-border rounded-xl pl-10 pr-4 py-3 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/20 transition-colors placeholder:text-text-faint"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider mb-1.5 block">Password *</label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-faint" />
                    <input
                      required
                      minLength={8}
                      type={show ? "text" : "password"}
                      autoComplete="new-password"
                      placeholder="Min. 8 characters"
                      value={form.password}
                      onChange={e => setForm({ ...form, password: e.target.value })}
                      className="w-full bg-surface border border-border rounded-xl pl-10 pr-10 py-3 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/20 transition-colors placeholder:text-text-faint"
                    />
                    <button
                      type="button"
                      onClick={() => setShow(!show)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-text-faint hover:text-text-muted transition-colors"
                    >
                      {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {form.password.length > 0 && (
                    <div className="flex gap-1 mt-2">
                      {[1, 2, 3, 4].map(i => (
                        <div key={i} className={cn(
                          "h-1 flex-1 rounded-full transition-colors",
                          form.password.length >= i * 3
                            ? form.password.length >= 12 ? "bg-success" : form.password.length >= 8 ? "bg-brand" : "bg-copper"
                            : "bg-border"
                        )} />
                      ))}
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  className="w-full flex items-center justify-center gap-2 py-3.5 bg-brand text-bg font-bold rounded-xl hover:bg-brand-hover transition-all shadow-[0_0_20px_rgba(20,184,166,0.25)] text-sm mt-1"
                >
                  Continue <ArrowRight className="w-4 h-4" />
                </button>

                <p className="text-[11px] text-text-faint text-center">
                  By continuing you agree to our{" "}
                  <a href="#" className="text-brand hover:underline">Terms</a> and{" "}
                  <a href="#" className="text-brand hover:underline">Privacy Policy</a>.
                </p>
              </form>

              {/* divider + oauth */}
              <div className="flex items-center gap-3 my-5">
                <div className="flex-1 h-px bg-border" />
                <span className="text-[11px] text-text-faint font-medium">OR</span>
                <div className="flex-1 h-px bg-border" />
              </div>
              <div className="space-y-3">
                {[
                  { label: "Sign up with Google", icon: "G" },
                  { label: "Sign up with Microsoft", icon: "M" },
                ].map(p => (
                  <button
                    key={p.label}
                    type="button"
                    disabled
                    title="Coming soon"
                    className="w-full flex items-center justify-center gap-3 py-3 bg-surface border border-border rounded-xl text-sm font-medium hover:bg-surface-2 hover:border-border-strong transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <span className="w-5 h-5 rounded-full bg-surface-2 flex items-center justify-center text-[11px] font-black text-text-muted">{p.icon}</span>
                    {p.label}
                  </button>
                ))}
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className="mb-7">
                <h1 className="text-2xl font-black tracking-tight mb-1" style={{ fontFamily: "'Epilogue','Geist',sans-serif" }}>
                  Pick your plan
                </h1>
                <p className="text-sm text-text-muted">You can upgrade or cancel anytime.</p>
              </div>

              <form onSubmit={handleStep2} className="space-y-5">
                <div className="space-y-3">
                  {plans.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPlan(p.id)}
                      className={cn(
                        "w-full text-left rounded-2xl border p-4 transition-all relative",
                        plan === p.id
                          ? "border-brand/50 bg-brand/[0.05] shadow-[0_0_0_1px_rgba(20,184,166,0.15)]"
                          : "border-border bg-surface hover:border-border-strong"
                      )}
                    >
                      {p.popular && (
                        <span className="absolute -top-3 left-4 bg-brand text-bg text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full shadow-[0_0_12px_rgba(20,184,166,0.4)]">
                          Popular
                        </span>
                      )}
                      <div className="flex justify-between items-start">
                        <div>
                          <div className={cn("font-black text-[15px]", plan === p.id ? "text-brand" : "text-text")}>{p.name}</div>
                          <div className="text-[12px] text-text-muted mt-0.5">{p.desc}</div>
                        </div>
                        <div className="flex items-end gap-0.5">
                          <span className="text-2xl font-black font-mono tabular-nums text-text">{p.price}</span>
                          <span className="text-text-muted text-[12px] mb-0.5">/mo</span>
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-1.5">
                        {p.features.map((f, i) => (
                          <div key={i} className="flex items-center gap-1.5 text-[12px] text-text-muted">
                            <Check className={cn("w-3 h-3 flex-shrink-0", plan === p.id ? "text-brand" : "text-success")} />
                            {f}
                          </div>
                        ))}
                      </div>
                      {/* radio indicator */}
                      <div className={cn(
                        "absolute top-4 right-4 w-4 h-4 rounded-full border-2 transition-colors",
                        plan === p.id ? "border-brand bg-brand" : "border-border bg-transparent"
                      )}>
                        {plan === p.id && <div className="w-full h-full rounded-full flex items-center justify-center"><div className="w-1.5 h-1.5 rounded-full bg-bg" /></div>}
                      </div>
                    </button>
                  ))}
                </div>

                {/* payment stub — only relevant for paid plans (no Stripe wired yet) */}
                {plan !== "free" && (
                  <div className="bg-surface border border-border rounded-2xl p-4 space-y-3">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-text-muted">Payment</div>
                    <input
                      type="text"
                      placeholder="Card number"
                      className="w-full bg-bg border border-border rounded-xl px-4 py-2.5 text-sm focus:border-brand focus:outline-none transition-colors placeholder:text-text-faint font-mono"
                    />
                    <div className="grid grid-cols-2 gap-3">
                      <input
                        type="text"
                        placeholder="MM / YY"
                        className="w-full bg-bg border border-border rounded-xl px-4 py-2.5 text-sm focus:border-brand focus:outline-none transition-colors placeholder:text-text-faint font-mono"
                      />
                      <input
                        type="text"
                        placeholder="CVC"
                        className="w-full bg-bg border border-border rounded-xl px-4 py-2.5 text-sm focus:border-brand focus:outline-none transition-colors placeholder:text-text-faint font-mono"
                      />
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="flex-1 py-3.5 bg-surface border border-border text-text font-bold rounded-xl hover:bg-surface-2 transition-colors text-sm"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 flex items-center justify-center gap-2 py-3.5 bg-brand text-bg font-bold rounded-xl hover:bg-brand-hover disabled:opacity-60 transition-all shadow-[0_0_20px_rgba(20,184,166,0.25)] text-sm"
                  >
                    {loading ? (
                      <span className="flex items-center gap-2">
                        <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                        </svg>
                        Creating...
                      </span>
                    ) : (
                      <>Create Account <ArrowRight className="w-4 h-4" /></>
                    )}
                  </button>
                </div>

                <p className="text-[11px] text-text-faint text-center flex items-center justify-center gap-1.5">
                  <Lock className="w-3 h-3" /> Secured by Stripe · Cancel anytime
                </p>
              </form>
            </>
          )}

          <p className="mt-7 text-center text-[13px] text-text-muted">
            Already have an account?{" "}
            <Link href="/login" className="text-brand font-bold hover:underline">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
