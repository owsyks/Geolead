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
        <Link href="/" className="font-medium text-indigo-400 hover:text-indigo-300">
          Go to dashboard
        </Link>
      }
    >
      <div
        className={`rounded-lg border px-3 py-3 text-sm ${
          status === "success"
            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
            : status === "error"
            ? "border-red-500/30 bg-red-500/10 text-red-300"
            : "border-slate-700 bg-slate-950/40 text-slate-300"
        }`}
      >
        {message}
      </div>
    </AuthShell>
  );
}
