"use client";

// Persistent support chat bubble — mounted once in the root layout so it's on
// every page: public marketing pages (landing, pricing, contact) AND the
// logged-in app. Rule-based FAQ bot (no AI call): quick replies + keyword
// matching. When it can't help, it escalates to a real SupportTicket thread:
//
//  - Logged in: we already know who they are, so it escalates straight away
//    and a History tab lists every past ticket (getMyTickets/getTicketMessages
//    from lib/support.ts), so a reply on an older conversation is never lost.
//  - Anonymous visitor: no account to key a ticket off, so the first time
//    they need a human we ask for name + email inline, then create a guest
//    ticket via the public lib/supportGuest.ts endpoints and continue polling
//    the same way. No History tab (no account to list tickets by), but the
//    one active thread persists in localStorage across reloads.
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
import { startGuestChat, getGuestTicketMessages, postGuestTicketMessage } from "@/lib/supportGuest";
import { cn } from "./ui";

interface BubbleMessage {
  id: string;
  from: "user" | "bot" | "admin";
  text: string;
}
interface GuestIdentity {
  name: string;
  email: string;
}

const authKey = (userId: string) => `geolead.supportBubble.${userId}`;
const GUEST_KEY = "geolead.supportBubble.guest";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
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
  const { user, loading } = useAuth();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"chat" | "history">("chat");
  const [ticketId, setTicketId] = useState<string | null>(null);
  const [guestAccessToken, setGuestAccessToken] = useState<string | null>(null);
  const [messages, setMessages] = useState<BubbleMessage[]>([]);
  const [ticketList, setTicketList] = useState<MyTicket[]>([]);
  const [seen, setSeen] = useState<Record<string, string>>({});
  const [guestIdentity, setGuestIdentity] = useState<GuestIdentity | null>(null);
  const [pendingEscalate, setPendingEscalate] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [formBusy, setFormBusy] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [typing, setTyping] = useState(false);
  const [threadLoading, setThreadLoading] = useState(false);
  const [localUnread, setLocalUnread] = useState(false);
  const hydratedScope = useRef<string | null>(null);
  const seenCount = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);
  // Cache each ticket's thread once fetched so re-opening it from History (or
  // reopening the bubble on the same active ticket) shows instantly instead
  // of a blank spinner every time — refreshed silently in the background.
  const threadCache = useRef<Record<string, BubbleMessage[]>>({});

  // Hydrate from the right localStorage bucket once we know whether this is
  // an authenticated session or an anonymous visitor.
  useEffect(() => {
    if (loading) return;
    const scope = user ? `user:${user.id}` : "guest";
    if (hydratedScope.current === scope) return;
    let active = true;
    void (async () => {
      await Promise.resolve();
      if (!active) return;
      setTicketId(null);
      setGuestAccessToken(null);
      setMessages([]);
      setSeen({});
      setGuestIdentity(null);
      threadCache.current = {};
      if (user) {
        const stored = readJson(authKey(user.id), { ticketId: null as string | null, messages: [] as BubbleMessage[], seen: {} as Record<string, string> });
        setTicketId(stored.ticketId);
        setMessages(stored.messages);
        setSeen(stored.seen);
        seenCount.current = stored.messages.length;
      } else {
        const stored = readJson(GUEST_KEY, { ticketId: null as string | null, accessToken: null as string | null, messages: [] as BubbleMessage[], identity: null as GuestIdentity | null });
        setTicketId(stored.ticketId);
        setGuestAccessToken(stored.accessToken);
        setMessages(stored.messages);
        setGuestIdentity(stored.identity);
        seenCount.current = stored.messages.length;
      }
      hydratedScope.current = scope;
    })();
    return () => { active = false; };
  }, [loading, user]);

  useEffect(() => {
    const scope = user ? `user:${user.id}` : "guest";
    if (typeof window === "undefined" || loading || hydratedScope.current !== scope) return;
    if (user) {
      window.localStorage.setItem(authKey(user.id), JSON.stringify({ ticketId, messages, seen }));
    } else {
      window.localStorage.setItem(GUEST_KEY, JSON.stringify({ ticketId, accessToken: guestAccessToken, messages, identity: guestIdentity }));
    }
  }, [user, loading, ticketId, guestAccessToken, messages, seen, guestIdentity]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open, view, typing, pendingEscalate]);

  // Live thread for whichever ticket is currently active (works for both an
  // authenticated user's ticket and an anonymous guest ticket). `immediate`
  // means a reply that landed while the bubble was closed/collapsed shows up
  // the moment it's reopened, instead of waiting out a full interval first.
  useVisiblePolling({
    enabled: !!ticketId && (!!user || !!guestAccessToken),
    intervalMs: 15000,
    maxIntervalMs: 60000,
    immediate: true,
    poll: async () => {
      if (!ticketId) return false;
      const requestScope = user ? `user:${user.id}` : "guest";
      const { messages: thread } = user
        ? await getTicketMessages(ticketId)
        : await getGuestTicketMessages(ticketId, guestAccessToken!);
      if (hydratedScope.current !== requestScope) return false;
      const mapped = mapThread(thread);
      threadCache.current[ticketId] = mapped;
      setMessages(mapped);
      if (mapped.length > seenCount.current && !open) setLocalUnread(true);
      if (open) seenCount.current = mapped.length;
    },
  });

  // Logged-in only: lightweight poll across every ticket this account has
  // ever opened, powering the History tab + its unread dots.
  useVisiblePolling({
    enabled: !!user,
    intervalMs: 20000,
    maxIntervalMs: 90000,
    immediate: true,
    poll: async () => {
      if (!user) return;
      const requestScope = `user:${user.id}`;
      const { tickets } = await getMyTickets();
      if (hydratedScope.current !== requestScope) return;
      setTicketList(tickets);
    },
  });

  useEffect(() => {
    if (!open || view !== "chat" || !ticketId || !user) return;
    const t = ticketList.find((x) => x.id === ticketId);
    if (t) markSeen(t.id, t.updatedAt);
  }, [open, view, ticketId, ticketList, user]);

  if (loading) return null;

  function markSeen(id: string, updatedAt: string) {
    setSeen((prev) => (prev[id] === updatedAt ? prev : { ...prev, [id]: updatedAt }));
  }

  const unreadIds = new Set(
    ticketList.filter((t) => t.lastSender === "ADMIN" && seen[t.id] !== t.updatedAt).map((t) => t.id)
  );
  const hasUnread = localUnread || unreadIds.size > 0;

  function pushLocal(msg: Omit<BubbleMessage, "id">) {
    setMessages((prev) => [...prev, { ...msg, id: `local-${prev.length}-${msg.from}` }]);
  }

  // Small artificial delay + typing indicator so canned replies feel like a
  // real conversation instead of an instant form-fill.
  async function botSay(text: string) {
    setTyping(true);
    await new Promise((r) => setTimeout(r, 450 + Math.random() * 350));
    setTyping(false);
    pushLocal({ from: "bot", text });
  }

  function toTranscript(msgs: BubbleMessage[]): TranscriptEntry[] {
    return msgs
      .filter((m) => m.from !== "admin")
      .map((m) => ({ from: m.from === "bot" ? "bot" : "user", text: m.text }));
  }

  async function handleFaqClick(question: string, answer: string) {
    pushLocal({ from: "user", text: question });
    await botSay(answer);
  }

  async function runEscalate(triggerText: string) {
    if (user) {
      setBusy(true);
      try {
        const { ticketId: id } = await escalate(triggerText, toTranscript(messages));
        setTicketId(id);
        seenCount.current = messages.length;
        await botSay("You're connected with our support team — they'll reply right here, and by email too.");
      } catch {
        await botSay("Sorry, something went wrong opening a ticket. Please try again in a moment.");
      } finally {
        setBusy(false);
      }
      return;
    }

    if (guestIdentity) {
      setBusy(true);
      try {
        const { id, accessToken } = await startGuestChat(guestIdentity.name, guestIdentity.email, triggerText);
        setTicketId(id);
        setGuestAccessToken(accessToken);
        seenCount.current = messages.length;
        await botSay("Thanks! You're connected with our team — they'll reply right here, and by email too.");
      } catch {
        await botSay("Sorry, something went wrong opening a ticket. Please try again in a moment.");
      } finally {
        setBusy(false);
      }
      return;
    }

    await botSay("Sure — before I connect you, could I get your name and email so our team can reach you?");
    setPendingEscalate(triggerText);
  }

  async function submitIdentity() {
    const name = formName.trim();
    const email = formEmail.trim();
    if (!name) return setFormError("Please enter your name.");
    if (!email || !EMAIL_RE.test(email)) return setFormError("Please enter a valid email.");
    setFormError(null);
    setFormBusy(true);
    try {
      const { id, accessToken } = await startGuestChat(name, email, pendingEscalate || "Chat bubble — talk to a human");
      setGuestIdentity({ name, email });
      setTicketId(id);
      setGuestAccessToken(accessToken);
      setPendingEscalate(null);
      seenCount.current = messages.length;
      await botSay("Thanks! You're connected with our team — they'll reply right here, and by email too.");
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setFormBusy(false);
    }
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || busy || pendingEscalate !== null) return;
    setInput("");

    if (ticketId) {
      pushLocal({ from: "user", text });
      setBusy(true);
      try {
        if (user) await postTicketMessage(ticketId, text);
        else if (guestAccessToken) await postGuestTicketMessage(ticketId, guestAccessToken, text);
        else throw new Error('Missing guest ticket capability.');
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
      await botSay(match.answer);
    } else {
      pushLocal({ from: "user", text });
      await botSay("I don't have a canned answer for that — let me connect you with someone who can help.");
      await runEscalate(text.slice(0, 200));
    }
  }

  function startFresh() {
    setTicketId(null);
    setMessages([]);
    setPendingEscalate(null);
    setView("chat");
    seenCount.current = 0;
  }

  async function openTicket(t: MyTicket) {
    setTicketId(t.id);
    setView("chat");
    markSeen(t.id, t.updatedAt);

    // Show the cached thread instantly if we have one (e.g. re-opening a
    // ticket already fetched this session) instead of a blank spinner — the
    // polling effect above will silently refresh it a moment later anyway.
    const cached = threadCache.current[t.id];
    if (cached) {
      setMessages(cached);
      seenCount.current = cached.length;
      return;
    }

    setThreadLoading(true);
    try {
      const { messages: thread } = await getTicketMessages(t.id);
      const mapped = mapThread(thread);
      threadCache.current[t.id] = mapped;
      setMessages(mapped);
      seenCount.current = mapped.length;
    } finally {
      setThreadLoading(false);
    }
  }

  function toggleOpen() {
    setOpen((v) => {
      const next = !v;
      if (next) {
        seenCount.current = messages.length;
        setLocalUnread(false);
      }
      return next;
    });
  }

  const currentScope = user ? `user:${user.id}` : "guest";
  if (loading || hydratedScope.current !== currentScope) return null;

  return createPortal(
    <>
      <button
        onClick={toggleOpen}
        aria-label="Support chat"
        className={cn(
          "fixed right-4 lg:right-5 z-[60] w-14 h-14 rounded-full bg-brand text-bg shadow-[0_4px_20px_rgba(20,184,166,0.45)] flex items-center justify-center hover:bg-brand-hover active:scale-95 transition-all",
          // Logged-in pages have a fixed mobile bottom nav (h-14 + safe-area);
          // clear it on small screens instead of sitting on top of its icons.
          user ? "bottom-20 lg:bottom-5" : "bottom-5"
        )}
      >
        {open ? <X className="w-6 h-6" /> : <MessageCircle className="w-6 h-6" />}
        {!open && hasUnread && (
          <span className="absolute top-0 right-0 w-3.5 h-3.5 rounded-full bg-danger border-2 border-bg" />
        )}
      </button>

      {open && (
        <div className={cn(
          "fixed right-4 lg:right-5 z-[60] w-[340px] max-w-[calc(100vw-2rem)] h-[480px] bg-bg-elevated border border-border-strong rounded-2xl shadow-[0_16px_48px_rgba(0,0,0,0.45)] flex flex-col overflow-hidden animate-[supportPanelIn_0.18s_ease-out]",
          user ? "bottom-40 max-h-[calc(100vh-11rem)] lg:bottom-24 lg:max-h-[calc(100vh-8rem)]" : "bottom-24 max-h-[calc(100vh-8rem)]"
        )}>
          <div className="px-4 py-3 border-b border-border flex items-center justify-between bg-surface-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 shrink-0 rounded-full bg-brand-soft border border-brand/20 text-brand flex items-center justify-center">
                <MessageCircle className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="font-bold text-sm text-text">Support</div>
                <div className="text-[11px] text-text-muted truncate">
                  {view === "history" ? "Your past conversations" : ticketId ? "Connected to our team" : "Ask us anything"}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {view === "history" ? (
                <button onClick={() => setView("chat")} className="text-[11px] font-bold text-text-muted hover:text-text flex items-center gap-1 p-2.5 -m-2.5">
                  <ArrowLeft className="w-3.5 h-3.5" /> Back
                </button>
              ) : (
                <>
                  {user && (
                    <button
                      onClick={() => setView("history")}
                      title="Ticket history"
                      aria-label="Ticket history"
                      className="relative p-2.5 -m-1 rounded-lg text-text-muted hover:text-text hover:bg-surface transition-colors"
                    >
                      <HistoryIcon className="w-4 h-4" />
                      {unreadIds.size > 0 && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-danger" />}
                    </button>
                  )}
                  {ticketId && (
                    <button onClick={startFresh} title="Start a new conversation" aria-label="New chat"
                      className="p-2.5 -m-1 rounded-lg text-text-muted hover:text-text hover:bg-surface transition-colors">
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
                        <div className="max-w-[85%] px-3 py-2 rounded-2xl rounded-bl-sm text-[13px] leading-snug bg-surface-2 border border-border text-text">
                          👋 Hi! How can we help you today? Pick a question below or just type it out.
                        </div>
                        <div className="text-[11px] text-text-faint px-1 pt-1">Common questions:</div>
                        {SUPPORT_FAQS.map((f) => (
                          <button
                            key={f.id}
                            onClick={() => handleFaqClick(f.question, f.answer)}
                            className="w-full text-left text-[13px] px-3 py-2.5 rounded-xl border border-border bg-surface hover:border-brand/40 hover:text-brand transition-colors"
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
                    {typing && (
                      <div className="flex justify-start">
                        <div className="px-3.5 py-2.5 rounded-2xl rounded-bl-sm bg-surface-2 border border-border flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-text-faint animate-bounce [animation-delay:-0.3s]" />
                          <span className="w-1.5 h-1.5 rounded-full bg-text-faint animate-bounce [animation-delay:-0.15s]" />
                          <span className="w-1.5 h-1.5 rounded-full bg-text-faint animate-bounce" />
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="p-3 border-t border-border bg-bg-elevated">
                {pendingEscalate !== null ? (
                  <div className="space-y-2">
                    <div className="text-[11px] text-text-muted px-0.5">Share your details so our team can reach you:</div>
                    <input
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      placeholder="Your name"
                      className="w-full bg-surface border border-border rounded-xl px-3 py-2.5 lg:py-2 text-[16px] lg:text-[13px] focus:border-brand focus:outline-none"
                    />
                    <input
                      value={formEmail}
                      onChange={(e) => setFormEmail(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && submitIdentity()}
                      placeholder="you@company.com"
                      inputMode="email"
                      className="w-full bg-surface border border-border rounded-xl px-3 py-2.5 lg:py-2 text-[16px] lg:text-[13px] focus:border-brand focus:outline-none"
                    />
                    {formError && <div className="text-[11px] text-danger">{formError}</div>}
                    <div className="flex gap-2">
                      <button onClick={() => setPendingEscalate(null)} disabled={formBusy}
                        className="flex-1 text-[12px] font-bold text-text-muted border border-border rounded-lg py-2.5 lg:py-1.5 hover:bg-surface transition-colors disabled:opacity-60">
                        Cancel
                      </button>
                      <button onClick={submitIdentity} disabled={formBusy}
                        className="flex-1 text-[12px] font-bold text-bg bg-brand rounded-lg py-2.5 lg:py-1.5 hover:bg-brand-hover transition-colors disabled:opacity-60 flex items-center justify-center gap-1.5">
                        {formBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Start chat"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {!ticketId && messages.length > 0 && (
                      <button
                        onClick={() => runEscalate("Chat bubble — talk to a human")}
                        disabled={busy}
                        className="w-full mb-2 text-[12px] font-bold text-brand border border-brand/30 rounded-lg py-2.5 lg:py-1.5 hover:bg-brand/10 transition-colors disabled:opacity-60"
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
                        className="flex-1 bg-surface border border-border rounded-xl px-3 py-2.5 lg:py-2 text-[16px] lg:text-[13px] focus:border-brand focus:outline-none"
                      />
                      <button
                        onClick={handleSend}
                        disabled={busy || !input.trim()}
                        aria-label="Send"
                        className="w-11 h-11 lg:w-9 lg:h-9 shrink-0 rounded-xl bg-brand text-bg flex items-center justify-center hover:bg-brand-hover active:scale-95 transition-all disabled:opacity-50"
                      >
                        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </>,
    document.body
  );
}
