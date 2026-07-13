"use client";

// Sign-in page. Split-panel marketing layout (design parity) wired to the real
// auth flow via useAuth().login. OAuth buttons are visual stubs — there is no
// OAuth provider wired on the backend yet (auth schema is "OAuth-ready").
import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, ArrowRight, Mail, Lock } from "lucide-react";
import { useAuth } from "@/lib/auth";

function GlowOrb({ className }: { className?: string }) {
  return <div className={`absolute rounded-full blur-[120px] pointer-events-none ${className}`} />;
}

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(form.email, form.password, true);
      const next = new URLSearchParams(window.location.search).get("next");
      router.replace(next && next.startsWith("/") ? next : "/overview");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed.");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-bg text-text flex">
      {/* aurora background */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <GlowOrb className="top-[-15%] left-[-10%] w-[60%] h-[60%] bg-brand/8 opacity-70" />
        <GlowOrb className="bottom-[-10%] right-[-5%] w-[45%] h-[45%] bg-copper/8 opacity-50" />
        <svg className="absolute inset-0 w-full h-full opacity-[0.025] mix-blend-overlay">
          <filter id="sinoise">
            <feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="4" stitchTiles="stitch" />
          </filter>
          <rect width="100%" height="100%" filter="url(#sinoise)" />
        </svg>
      </div>

      {/* left panel — branding (desktop only) */}
      <div className="hidden lg:flex relative z-10 w-[480px] flex-shrink-0 border-r border-border flex-col justify-between p-10 overflow-hidden">
        <Link href="/" className="flex items-center gap-2.5">
          <Image src="/logo.png" alt="GeoLead AI" width={32} height={32} className="w-8 h-8 object-contain" priority />
          <span className="font-black text-text">GeoLead AI</span>
        </Link>

        <div className="space-y-8">
          <div>
            <h2
              className="text-[2.4rem] font-black tracking-[-0.04em] leading-[1.1]"
              style={{ fontFamily: "'Epilogue','Geist',sans-serif" }}
            >
              Your leads are<br />
              <span className="text-brand">waiting.</span>
            </h2>
            <p className="mt-4 text-text-muted leading-relaxed">
              Sign in and pick up right where you left off — your campaigns, your leads, your inbox.
            </p>
          </div>

          {/* live activity ticker */}
          <div className="bg-surface border border-border rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 rounded-full bg-brand shadow-[0_0_8px_var(--brand)] animate-pulse" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-brand">Live Activity</span>
            </div>
            {[
              { type: "REPLIED", firm: "Apex Dental Group", time: "Just now", color: "text-brand bg-brand/10 border-brand/20" },
              { type: "OPENED", firm: "Lone Star Ortho", time: "4m ago", color: "text-success bg-success/10 border-success/20" },
              { type: "VERIFIED", firm: "Bright Smiles Clinic", time: "9m ago", color: "text-info bg-info/10 border-info/20" },
            ].map((ev, i) => (
              <div key={i} className="flex items-center gap-3 text-[12px]">
                <span className={`font-bold px-1.5 py-0.5 rounded border text-[10px] whitespace-nowrap ${ev.color}`}>{ev.type}</span>
                <span className="text-text font-medium truncate">{ev.firm}</span>
                <span className="text-text-faint ml-auto whitespace-nowrap">{ev.time}</span>
              </div>
            ))}
          </div>

          {/* social proof */}
          <div className="flex gap-6">
            {[
              { val: "14k+", label: "Leads / day" },
              { val: "89%", label: "Deliverability" },
              { val: "5.8x", label: "Reply rate" },
            ].map(s => (
              <div key={s.label}>
                <div className="text-xl font-black font-mono text-brand">{s.val}</div>
                <div className="text-[11px] text-text-muted font-medium">{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-[12px] text-text-faint">© 2025 GeoLead AI · <Link href="/" className="hover:text-text-muted transition-colors">Home</Link></p>
      </div>

      {/* right panel — form */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-5 py-12">
        {/* mobile logo */}
        <Link href="/" className="lg:hidden flex items-center gap-2 mb-10">
          <Image src="/logo.png" alt="GeoLead AI" width={32} height={32} className="w-8 h-8 rounded-lg object-contain" priority />
          <span className="font-black text-text">GeoLead AI</span>
        </Link>

        <div className="w-full max-w-[400px]">
          <div className="mb-8">
            <h1 className="text-2xl font-black tracking-tight mb-1" style={{ fontFamily: "'Epilogue','Geist',sans-serif" }}>
              Welcome back
            </h1>
            <p className="text-sm text-text-muted">Sign in to your GeoLead account.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2.5 text-[13px] text-danger">
                {error}
              </div>
            )}

            <div>
              <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider mb-1.5 block">Email</label>
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
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Password</label>
                <Link href="/forgot-password" className="text-[11px] text-brand hover:underline font-medium">Forgot password?</Link>
              </div>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-faint" />
                <input
                  required
                  type={show ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••"
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
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3.5 bg-brand text-bg font-bold rounded-xl hover:bg-brand-hover disabled:opacity-60 disabled:cursor-not-allowed transition-all shadow-[0_0_20px_rgba(20,184,166,0.25)] text-sm mt-2"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  Signing in...
                </span>
              ) : (
                <>Sign In <ArrowRight className="w-4 h-4" /></>
              )}
            </button>
          </form>

          {/* divider */}
          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-border" />
            <span className="text-[11px] text-text-faint font-medium">OR</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* oauth stubs — not yet wired on the backend */}
          <div className="space-y-3">
            {[
              { label: "Continue with Google", icon: "G" },
              { label: "Continue with Microsoft", icon: "M" },
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

          <p className="mt-8 text-center text-[13px] text-text-muted">
            Don{"'"}t have an account?{" "}
            <Link href="/register" className="text-brand font-bold hover:underline">Create one free</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
