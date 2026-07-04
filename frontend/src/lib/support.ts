// User-facing support client. Thin typed wrappers over fetchOutbound (Bearer
// token + 401 refresh handled there), mirroring the pattern in lib/admin.ts.
import { fetchOutbound } from "@/lib/outbound";

export interface MyTicket {
  id: string;
  subject: string;
  status: string;
  priority: string;
  createdAt: string;
  updatedAt: string;
  lastMessage: string;
  lastSender: "USER" | "ADMIN" | "BOT";
}

export interface SupportMessage {
  id: string;
  ticketId: string;
  sender: "USER" | "ADMIN" | "BOT";
  body: string;
  createdAt: string;
}

export interface TranscriptEntry {
  from: "user" | "bot";
  text: string;
}

export function getMyTickets(): Promise<{ tickets: MyTicket[] }> {
  return fetchOutbound(`/api/support/tickets`);
}

export function getTicketMessages(id: string): Promise<{ status: string; messages: SupportMessage[] }> {
  return fetchOutbound(`/api/support/tickets/${id}/messages`);
}

export function postTicketMessage(id: string, body: string): Promise<{ ok: boolean; message: SupportMessage }> {
  return fetchOutbound(`/api/support/tickets/${id}/messages`, { method: "POST", body: JSON.stringify({ body }) });
}

export function escalate(topic: string, transcript: TranscriptEntry[]): Promise<{ ok: boolean; ticketId: string }> {
  return fetchOutbound(`/api/support/escalate`, { method: "POST", body: JSON.stringify({ topic, transcript }) });
}
