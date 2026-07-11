// Anonymous-visitor support client for the public-site chat bubble (landing,
// pricing, contact, etc. — anywhere there's no logged-in account yet). Mirrors
// lib/support.ts but hits the unauthenticated /api/contact endpoints, which
// scope every ticket lookup to userId: null server-side.
import { fetchOutbound } from "@/lib/outbound";
import type { SupportMessage } from "@/lib/support";

export function startGuestChat(name: string, email: string, message: string): Promise<{ ok: boolean; id: string; accessToken: string }> {
  return fetchOutbound(`/api/contact/start`, { method: "POST", body: JSON.stringify({ name, email, message }) });
}

export function getGuestTicketMessages(id: string, accessToken: string): Promise<{ status: string; messages: SupportMessage[] }> {
  return fetchOutbound(`/api/contact/tickets/${id}/messages`, { headers: { "X-Guest-Token": accessToken } });
}

export function postGuestTicketMessage(id: string, accessToken: string, body: string): Promise<{ ok: boolean; message: SupportMessage }> {
  return fetchOutbound(`/api/contact/tickets/${id}/messages`, { method: "POST", headers: { "X-Guest-Token": accessToken }, body: JSON.stringify({ body }) });
}
