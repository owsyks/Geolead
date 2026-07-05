// Shared Clerk theming, applied globally via <ClerkProvider appearance={...}>.
// References the app's own CSS custom properties (globals.css) instead of
// hardcoded hex values, so Clerk's embedded components track the same brand
// tokens (and light/dark theme) as the rest of the app rather than drifting.
// Untyped (structural) — ClerkProvider's own prop type checks the shape;
// Clerk's exact theme-type export path has moved across versions.
export const clerkAppearance = {
  variables: {
    colorPrimary: "var(--brand)",
    colorBackground: "var(--bg-elevated)",
    colorText: "var(--text)",
    colorTextSecondary: "var(--text-muted)",
    colorInputBackground: "var(--surface)",
    colorInputText: "var(--text)",
    colorDanger: "var(--danger)",
    colorSuccess: "var(--success)",
    borderRadius: "0.75rem",
  },
  elements: {
    card: "shadow-none border border-[var(--border)] bg-[var(--bg-elevated)]",
    headerTitle: "text-[var(--text)]",
    headerSubtitle: "text-[var(--text-muted)]",
    socialButtonsBlockButton: "border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-2)]",
    formButtonPrimary: "bg-[var(--brand)] hover:opacity-90 text-[var(--bg)] normal-case shadow-none",
    footerActionLink: "text-[var(--brand)] hover:opacity-80",
    formFieldInput: "bg-[var(--surface)] border-[var(--border)] text-[var(--text)]",
    identityPreviewEditButton: "text-[var(--brand)]",
    otpCodeFieldInput: "bg-[var(--surface)] border-[var(--border)] text-[var(--text)]",
  },
};
