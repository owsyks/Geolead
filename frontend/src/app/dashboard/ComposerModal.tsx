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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Send className="w-4 h-4 text-emerald-400" /> Send Email
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">To: {recipientEmail}</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">From</label>
            <select
              value={senderId}
              onChange={(e) => onSenderChange(e.target.value)}
              className="w-full h-9 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-2 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
            >
              {senders.length === 0 ? (
                <option>No active senders</option>
              ) : (
                senders.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.provider} — {s.fromEmail}
                  </option>
                ))
              )}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Subject</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => onSubjectChange(e.target.value)}
              className="w-full h-9 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-3 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Body</label>
            <textarea
              rows={8}
              value={body}
              onChange={(e) => onBodyChange(e.target.value)}
              className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500 resize-y"
            />
          </div>
          {result && (
            <div
              className={`p-2.5 rounded-lg text-[11px] ${
                result.ok
                  ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/30"
                  : "bg-rose-500/10 text-rose-300 border border-rose-500/30"
              }`}
            >
              {result.message}
            </div>
          )}
        </div>
        <div className="p-5 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-semibold text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={onSend}
            disabled={sending || !senderId || !subject || !body}
            className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-500 rounded-lg text-xs font-bold text-white flex items-center gap-1.5"
          >
            <Send className={`w-3.5 h-3.5 ${sending ? "animate-pulse" : ""}`} />
            {sending ? "Sending…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
