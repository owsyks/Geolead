import type { NextRequest } from "next/server";

const MAINTENANCE_PAGE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex, nofollow, noarchive" />
    <title>Temporarily unavailable</title>
    <style>
      :root { color-scheme: dark; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 24px;
        background: #090b0b;
        color: #f4f7f6;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      main { max-width: 560px; text-align: center; }
      h1 { margin: 0 0 12px; font-size: clamp(2rem, 7vw, 3.5rem); line-height: 1; }
      p { margin: 0; color: #a8b0ad; font-size: 1.05rem; line-height: 1.6; }
    </style>
  </head>
  <body>
    <main>
      <h1>Temporarily unavailable</h1>
      <p>We are performing maintenance. Please try again later.</p>
    </main>
  </body>
</html>`;

export function proxy(request: NextRequest): Response {
  const headers = new Headers({
    "Cache-Control": "no-store, max-age=0",
    "Content-Security-Policy":
      "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    "Content-Type": "text/html; charset=utf-8",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
    "Referrer-Policy": "no-referrer",
    "Retry-After": "3600",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
  });

  return new Response(request.method === "HEAD" ? null : MAINTENANCE_PAGE, {
    status: 503,
    headers,
  });
}

export const config = {
  matcher: "/:path*",
};
