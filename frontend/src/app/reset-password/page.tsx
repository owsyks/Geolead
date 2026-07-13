"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { OUTBOUND_API_BASE } from "@/lib/outbound";
import { AuthShell, Field, SubmitButton, AuthError, AuthNotice } from "@/components/AuthShell";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [token] = useState(() => typeof window === "undefined"
    ? ""
    : new URLSearchParams(window.location.search).get("token") || "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${OUTBOUND_API_BASE}/api/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Reset failed.");
      setNotice("Password updated. Redirecting to sign in…");
      setTimeout(() => router.replace("/login"), 1500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Reset failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Choose a new password"
      footer={
        <Link href="/login" className="font-medium text-brand hover:text-brand-hover">
          Back to sign in
        </Link>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <AuthError message={error} />
        <AuthNotice message={notice} />
        {!token ? (
          <p className="text-sm text-text-muted">
            This reset link is missing its token. Request a new one from{" "}
            <Link href="/forgot-password" className="text-brand hover:text-brand-hover">
              forgot password
            </Link>
            .
          </p>
        ) : (
          <>
            <Field
              label="New password"
              type="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
            />
            <Field
              label="Confirm password"
              type="password"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Re-enter password"
            />
            <SubmitButton loading={loading}>Update password</SubmitButton>
          </>
        )}
      </form>
    </AuthShell>
  );
}
