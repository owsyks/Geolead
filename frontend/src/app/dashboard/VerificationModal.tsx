"use client";

import React, { useEffect, useRef } from "react";
import { X, ShieldCheck, AlertTriangle, Ban, Loader2 } from "lucide-react";

export interface EmailProgress {
  email: string;
  status: string;
  confidenceScore: number;
}

interface Props {
  open: boolean;
  results: EmailProgress[];
  total: number;
  done: number;
  complete: boolean;
  onClose: () => void;
}

export function VerificationModal({ open, results, total, done, complete, onClose }: Props) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [results.length]);

  if (!open) return null;

  const valid = results.filter((r) => r.status === "VALID").length;
  const risky = results.filter((r) => r.status === "RISKY").length;
  const invalid = results.filter((r) => r.status === "INVALID").length;
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="glass rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,.5)] border border-border w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-5 h-5 text-success" />
            <h2 className="text-sm font-bold text-text">
              {complete ? "Verification Complete" : "Verifying Emails…"}
            </h2>
          </div>
          {complete && (
            <button onClick={onClose} className="p-1 hover:bg-surface-2 rounded-lg transition-colors cursor-pointer">
              <X className="w-4 h-4 text-text-muted" />
            </button>
          )}
        </div>

        {/* Progress bar (scanline) */}
        <div className="px-6 py-3 border-b border-border/50">
          <div className="flex items-center justify-between text-xs text-text-muted mb-1.5">
            <span>{done} / {total} emails</span>
            <span>{percent}%</span>
          </div>
          <div className="w-full h-2 bg-surface-2 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-brand to-success rounded-full transition-all duration-300" style={{ width: `${percent}%` }} />
          </div>
        </div>

        {/* Email list */}
        <div ref={listRef} className="flex-1 overflow-y-auto px-6 py-3 space-y-1 min-h-[200px]">
          {results.length === 0 && !complete && (
            <div className="flex flex-col items-center justify-center py-8 gap-3">
              <Loader2 className="w-8 h-8 text-brand animate-spin" />
              <div className="text-center">
                <p className="text-sm font-semibold text-text-muted">Verifying {total} emails…</p>
                <p className="text-[11px] text-text-faint mt-1">Checking MX records, SPF/DMARC, and SMTP handshake</p>
              </div>
            </div>
          )}
          {results.length === 0 && complete && (
            <div className="flex flex-col items-center justify-center py-8 text-text-muted">
              <ShieldCheck className="w-8 h-8 mb-2 text-success" />
              <p className="text-xs">No emails to verify</p>
            </div>
          )}
          {results.map((r, i) => (
            <div key={i} className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-xs">
              {r.status === "VALID" && <ShieldCheck className="w-3.5 h-3.5 shrink-0 text-success" />}
              {r.status === "RISKY" && <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-copper" />}
              {r.status === "INVALID" && <Ban className="w-3.5 h-3.5 shrink-0 text-danger" />}
              <span className="text-text truncate flex-1">{r.email}</span>
              <span className={`shrink-0 font-semibold ${r.status === "VALID" ? "text-success" : r.status === "RISKY" ? "text-copper" : "text-danger"}`}>
                {r.status === "VALID" ? "Valid" : r.status === "RISKY" ? "Risky" : "Invalid"}
              </span>
            </div>
          ))}
          {!complete && done < total && (
            <div className="flex items-center gap-2.5 px-3 py-1.5 text-xs text-text-muted animate-pulse">
              <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" />
              <span>Checking next email…</span>
            </div>
          )}
        </div>

        {/* Footer summary */}
        {complete && (
          <div className="px-6 py-3 border-t border-border flex items-center justify-between">
            <div className="flex items-center gap-3 text-xs">
              <span className="text-success font-bold">{valid} valid</span>
              <span className="text-copper font-bold">{risky} risky</span>
              <span className="text-danger font-bold">{invalid} invalid</span>
            </div>
            <button onClick={onClose} className="px-4 py-1.5 bg-surface-2 hover:bg-surface rounded-lg text-xs font-semibold text-text transition-colors cursor-pointer">
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
