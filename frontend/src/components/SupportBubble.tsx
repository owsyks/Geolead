"use client";

// Persistent support chat bubble — mounted once in OutboundShell so it's
// available on every authenticated page (dashboard included). Rule-based FAQ
// bot (no AI call): quick replies + keyword matching. When the bot can't help
// (or the user asks for a human), it escalates into a real SupportTicket and
// switches to a live thread, polling for admin replies. A History tab lists
// every past ticket so a reply on an older conversation is never missed.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MessageCircle, X, Send, ArrowLeft, Loader2, History as HistoryIcon, Plus } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useVisiblePolling } from "@/lib/useVisiblePolling";
import { SUPPORT_FAQS, matchFaq } from "@/lib/supportFaq";
import {
  escalate, getMyTickets, getTicketMessages, postTicketMessage,
  type MyTicket, type SupportMessage, type TranscriptEntry,
} from "@/lib/support";
import { cn } from "./ui";

interface BubbleMessage {
  id: string;
  from: "user" | "bot" | "admin";
  text: string;
}

const STORAGE_KEY = "geolead.supportBubble";

function loadStored(): { ticketId: string | null; messages: BubbleMessage[]; seen: Record<string, string> } {
  if (typeof window === "undefined") return { ticketId: null, messages: [], seen: {} };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ticketId: null, messages: [], seen: {} };
    const parsed = JSON.parse(raw);
    return {
      ticketId: parsed.ticketId ?? null,
      messages: Array.isArray(parsed.messages) ? parsed.messages : [],
      seen: parsed.seen && typeof parsed.seen === "object" ? parsed.seen : {},
    };
  } catch {
    return { ticketId: null, messages: [], seen: {} };
  }
}

function mapThread(thread: SupportMessage[]): BubbleMessage[] {
  return thread.map((m) => ({
    id: m.id,
    from: m.sender === "ADMIN" ? "admin" : m.sender === "BOT" ? "bot" : "user",
    text: m.body,
  }));
}

function fmtWhen(d: string) {
  const dt = new Date(d);
  const sameDay = dt.toDateString() === new Date().toDateString();
  return sameDay
    ? dt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : dt.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function SupportBubble() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"chat" | "history">("chat");
  const [ticketId, setTicketId] = useState<string | null>(null);
  const [messages, setMessages] = useState<BubbleMessage[]>([]);
  const [ticketList, setTicketList] = useState<MyTicket[]>([]);
  const [seen, setSeen] = useState<Record<string, string>>({});
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [threadLoading, setThreadLoading] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stored = loadStored();
    setTicketId(stored.ticketId);
    setMessages(stored.messages);
    setSeen(stored.seen);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ticketId, messages, seen }));
  }, [ticketId, messages, seen]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open, view]);

  // Live thread for whichever ticket is currently open in the chat view.
  useVisiblePolling({
    enabled: !!ticketId,
    intervalMs: 15000,
    maxIntervalMs: 60000,
    poll: async () => {
      if (!ticketId) return false;
      const { messages: thread } = await getTicketMessages(ticketId);
      setMessages(mapThread(thread));
    },
  });

  // Lightweight poll across every ticket this user has ever opened, so a
  // reply on an older (non-active) ticket still surfaces as "unread" and is
  // reachable from History, instead of only tracking the one active thread.
  useVisiblePolling({
    enabled: !!user,
    intervalMs: 20000,
    maxIntervalMs: 90000,
    poll: async () => {
      const { tickets } = await getMyTickets();
      setTicketList(tickets);
    },
  });

  // Mark whatever ticket is actively being viewed as seen once its data is in.
  useEffect(() => {
    if (!open || view !== "chat" || !ticketId) return;
    const t = ticketList.find((x) => x.id === ticketId);
    if (t) markSeen(t.id, t.updatedAt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, view, ticketId, ticketList]);

  if (!user) return null;

  function markSeen(id: string, updatedAt: string) {
    setSeen((prev) => (prev[id] === updatedAt ? prev : { ...prev, [id]: updatedAt }));
  }

  const unreadIds = new Set(
    ticketList.filter((t) => t.lastSender === "ADMIN" && seen[t.id] !== t.updatedAt).map((t) => t.id)
  );

  function pushLocal(msg: Omit<BubbleMessage, "id">) {
    setMessages((prev) => [...prev, { ...msg, id: `local-${prev.length}-${msg.from}` }]);
  }

  function toTranscript(msgs: BubbleMessage[]): TranscriptEntry[] {
    return msgs
      .filter((m) => m.from !== "admin")
      .map((m) => ({ from: m.from === "bot" ? "bot" : "user", text: m.text }));
  }

  async function handleFaqClick(question: string, answer: string) {
    pushLocal({ from: "user", text: question });
    pushLocal({ from: "bot", text: answer });
  }

  async function runEscalate(topic: string) {
    setBusy(true);
    try {
      const transcript = toTranscript(messages);
      const { ticketId: id } = await escalate(topic, transcript);
      setTicketId(id);
      pushLocal({ from: "bot", text: "You're connected with our support team — they'll reply right here, and by email too." });
    } catch {
      pushLocal({ from: "bot", text: "Sorry, something went wrong opening a ticket. Please try again in a moment." });
    } finally {
      setBusy(false);
    }
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");

    if (ticketId) {
      pushLocal({ from: "user", text });
      setBusy(true);
      try {
        await postTicketMessage(ticketId, text);
      } catch {
        pushLocal({ from: "bot", text: "That message didn't send — please try again." });
      } finally {
        setBusy(false);
      }
      return;
    }

    const match = matchFaq(text);
    if (match) {
      pushLocal({ from: "user", text });
      pushLocal({ from: "bot", text: match.answer });
    } else {
      pushLocal({ from: "user", text });
      pushLocal({ from: "bot", text: "I don't have a canned answer for that — let me connect you with someone who can help." });
      await runEscalate(text.slice(0, 200));
    }
  }

  function startFresh() {
    setTicketId(null);
    setMessages([]);
    setView("chat");
  }

  async function openTicket(t: MyTicket) {
    setTicketId(t.id);
    setView("chat");
    markSeen(t.id, t.updatedAt);
    setThreadLoading(true);
    try {
      const { messages: thread } = await getTicketMessages(t.id);
      setMessages(mapThread(thread));
    } finally {
      setThreadLoading(false);
    }
  }

  const hasUnread = unreadIds.size > 0;

  return createPortal(
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Support chat"
        className="fixed bottom-5 right-5 z-[60] w-14 h-14 rounded-full bg-brand text-bg shadow-[0_4px_20px_rgba(20,184,166,0.45)] flex items-center justify-center hover:bg-brand-hover transition-colors"
      >
        {open ? <X className="w-6 h-6" /> : <MessageCircle className="w-6 h-6" />}
        {!open && hasUnread && (
          <span className="absolute top-0 right-0 w-3.5 h-3.5 rounded-full bg-danger border-2 border-bg" />
        )}
      </button>

      {open && (
        <div className="fixed bottom-24 right-5 z-[60] w-[340px] max-w-[calc(100vw-2.5rem)] h-[460px] max-h-[calc(100vh-8rem)] bg-bg-elevated border border-border-strong rounded-2xl shadow-[0_16px_48px_rgba(0,0,0,0.45)] flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between bg-surface-2">
            <div>
              <div className="font-bold text-sm text-text">Support</div>
              <div className="text-[11px] text-text-muted">
                {view === "history" ? "Your past conversations" : ticketId ? "Connected to our team" : "Ask a quick question"}
              </div>
            </div>
            <div className="flex items-center gap-1">
              {view === "history" ? (
                <button onClick={() => setView("chat")} className="text-[11px] font-bold text-text-muted hover:text-text flex items-center gap-1">
                  <ArrowLeft className="w-3.5 h-3.5" /> Back
                </button>
              ) : (
                <>
                  <button
                    onClick={() => setView("history")}
                    title="Ticket history"
                    aria-label="Ticket history"
                    className="relative p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface transition-colors"
                  >
                    <HistoryIcon className="w-4 h-4" />
                    {hasUnread && <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-danger" />}
                  </button>
                  {ticketId && (
                    <button onClick={startFresh} title="Start a new conversation" aria-label="New chat"
                      className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface transition-colors">
                      <Plus className="w-4 h-4" />
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {view === "history" ? (
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
              {ticketList.length === 0 && (
                <div className="text-[12px] text-text-muted px-1 py-6 text-center">No conversations yet.</div>
              )}
              {ticketList.map((t) => (
                <button
                  key={t.id}
                  onClick={() => openTicket(t)}
                  className={cn(
                    "w-full text-left px-3 py-2.5 rounded-xl border transition-colors",
                    t.id === ticketId ? "border-brand/40 bg-brand/5" : "border-border bg-surface hover:border-brand/30"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium text-[13px] text-text truncate">{t.subject}</div>
                    {unreadIds.has(t.id) && <span className="w-2 h-2 rounded-full bg-danger shrink-0" />}
                  </div>
                  <div className="text-[12px] text-text-muted truncate mt-0.5">{t.lastMessage}</div>
                  <div className="flex items-center justify-between mt-1">
                    <span className={cn("text-[10px] font-bold uppercase tracking-wider", t.status === "DONE" ? "text-success" : t.status === "IN_PROGRESS" ? "text-brand" : "text-copper")}>{t.status}</span>
                    <span className="text-[10px] text-text-faint">{fmtWhen(t.updatedAt)}</span>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <>
              <div ref={listRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5">
                {threadLoading ? (
                  <div className="py-6 flex justify-center"><Loader2 className="w-4 h-4 animate-spin text-text-faint" /></div>
                ) : (
                  <>
                    {messages.length === 0 && (
                      <div className="space-y-2">
                        <div className="text-[12px] text-text-muted px-1">Common questions:</div>
                        {SUPPORT_FAQS.map((f) => (
                          <button
                            key={f.id}
                            onClick={() => handleFaqClick(f.question, f.answer)}
                            className="w-full text-left text-[13px] px-3 py-2 rounded-xl border border-border bg-surface hover:border-brand/40 hover:text-brand transition-colors"
                          >
                            {f.question}
                          </button>
                        ))}
                      </div>
                    )}
                    {messages.map((m) => (
                      <div key={m.id} className={cn("flex", m.from === "user" ? "justify-end" : "justify-start")}>
                        <div
                          className={cn(
                            "max-w-[85%] px-3 py-2 rounded-2xl text-[13px] leading-snug",
                            m.from === "user" && "bg-brand text-bg rounded-br-sm",
                            m.from === "bot" && "bg-surface-2 text-text border border-border rounded-bl-sm",
                            m.from === "admin" && "bg-info/15 border border-info/25 text-text rounded-bl-sm"
                          )}
                        >
                          {m.from === "admin" && <div className="text-[10px] font-bold text-info uppercase tracking-wider mb-0.5">Support team</div>}
                          {m.text}
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>

              <div className="p-3 border-t border-border bg-bg-elevated">
                {!ticketId && messages.length > 0 && (
                  <button
                    onClick={() => runEscalate("Chat bubble — talk to a human")}
                    disabled={busy}
                    className="w-full mb-2 text-[12px] font-bold text-brand border border-brand/30 rounded-lg py-1.5 hover:bg-brand/10 transition-colors disabled:opacity-60"
                  >
                    Talk to a human
                  </button>
                )}
                <div className="flex items-center gap-2">
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSend()}
                    placeholder="Type a message..."
                    className="flex-1 bg-surface border border-border rounded-xl px-3 py-2 text-[13px] focus:border-brand focus:outline-none"
                  />
                  <button
                    onClick={handleSend}
                    disabled={busy || !input.trim()}
                    aria-label="Send"
                    className="w-9 h-9 shrink-0 rounded-xl bg-brand text-bg flex items-center justify-center hover:bg-brand-hover transition-colors disabled:opacity-50"
                  >
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </>,
    document.body
  );
}
