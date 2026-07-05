"use client";

// Sign-up page. Split-panel marketing layout (design parity preserved); the
// actual sign-up form is Clerk's <SignUp>, themed via clerkAppearance. The
// old step-2 "plan/payment" screen was already cosmetic (register() only
// ever took name/email/password — every account landed on trial regardless
// of the selected plan, and "Secured by Stripe" was aspirational copy with
// nothing behind it), so it's dropped rather than preserved; the pricing
// teaser on the left panel still gives prospective users that context.
import Link from "next/link";
import { SignUp } from "@clerk/nextjs";
import { Check } from "lucide-react";
import { clerkAppearance } from "@/lib/clerkAppearance";

function GlowOrb({ className }: { className?: string }) {
  return <div className={`absolute rounded-full blur-[120px] pointer-events-none ${className}`} />;
}

export default function RegisterPage() {
  return (
    <div className="min-h-screen bg-bg text-text flex">
      {/* aurora */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <GlowOrb className="top-[-10%] right-[-10%] w-[55%] h-[55%] bg-brand/8 opacity-60" />
        <GlowOrb className="bottom-[-15%] left-[-5%] w-[45%] h-[45%] bg-copper/8 opacity-50" />
        <svg className="absolute inset-0 w-full h-full opacity-[0.025] mix-blend-overlay">
          <filter id="sunoise">
            <feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="4" stitchTiles="stitch" />
          </filter>
          <rect width="100%" height="100%" filter="url(#sunoise)" />
        </svg>
      </div>

      {/* left branding panel — desktop */}
      <div className="hidden lg:flex relative z-10 w-[460px] flex-shrink-0 border-r border-border flex-col justify-between p-10 overflow-hidden">
        <Link href="/" className="flex items-center gap-2.5">
          <img src="/logo.png" alt="GeoLead AI" className="w-8 h-8 object-contain" />
          <span className="font-black text-text">GeoLead AI</span>
        </Link>

        <div className="space-y-8">
          <div>
            <h2
              className="text-[2.4rem] font-black tracking-[-0.04em] leading-[1.1]"
              style={{ fontFamily: "'Epilogue','Geist',sans-serif" }}
            >
              Start finding<br />
              <span className="text-brand">buyers today.</span>
            </h2>
            <p className="mt-3 text-text-muted leading-relaxed text-sm">
              Set up your account in under 2 minutes and launch your first AI-powered outreach campaign.
            </p>
          </div>

          {/* feature checklist */}
          <div className="space-y-3">
            {[
              "Geo-targeted lead discovery in any niche",
              "AI decision-maker scoring on every prospect",
              "Hyper-personalized email variants generated",
              "Automated follow-up sequences",
              "AI inbox triage & response drafts",
              "Live campaign analytics dashboard",
            ].map((f, i) => (
              <div key={i} className="flex items-start gap-3 text-[13px] text-text-muted">
                <div className="w-4 h-4 rounded-full bg-brand/15 border border-brand/30 flex items-center justify-center mt-0.5 flex-shrink-0">
                  <Check className="w-2.5 h-2.5 text-brand" />
                </div>
                {f}
              </div>
            ))}
          </div>

          {/* pricing teaser */}
          <div className="bg-surface border border-border rounded-xl p-4 space-y-2">
            <div className="text-[11px] font-bold uppercase tracking-wider text-text-muted">Pricing tiers</div>
            {[
              { name: "Free Trial", price: "$0", note: "5 searches · ~125 leads" },
              { name: "Starter",    price: "$15/mo", note: "25 searches · ~1,000 leads" },
              { name: "Pro",        price: "$29/mo", note: "100 searches · ~4,000 leads", highlight: true },
            ].map(p => (
              <div key={p.name} className="flex items-center justify-between text-[12px]">
                <span className={p.highlight ? "text-brand font-bold" : "text-text-muted"}>{p.name}</span>
                <span className={`font-mono font-black ${p.highlight ? "text-brand" : "text-text"}`}>{p.price}</span>
              </div>
            ))}
            <div className="text-[11px] text-text-faint pt-1 border-t border-border">Cancel anytime. No contracts. Upgrade anytime from Billing.</div>
          </div>
        </div>

        <p className="text-[12px] text-text-faint">© 2025 GeoLead AI · <Link href="/" className="hover:text-text-muted transition-colors">Home</Link></p>
      </div>

      {/* right panel — Clerk sign-up */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-5 py-12 overflow-y-auto">
        {/* mobile logo */}
        <Link href="/" className="lg:hidden flex items-center gap-2 mb-8">
          <img src="/logo.png" alt="GeoLead AI" className="w-8 h-8 object-contain" />
          <span className="font-black text-text">GeoLead AI</span>
        </Link>

        <SignUp
          path="/register"
          routing="path"
          signInUrl="/login"
          fallbackRedirectUrl="/overview"
          appearance={clerkAppearance}
        />
      </div>
    </div>
  );
}
