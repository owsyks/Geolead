"use client";

import { useState } from "react";
import { OutboundShell } from "@/components/OutboundShell"
import { StatusBadge } from "@/components/ui"
;
import { useAuth } from "@/lib/auth";
import { fetchOutbound, OUTBOUND_API_BASE, getAccessToken } from "@/lib/outbound";

export default function ProfilePage() {
  const { user } = useAuth();
  return (
    <OutboundShell title="Profile" subtitle="Manage your account, password, and email verification.">
      {user ? <ProfileBody /> : <p className="text-slate-400">Loading…</p>}
    </OutboundShell>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6 rounded-xl border border-slate-800 bg-slate-900/50 p-5">
      <h2 className="mb-4 text-sm font-semibold text-white">{title}</h2>
      {children}
    </section>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-white outline-none focus:border-teal-500"
    />
  );
}

function ProfileBody() {
  const { user, refreshUser } = useAuth();
  const [name, setName] = useState(user?.name || "");
  const [timezone, setTimezone] = useState(user?.timezone || "UTC");
  const [locale, setLocale] = useState(user?.locale || "en");
  const [dateFormat, setDateFormat] = useState(user?.dateFormat || "MMM d, yyyy");
  const [profileMsg, setProfileMsg] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [pwMsg, setPwMsg] = useState<string | null>(null);

  const [verifyMsg, setVerifyMsg] = useState<string | null>(null);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setProfileMsg(null);
    try {
      await fetchOutbound("/api/auth/me", {
        method: "PATCH",
        body: JSON.stringify({ name, timezone, locale, dateFormat }),
      });
      await refreshUser();
      setProfileMsg("Profile saved.");
    } catch (err: any) {
      setProfileMsg(err?.message || "Save failed.");
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwMsg(null);
    try {
      const res = await fetch(`${OUTBOUND_API_BASE}/api/auth/change-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getAccessToken()}` },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Change failed.");
      setCurrentPassword("");
      setNewPassword("");
      setPwMsg("Password updated. You may need to sign in again on other devices.");
    } catch (err: any) {
      setPwMsg(err?.message || "Change failed.");
    }
  }

  async function resendVerification() {
    setVerifyMsg(null);
    try {
      await fetchOutbound("/api/auth/resend-verification", { method: "POST" });
      setVerifyMsg("Verification email sent.");
    } catch (err: any) {
      setVerifyMsg(err?.message || "Could not send verification email.");
    }
  }

  return (
    <div className="max-w-2xl">
      <Card title="Account">
        <form onSubmit={saveProfile} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm text-slate-300">Display name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm text-slate-300">Email</label>
            <Input value={user?.email || ""} disabled />
            <p className="mt-1 text-xs text-slate-500">
              {user?.emailVerified ? (
                <span className="text-emerald-400">Verified</span>
              ) : (
                <span className="text-amber-400">
                  Not verified.{" "}
                  <button type="button" onClick={resendVerification} className="underline hover:text-amber-300">
                    Resend verification email
                  </button>
                </span>
              )}
              {verifyMsg ? <span className="ml-2 text-slate-400">{verifyMsg}</span> : null}
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-sm text-slate-300">Timezone</label>
              <Input value={timezone} onChange={(e) => setTimezone(e.target.value)} placeholder="UTC" />
            </div>
            <div>
              <label className="mb-1.5 block text-sm text-slate-300">Language</label>
              <Input value={locale} onChange={(e) => setLocale(e.target.value)} placeholder="en" />
            </div>
            <div>
              <label className="mb-1.5 block text-sm text-slate-300">Date format</label>
              <Input value={dateFormat} onChange={(e) => setDateFormat(e.target.value)} />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button type="submit" className="rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-400">
              Save profile
            </button>
            {profileMsg ? <span className="text-sm text-slate-400">{profileMsg}</span> : null}
          </div>
        </form>
      </Card>

      <Card title="Change password">
        <form onSubmit={changePassword} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm text-slate-300">Current password</label>
            <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm text-slate-300">New password</label>
            <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="At least 8 characters" />
          </div>
          <div className="flex items-center gap-3">
            <button type="submit" className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-600">
              Update password
            </button>
            {pwMsg ? <span className="text-sm text-slate-400">{pwMsg}</span> : null}
          </div>
        </form>
      </Card>

      <Card title="Plan">
        <p className="text-sm text-slate-300">
          Current plan: <span className="font-semibold capitalize text-white">{user?.plan || "free"}</span>
        </p>
        <p className="mt-1 text-xs text-slate-500">Member since {user ? new Date(user.createdAt).toLocaleDateString() : ""}</p>
      </Card>
    </div>
  );
}
