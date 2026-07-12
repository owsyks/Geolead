"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Eye, EyeOff, Lock, Mail, ShieldCheck, User } from "lucide-react";
import { useAuth } from "@/lib/auth";

function GlowOrb({ className }: { className?: string }) {
  return <div className={`absolute rounded-full blur-[120px] pointer-events-none ${className}`} />;
}

export default function RegisterPage() {
  const { requestRegistrationCode, register } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const [form, setForm] = useState({ name: "", email: "", password: "", code: "" });

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = window.setInterval(() => setResendIn((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [resendIn]);

  async function sendCode() {
    setError(null);
    setBusy(true);
    try {
      const result = await requestRegistrationCode(form.email);
      setResendIn(result.resendAfterSeconds);
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send verification code.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDetails(event: React.FormEvent) {
    event.preventDefault();
    await sendCode();
  }

  async function handleVerify(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await register(form.name, form.email, form.password, form.code);
      router.replace("/pricing?welcome=1");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-bg text-text flex">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <GlowOrb className="top-[-10%] right-[-10%] w-[55%] h-[55%] bg-brand/10" />
        <GlowOrb className="bottom-[-15%] left-[-5%] w-[45%] h-[45%] bg-copper/10" />
      </div>

      <aside className="hidden lg:flex relative w-[440px] border-r border-border p-10 flex-col justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <img src="/logo.png" alt="GeoLead AI" className="w-8 h-8 object-contain" />
          <span className="font-black">GeoLead AI</span>
        </Link>
        <div>
          <h2 className="text-4xl font-black tracking-tight leading-tight">Find the right buyers.<br /><span className="text-brand">Keep every workspace private.</span></h2>
          <div className="mt-8 space-y-3 text-sm text-text-muted">
            {["7-day trial with no payment card", "Email verified before account creation", "One-time crypto plans through Paymento", "Tenant-isolated leads, domains and mailboxes"].map((item) => (
              <div key={item} className="flex gap-3"><Check className="w-4 h-4 text-brand mt-0.5 shrink-0" />{item}</div>
            ))}
          </div>
        </div>
        <p className="text-xs text-text-faint">GeoLead AI · Secure B2B lead operations</p>
      </aside>

      <main className="relative flex-1 flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-[430px]">
          <Link href="/" className="lg:hidden flex items-center gap-2 mb-8 font-black"><img src="/logo.png" alt="" className="w-8 h-8" />GeoLead AI</Link>
          <div className="flex items-center gap-3 mb-7 text-xs font-bold">
            <span className={`w-7 h-7 rounded-full grid place-items-center border ${step === 1 ? "bg-brand text-bg border-brand" : "bg-brand/15 text-brand border-brand/30"}`}>{step > 1 ? <Check className="w-4 h-4" /> : 1}</span>
            <span className={step === 1 ? "text-text" : "text-text-muted"}>Account details</span>
            <span className="h-px flex-1 bg-border" />
            <span className={`w-7 h-7 rounded-full grid place-items-center border ${step === 2 ? "bg-brand text-bg border-brand" : "bg-surface text-text-faint border-border"}`}>2</span>
            <span className={step === 2 ? "text-text" : "text-text-muted"}>Verify email</span>
          </div>

          {error && <div className="mb-5 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm text-danger">{error}</div>}

          {step === 1 ? (
            <form onSubmit={handleDetails} className="space-y-4">
              <div className="mb-7"><h1 className="text-3xl font-black">Create your account</h1><p className="text-sm text-text-muted mt-1">We verify your mailbox before creating any account data.</p></div>
              <Field icon={<User />} label="Full name"><input required maxLength={200} autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Alex Johnson" className="w-full bg-surface border border-border rounded-xl pl-10 pr-4 py-3 text-sm focus:border-brand focus:outline-none" /></Field>
              <Field icon={<Mail />} label="Work email"><input required type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@company.com" className="w-full bg-surface border border-border rounded-xl pl-10 pr-4 py-3 text-sm focus:border-brand focus:outline-none" /></Field>
              <Field icon={<Lock />} label="Password">
                <input required minLength={12} type={showPassword ? "text" : "password"} autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="At least 12 characters" className="w-full bg-surface border border-border rounded-xl pl-10 pr-11 py-3 text-sm focus:border-brand focus:outline-none" />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-faint">{showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
              </Field>
              <p className="text-xs text-text-faint">Use 12+ characters with uppercase, lowercase, a number, and a symbol.</p>
              <button disabled={busy} className="w-full py-3.5 rounded-xl bg-brand text-bg font-bold flex items-center justify-center gap-2 disabled:opacity-60">{busy ? "Sending code…" : <>Verify email <ArrowRight className="w-4 h-4" /></>}</button>
            </form>
          ) : (
            <form onSubmit={handleVerify} className="space-y-5">
              <div className="mb-7"><ShieldCheck className="w-10 h-10 text-brand mb-3" /><h1 className="text-3xl font-black">Check your email</h1><p className="text-sm text-text-muted mt-1">Enter the 6-digit code sent to <span className="text-text font-semibold">{form.email}</span>. It expires in 10 minutes.</p></div>
              <input required inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.replace(/\D/g, "").slice(0, 6) })} className="w-full bg-surface border border-border rounded-xl px-4 py-4 text-center text-3xl tracking-[0.45em] font-mono focus:border-brand focus:outline-none" aria-label="Six-digit verification code" />
              <button disabled={busy || form.code.length !== 6} className="w-full py-3.5 rounded-xl bg-brand text-bg font-bold disabled:opacity-60">{busy ? "Creating account…" : "Create account"}</button>
              <div className="flex justify-between text-xs">
                <button type="button" onClick={() => setStep(1)} className="text-text-muted hover:text-text">Change details</button>
                <button type="button" disabled={busy || resendIn > 0} onClick={sendCode} className="text-brand disabled:text-text-faint">{resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}</button>
              </div>
            </form>
          )}

          <p className="mt-7 text-center text-sm text-text-muted">Already have an account? <Link href="/login" className="text-brand font-bold">Sign in</Link></p>
        </div>
      </main>
    </div>
  );
}

function Field({ icon, label, children }: { icon: React.ReactElement; label: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-[11px] font-bold text-text-muted uppercase tracking-wider mb-1.5 block">{label}</span><div className="relative [&>svg]:absolute [&>svg]:left-3.5 [&>svg]:top-1/2 [&>svg]:-translate-y-1/2 [&>svg]:w-4 [&>svg]:h-4 [&>svg]:text-text-faint">{icon}{children}</div></label>;
}
