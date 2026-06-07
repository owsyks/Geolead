"use client";

import { useState } from "react";
import Link from "next/link";
import { OUTBOUND_API_BASE } from "@/lib/outbound";
import { AuthShell, Field, SubmitButton, AuthError, AuthNotice } from "@/components/AuthShell";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      const res = await fetch(`${OUTBOUND_API_BASE}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Request failed.");
      setNotice(data?.message || "If an account exists for that email, a reset link has been sent.");
    } catch (err: any) {
      setError(err?.message || "Request failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Reset your password"
      subtitle="We'll email you a link to choose a new password."
      footer={
        <Link href="/login" className="font-medium text-teal-400 hover:text-teal-300">
          Back to sign in
        </Link>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <AuthError message={error} />
        <AuthNotice message={notice} />
        <Field
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
        <SubmitButton loading={loading}>Send reset link</SubmitButton>
      </form>
    </AuthShell>
  );
}
