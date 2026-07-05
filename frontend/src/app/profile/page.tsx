"use client";

import { useState } from "react";
import { useClerk } from "@clerk/nextjs";
import { OutboundShell } from "@/components/OutboundShell";
import { GlassCard } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { fetchOutbound } from "@/lib/outbound";
import { clerkAppearance } from "@/lib/clerkAppearance";

export default function ProfilePage() {
  const { user } = useAuth();
  return (
    <OutboundShell title="Profile" eyebrow="Account" subtitle="Manage your account, password, and email verification.">
      {user ? <ProfileBody /> : <p className="text-text-muted">Loading…</p>}
    </OutboundShell>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <GlassCard className="mb-6 p-5">
      <h2 className="mb-4 text-sm font-bold text-text">{title}</h2>
      {children}
    </GlassCard>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-brand transition-colors disabled:opacity-60"
    />
  );
}

function ProfileBody() {
  const { user, refreshUser } = useAuth();
  const { openUserProfile } = useClerk();
  const [name, setName] = useState(user?.name || "");
  const [timezone, setTimezone] = useState(user?.timezone || "UTC");
  const [locale, setLocale] = useState(user?.locale || "en");
  const [dateFormat, setDateFormat] = useState(user?.dateFormat || "MMM d, yyyy");
  const [profileMsg, setProfileMsg] = useState<string | null>(null);

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

  return (
    <div className="max-w-2xl">
      <Card title="Account">
        <form onSubmit={saveProfile} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm text-text-faint">Display name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm text-text-faint">Email</label>
            <Input value={user?.email || ""} disabled />
            <p className="mt-1 text-xs text-text-muted">
              {user?.emailVerified ? (
                <span className="text-success">Verified</span>
              ) : (
                <span className="text-copper">Not verified — manage this in Account security below.</span>
              )}
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-sm text-text-faint">Timezone</label>
              <Input value={timezone} onChange={(e) => setTimezone(e.target.value)} placeholder="UTC" />
            </div>
            <div>
              <label className="mb-1.5 block text-sm text-text-faint">Language</label>
              <Input value={locale} onChange={(e) => setLocale(e.target.value)} placeholder="en" />
            </div>
            <div>
              <label className="mb-1.5 block text-sm text-text-faint">Date format</label>
              <Input value={dateFormat} onChange={(e) => setDateFormat(e.target.value)} />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button type="submit" className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-bg hover:bg-brand-hover shadow-[0_0_12px_rgba(20,184,166,0.3)] transition-colors">
              Save profile
            </button>
            {profileMsg ? <span className="text-sm text-text-muted">{profileMsg}</span> : null}
          </div>
        </form>
      </Card>

      <Card title="Account security">
        <p className="text-sm text-text-muted mb-4">
          Password, two-factor authentication, connected accounts, and email verification are managed through your account settings.
        </p>
        <button
          type="button"
          onClick={() => openUserProfile({ appearance: clerkAppearance })}
          className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-bold text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
        >
          Manage account security
        </button>
      </Card>

      <Card title="Plan">
        <p className="text-sm text-text-faint">
          Current plan: <span className="font-bold capitalize text-text">{user?.plan || "free"}</span>
        </p>
        <p className="mt-1 text-xs text-text-muted">Member since {user ? new Date(user.createdAt).toLocaleDateString() : ""}</p>
      </Card>
    </div>
  );
}
