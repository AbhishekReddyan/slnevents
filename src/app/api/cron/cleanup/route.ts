import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { runCleanup } from "@/lib/photo-cleanup";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Daily photo cleanup (called by Vercel Cron, see vercel.json).
 * Protected by the secret in the CRON_SECRET environment variable, sent as
 * "Authorization: Bearer <secret>" (Vercel adds this header itself).
 * Add ?dry=1 to see what would be deleted without deleting anything.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const got = req.headers.get("authorization") ?? "";
  const want = `Bearer ${secret ?? ""}`;
  const ok = !!secret && got.length === want.length && timingSafeEqual(Buffer.from(got), Buffer.from(want));
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await runCleanup(req.nextUrl.searchParams.get("dry") === "1");
  return NextResponse.json(result, { status: result.errors.length ? 500 : 200 });
}
