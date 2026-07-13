"use client";

// Shared visual shell for the auth pages (login/register/forgot/reset/verify).
// Centered glass card on the app's warm coffee-black background, with brand + subtitle.
import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <Link href="/" className="inline-flex items-center gap-2.5 text-lg font-black text-text">
            <Image src="/logo.png" alt="GeoLead AI" width={36} height={36} className="w-9 h-9 object-contain" priority />
            GeoLead AI
          </Link>
        </div>
        <div className="glass rounded-2xl border border-border p-7 shadow-[0_8px_32px_rgba(0,0,0,.37)]">
          <h1 className="text-xl font-black text-text">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-text-muted">{subtitle}</p> : null}
          <div className="mt-6">{children}</div>
        </div>
        {footer ? <div className="mt-5 text-center text-sm text-text-muted">{footer}</div> : null}
      </div>
    </div>
  );
}

export function Field({
  label,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-text-muted">{label}</span>
      <input
        {...props}
        className="w-full rounded-lg border border-border bg-bg px-3 py-2.5 text-sm text-text placeholder:text-text-faint outline-none transition focus:border-brand focus:outline-none"
      />
    </label>
  );
}

export function SubmitButton({ loading, children }: { loading?: boolean; children: ReactNode }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-bold text-bg transition hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60 shadow-[0_0_12px_rgba(20,184,166,0.3)]"
    >
      {loading ? "Please wait…" : children}
    </button>
  );
}

export function AuthError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
      {message}
    </div>
  );
}

export function AuthNotice({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="mb-4 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
      {message}
    </div>
  );
}
