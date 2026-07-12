"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { OUTBOUND_API_BASE } from "@/lib/outbound";
import { fetchOutbound } from "@/lib/outbound";
import { useAuth } from "@/lib/auth";
import { AuthShell } from "@/components/AuthShell";

type Status = "verifying" | "success" | "error";

export default function VerifyEmailPage() {
  const { user } = useAuth();
  const [status, setStatus] = useState<Status>("verifying");
  const [message, setMessage] = useState("Verifying your email…");

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token") || "";
    if (!token) {
      const timer = setTimeout(() => {
        setStatus("error");
        setMessage(user && !user.emailVerified ? "Your legacy account still needs email verification. Send a fresh verification link below." : "This verification link is missing its token.");
      }, 0);
      return () => clearTimeout(timer);
    }
    (async () => {
      try {
        const res = await fetch(`${OUTBOUND_API_BASE}/api/auth/verify-email`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Verification failed.");
        setStatus("success");
        setMessage("Your email is verified. You're all set!");
      } catch (err: unknown) {
        setStatus("error");
        setMessage(err instanceof Error ? err.message : "Verification failed.");
      }
    })();
  }, [user]);

  async function resend() {
    setMessage("Sending a new verification link…");
    try {
      await fetchOutbound("/api/auth/resend-verification", { method: "POST" });
      setStatus("success");
      setMessage("A new verification link has been sent. Check your inbox.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Could not send verification email.");
    }
  }

  return (
    <AuthShell
      title="Email verification"
      footer={
        <Link href="/overview" className="font-medium text-brand hover:text-brand-hover">
          Go to dashboard
        </Link>
      }
    >
      <div
        className={`rounded-lg border px-3 py-3 text-sm ${
          status === "success"
            ? "border-success/30 bg-success/10 text-success"
            : status === "error"
            ? "border-danger/30 bg-danger/10 text-danger"
            : "border-border bg-surface-2 text-text-muted"
        }`}
      >
        {message}
      </div>
      {user && !user.emailVerified && (
        <button onClick={resend} className="mt-4 w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-bold text-bg">Send verification link</button>
      )}
    </AuthShell>
  );
}
