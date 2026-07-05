"use client";

// Sign-in page. Split-panel marketing layout (design parity preserved); the
// actual sign-in form is Clerk's <SignIn>, themed via clerkAppearance to
// match the rest of the split panel — Clerk owns credentials, password
// reset, and email verification now, so there's no bespoke form/handler here.
import Link from "next/link";
import { SignIn } from "@clerk/nextjs";
import { clerkAppearance } from "@/lib/clerkAppearance";

function GlowOrb({ className }: { className?: string }) {
  return <div className={`absolute rounded-full blur-[120px] pointer-events-none ${className}`} />;
}

export default function LoginPage() {
  return (
    // `dark` is pinned (same as Contact/Landing) so this page always matches
    // the Clerk card's hardcoded dark theme, regardless of the visitor's
    // current app theme — otherwise a light-mode visitor gets a jarring
    // half-light-half-dark split between this panel and Clerk's card.
    <div className="dark min-h-screen bg-bg text-text flex">
      {/* aurora background */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <GlowOrb className="top-[-15%] left-[-10%] w-[60%] h-[60%] bg-brand/8 opacity-70" />
        <GlowOrb className="bottom-[-10%] right-[-5%] w-[45%] h-[45%] bg-copper/8 opacity-50" />
        <svg className="absolute inset-0 w-full h-full opacity-[0.025] mix-blend-overlay">
          <filter id="sinoise">
            <feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="4" stitchTiles="stitch" />
          </filter>
          <rect width="100%" height="100%" filter="url(#sinoise)" />
        </svg>
      </div>

      {/* left panel — branding (desktop only) */}
      <div className="hidden lg:flex relative z-10 w-[480px] flex-shrink-0 border-r border-border flex-col justify-between p-10 overflow-hidden">
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
              Your leads are<br />
              <span className="text-brand">waiting.</span>
            </h2>
            <p className="mt-4 text-text-muted leading-relaxed">
              Sign in and pick up right where you left off — your campaigns, your leads, your inbox.
            </p>
          </div>

          {/* live activity ticker */}
          <div className="bg-surface border border-border rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 rounded-full bg-brand shadow-[0_0_8px_var(--brand)] animate-pulse" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-brand">Live Activity</span>
            </div>
            {[
              { type: "REPLIED", firm: "Apex Dental Group", time: "Just now", color: "text-brand bg-brand/10 border-brand/20" },
              { type: "OPENED", firm: "Lone Star Ortho", time: "4m ago", color: "text-success bg-success/10 border-success/20" },
              { type: "VERIFIED", firm: "Bright Smiles Clinic", time: "9m ago", color: "text-info bg-info/10 border-info/20" },
            ].map((ev, i) => (
              <div key={i} className="flex items-center gap-3 text-[12px]">
                <span className={`font-bold px-1.5 py-0.5 rounded border text-[10px] whitespace-nowrap ${ev.color}`}>{ev.type}</span>
                <span className="text-text font-medium truncate">{ev.firm}</span>
                <span className="text-text-faint ml-auto whitespace-nowrap">{ev.time}</span>
              </div>
            ))}
          </div>

          {/* social proof */}
          <div className="flex gap-6">
            {[
              { val: "14k+", label: "Leads / day" },
              { val: "89%", label: "Deliverability" },
              { val: "5.8x", label: "Reply rate" },
            ].map(s => (
              <div key={s.label}>
                <div className="text-xl font-black font-mono text-brand">{s.val}</div>
                <div className="text-[11px] text-text-muted font-medium">{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-[12px] text-text-faint">© 2025 GeoLead AI · <Link href="/" className="hover:text-text-muted transition-colors">Home</Link></p>
      </div>

      {/* right panel — Clerk sign-in */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-5 py-12">
        {/* mobile logo */}
        <Link href="/" className="lg:hidden flex items-center gap-2 mb-10">
          <img src="/logo.png" alt="GeoLead AI" className="w-8 h-8 object-contain" />
          <span className="font-black text-text">GeoLead AI</span>
        </Link>

        <SignIn
          path="/login"
          routing="path"
          signUpUrl="/register"
          fallbackRedirectUrl="/overview"
          appearance={clerkAppearance}
        />
      </div>
    </div>
  );
}
