"use client";

import { useEffect, useState } from "react";

interface Props {
  value: string | Date | null | undefined;
  format?: "datetime" | "date" | "time";
  fallback?: string;
}

export function ClientDate({ value, format = "datetime", fallback = "—" }: Props) {
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    if (!value) {
      setText(fallback);
      return;
    }
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) {
      setText(fallback);
      return;
    }
    if (format === "date") setText(d.toLocaleDateString());
    else if (format === "time") setText(d.toLocaleTimeString());
    else setText(d.toLocaleString());
  }, [value, format, fallback]);

  // Render fallback during SSR/initial paint so the spot isn't empty, then
  // upgrade to the locale-formatted date on the client. suppressHydrationWarning
  // is safe here because the swap is intentional and contained to this span.
  return (
    <span suppressHydrationWarning>{text ?? fallback}</span>
  );
}
