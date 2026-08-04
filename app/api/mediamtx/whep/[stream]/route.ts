import { NextResponse } from "next/server";

export const runtime = "nodejs";

const base = (process.env.MEDIAMTX_BASE_URL ?? "http://127.0.0.1:8889").replace(/\/$/, "");

function absolutize(loc: string) {
  try {
    return new URL(loc, base + "/").toString();
  } catch {
    return loc;
  }
}

// ✅ Next.js 15: params must be awaited
export async function POST(req: Request, ctx: { params: Promise<{ stream: string }> }) {
  const { stream } = await ctx.params;

  const offerSdp = await req.text();
  const upstream = `${base}/${encodeURIComponent(stream)}/whep`;

  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), 3000); // 3s timeout

  try{
    const res = await fetch(upstream, {
        method: "POST",
        signal: controller.signal,
        headers: {
        "Content-Type": "application/sdp",
        "Accept": "application/sdp",
        "Cache-Control": "no-store",
        },
        body: offerSdp,
        cache: "no-store",
    });

    const answerSdp = await res.text();
    const rawLocation = res.headers.get("location") ?? "";
    const location = rawLocation ? absolutize(rawLocation) : "";

    return new NextResponse(answerSdp, {
        status: res.status,
        headers: {
        "Content-Type": "application/sdp",
        "X-WHEP-Location": location,
        "Cache-Control": "no-store",
        },
    });
  } finally {
    clearTimeout(id);
  }
}

export async function DELETE(req: Request) {
  const location = req.headers.get("x-whep-location");
  if (!location) return NextResponse.json({ ok: true, skipped: true });

  const res = await fetch(absolutize(location), { method: "DELETE", cache: "no-store" });
  return NextResponse.json({ ok: res.ok, status: res.status });
}
