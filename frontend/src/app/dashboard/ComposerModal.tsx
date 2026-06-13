"use client";

import React from "react";
import { Send, X } from "lucide-react";

export interface ComposerSender {
  id: string;
  provider: string;
  fromEmail: string;
  fromName: string;
  status: string;
}

export interface ComposerResult {
  ok: boolean;
  message: string;
}

interface Props {
  open: boolean;
  recipientEmail: string;
  senders: ComposerSender[];
  senderId: string;
  subject: string;
  body: string;
  sending: boolean;
  result: ComposerResult | null;
  onSenderChange: (id: string) => void;
  onSubjectChange: (s: string) => void;
  onBodyChange: (s: string) => void;
  onSend: () => void;
  onClose: () => void;
}

const LABEL = "block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1.5";
const INPUT = "w-full h-9 bg-bg border border-border rounded-lg px-3 text-xs text-text focus:outline-none focus:border-brand";

// Solo-send composer modal. Lifted out of the dashboard page so the page file is
// less monolithic. State stays in the parent so the parent can prefill it from a
// clicked lead row.
export function ComposerModal({
  open,
  recipientEmail,
  senders,
  senderId,
  subject,
  body,
  sending,
  result,
  onSenderChange,
  onSubjectChange,
  onBodyChange,
  onSend,
  onClose,
}: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="glass border border-border rounded-2xl w-full max-w-xl shadow-[0_24px_64px_rgba(0,0,0,.5)]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div>
            <h3 className="text-sm font-bold text-text flex items-center gap-2">
              <Send className="w-4 h-4 text-brand" /> Send Email
            </h3>
            <p className="text-[11px] text-text-muted mt-0.5">To: {recipientEmail}</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-text-muted hover:text-text rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className={LABEL}>From</label>
            <select value={senderId} onChange={(e) => onSenderChange(e.target.value)} className="w-full h-9 bg-bg border border-border rounded-lg px-2 text-xs text-text focus:outline-none focus:border-brand">
              {senders.length === 0 ? (
                <option>No active senders</option>
              ) : (
                senders.map((s) => (<option key={s.id} value={s.id}>{s.provider} — {s.fromEmail}</option>))
              )}
            </select>
          </div>
          <div>
            <label className={LABEL}>Subject</label>
            <input type="text" value={subject} onChange={(e) => onSubjectChange(e.target.value)} className={INPUT} />
          </div>
          <div>
            <label className={LABEL}>Body</label>
            <textarea rows={8} value={body} onChange={(e) => onBodyChange(e.target.value)} className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-xs text-text focus:outline-none focus:border-brand resize-y" />
          </div>
          {result && (
            <div className={`p-2.5 rounded-lg text-[11px] border ${result.ok ? "bg-success/10 text-success border-success/30" : "bg-danger/10 text-danger border-danger/30"}`}>
              {result.message}
            </div>
          )}
        </div>
        <div className="p-5 border-t border-border flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-xs font-semibold text-text-muted hover:text-text rounded-lg">Cancel</button>
          <button
            onClick={onSend}
            disabled={sending || !senderId || !subject || !body}
            className="px-4 py-1.5 bg-brand hover:bg-brand-hover disabled:opacity-50 rounded-lg text-xs font-bold text-bg flex items-center gap-1.5 shadow-[0_0_12px_rgba(20,184,166,0.3)]"
          >
            <Send className={`w-3.5 h-3.5 ${sending ? "animate-pulse" : ""}`} />
            {sending ? "Sending…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
