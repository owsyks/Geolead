"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { OUTBOUND_API_BASE } from "@/lib/outbound";
import { AuthShell } from "@/components/AuthShell";

type Status = "verifying" | "success" | "error";

export default function VerifyEmailPage() {
  const [status, setStatus] = useState<Status>("verifying");
  const [message, setMessage] = useState("Verifying your email…");

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token") || "";
    if (!token) {
      setStatus("error");
      setMessage("This verification link is missing its token.");
      return;
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
      } catch (err: any) {
        setStatus("error");
        setMessage(err?.message || "Verification failed.");
      }
    })();
  }, []);

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
    </AuthShell>
  );
}
