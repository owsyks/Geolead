// Admin data client. Thin typed wrappers over fetchOutbound (Bearer token + 401
// refresh handled there). Every endpoint is server-gated by requireAdmin; the
// UI also hides itself for non-admins as defense in depth.
import { fetchOutbound, authFetch, OUTBOUND_API_BASE, getAccessToken } from "@/lib/outbound";

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  plan: string;
  planStatus: string;
  isActive: boolean;
  isAdmin: boolean;
  searches: number;
  campaigns: number;
  revenue: number;
  lastSeenAt: string | null;
  createdAt: string;
}

export interface RevenueSummary {
  mrr: number;
  arr: number;
  arpu: number;
  activeUsers: number;
  trialUsers: number;
  churned: number;
  byPlan: { plan: string; users: number; revenue: number }[];
  transactions: { user: string; plan: string; amount: number; provider: string; date: string; status: string }[];
}

export interface SystemHealth {
  services: { name: string; status: "UP" | "DEGRADED" | "DOWN"; detail: string }[];
  healthy: number;
  total: number;
  tasks: { byStatus: Record<string, number>; stuck: number };
  deliverability: { senders: number; avgBounceRate: number; avgSpamRate: number };
  recentErrors: { time: string; svc: string; msg: string; to: string }[];
}

export interface AdminTicket {
  id: string;
  subject: string;
  body: string;
  type: string;
  priority: string;
  status: string;
  assignedTo: string | null;
  user: string;
  userName: string | null;
  createdAt: string;
}

export function getAdminUsers(search = "", plan = "ALL"): Promise<{ users: AdminUser[] }> {
  const q = new URLSearchParams({ search, plan }).toString();
  return fetchOutbound(`/api/admin/users?${q}`);
}

export function suspendUser(id: string, active: boolean): Promise<{ ok: boolean; isActive: boolean }> {
  return fetchOutbound(`/api/admin/users/${id}/suspend`, { method: "PATCH", body: JSON.stringify({ active }) });
}

export function changeUserPlan(id: string, plan: string, planStatus: string): Promise<{ ok: boolean }> {
  return fetchOutbound(`/api/admin/users/${id}/plan`, { method: "PATCH", body: JSON.stringify({ plan, planStatus }) });
}

export function deleteUser(id: string, confirmEmail: string): Promise<{ ok: boolean }> {
  return fetchOutbound(`/api/admin/users/${id}`, { method: "DELETE", body: JSON.stringify({ confirmEmail }) });
}

// Export needs the Bearer header, so fetch the blob and trigger a download rather
// than navigating (a plain link wouldn't carry the token).
export async function downloadUsersCsv(search = "", plan = "ALL"): Promise<void> {
  const q = new URLSearchParams({ search, plan }).toString();
  const res = await authFetch(`${OUTBOUND_API_BASE}/api/admin/users/export.csv?${q}`, {
    headers: getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : {},
  });
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "users.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export function getRevenue(): Promise<RevenueSummary> {
  return fetchOutbound(`/api/admin/revenue`);
}

export function getSystem(): Promise<SystemHealth> {
  return fetchOutbound(`/api/admin/system`);
}

export function getTickets(status = "ALL"): Promise<{ tickets: AdminTicket[] }> {
  return fetchOutbound(`/api/admin/tickets?status=${encodeURIComponent(status)}`);
}

export function patchTicket(
  id: string,
  data: { status?: string; priority?: string; assignedTo?: string }
): Promise<{ ok: boolean }> {
  return fetchOutbound(`/api/admin/tickets/${id}`, { method: "PATCH", body: JSON.stringify(data) });
}
