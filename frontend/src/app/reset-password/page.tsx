"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { OUTBOUND_API_BASE } from "@/lib/outbound";
import { AuthShell, Field, SubmitButton, AuthError, AuthNotice } from "@/components/AuthShell";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Read the token from the URL on the client (avoids useSearchParams Suspense).
  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get("token") || "");
  }, []);

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
    } catch (err: any) {
      setError(err?.message || "Reset failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Choose a new password"
      footer={
        <Link href="/login" className="font-medium text-teal-400 hover:text-teal-300">
          Back to sign in
        </Link>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <AuthError message={error} />
        <AuthNotice message={notice} />
        {!token ? (
          <p className="text-sm text-slate-400">
            This reset link is missing its token. Request a new one from{" "}
            <Link href="/forgot-password" className="text-teal-400 hover:text-teal-300">
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
