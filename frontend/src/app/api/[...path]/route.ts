import { NextRequest, NextResponse } from "next/server";

let envTarget = (process.env.BACKEND_SERVER_URL || process.env.NEXT_PUBLIC_OUTBOUND_API_BASE || "").trim().replace(/\/+$/, "");
if (!envTarget || envTarget.includes("trycloudflare.com")) {
  envTarget = "https://hiking-discounts-behavioral-jackson.trycloudflare.com";
}
const BACKEND_URL = envTarget;

async function handleProxy(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const resolvedParams = await params;
  const path = resolvedParams?.path ? resolvedParams.path.join("/") : "";
  const searchParams = req.nextUrl.search;
  const targetUrl = `${BACKEND_URL}/api/${path}${searchParams}`;

  const headers = new Headers();
  req.headers.forEach((value, key) => {
    const lowerKey = key.toLowerCase();
    if (
      !lowerKey.startsWith("x-forwarded-") &&
      !lowerKey.startsWith("x-vercel-") &&
      !lowerKey.startsWith("cf-") &&
      lowerKey !== "host" &&
      lowerKey !== "connection" &&
      lowerKey !== "content-length"
    ) {
      headers.set(key, value);
    }
  });
  headers.set("bypass-tunnel-reminder", "true");
  if (!headers.get("user-agent")) {
    headers.set("user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
  }

  let body: ArrayBuffer | null = null;
  if (req.method !== "GET" && req.method !== "HEAD") {
    body = await req.arrayBuffer();
    if (body && body.byteLength > 0) {
      headers.set("content-length", body.byteLength.toString());
    }
  }

  try {
    const backendRes = await fetch(targetUrl, {
      method: req.method,
      headers,
      body,
      redirect: "manual",
    });

    const resHeaders = new Headers();
    backendRes.headers.forEach((value, key) => {
      const lowerKey = key.toLowerCase();
      if (lowerKey !== "content-encoding" && lowerKey !== "content-length") {
        resHeaders.set(key, value);
      }
    });

    const responseBody = await backendRes.arrayBuffer();

    return new NextResponse(responseBody, {
      status: backendRes.status,
      statusText: backendRes.statusText,
      headers: resHeaders,
    });
  } catch (error: any) {
    console.error("[API Proxy Error]:", error?.message || error);
    return NextResponse.json(
      { error: "Backend service temporarily unavailable. Please try again." },
      { status: 503 }
    );
  }
}

export const GET = handleProxy;
export const POST = handleProxy;
export const PUT = handleProxy;
export const PATCH = handleProxy;
export const DELETE = handleProxy;
export const OPTIONS = handleProxy;
