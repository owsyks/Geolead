// Shared Clerk theming, applied globally via <ClerkProvider appearance={...}>.
// Literal hex values, not CSS var() references: Clerk's `variables` engine
// does real color math internally (deriving hover/focus/muted shades via
// color-mix()), which needs an actual parseable color — a var() reference
// either fails to parse (falling back to Clerk's own light-mode defaults,
// which is what caused the low-contrast/white-input look on the first pass)
// or requires a browser new enough to support color-mix()/relative color
// syntax. Mirrors the dark-theme hex values in globals.css's `.dark` block
// (the app's default theme; the auth pages don't yet react to the light/dark
// toggle, so this isn't theme-reactive — a reasonable follow-up, not needed
// for the current bug).
//
// Also note some keys are new names for previously-deprecated ones:
// colorInputBackground -> colorInput, colorInputText -> colorInputForeground,
// colorTextSecondary -> colorMutedForeground, colorTextOnPrimaryBackground ->
// colorPrimaryForeground.
export const clerkAppearance = {
  variables: {
    colorPrimary: "#14b8a6",
    colorPrimaryForeground: "#0c0a09",
    colorBackground: "#0f0d0c",
    colorText: "#fafaf9",
    colorMutedForeground: "#a8a29e",
    colorInput: "#211e1b",
    colorInputForeground: "#fafaf9",
    colorNeutral: "#fafaf9",
    colorDanger: "#f43f5e",
    colorSuccess: "#10b981",
    borderRadius: "0.75rem",
  },
  elements: {
    card: "shadow-none border border-[#292524]",
  },
};
