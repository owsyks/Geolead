"use client";

interface Props {
  value: string | Date | null | undefined;
  format?: "datetime" | "date" | "time";
  fallback?: string;
}

export function ClientDate({ value, format = "datetime", fallback = "—" }: Props) {
  let text = fallback;
  if (value) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      if (format === "date") text = date.toLocaleDateString();
      else if (format === "time") text = date.toLocaleTimeString();
      else text = date.toLocaleString();
    }
  }

  // Render fallback during SSR/initial paint so the spot isn't empty, then
  // upgrade to the locale-formatted date on the client. suppressHydrationWarning
  // is safe here because the swap is intentional and contained to this span.
  return (
    <span suppressHydrationWarning>{text}</span>
  );
}
