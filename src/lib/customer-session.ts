import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

/**
 * Customer login session: a signed, httpOnly cookie holding { id, n (name), exp }.
 * The signature uses CUSTOMER_SESSION_SECRET (falls back to the service role key, which is
 * already server-only), so the cookie cannot be forged or edited in the browser.
 */
const COOKIE = "sln_session";
const DAYS = 30;

export type CustomerSession = { id: string; name: string };

const secret = () => process.env.CUSTOMER_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const sign = (body: string) => createHmac("sha256", secret()).update(body).digest("base64url");

export async function getCustomer(): Promise<CustomerSession | null> {
  if (!secret()) return null;
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const [body, sig] = raw.split(".");
  if (!body || !sig) return null;
  const want = sign(body);
  if (sig.length !== want.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
  try {
    const j = JSON.parse(Buffer.from(body, "base64url").toString()) as { id?: string; n?: string; exp?: number };
    if (!j.id || typeof j.n !== "string" || !j.exp || j.exp < Date.now() / 1000) return null;
    return { id: j.id, name: j.n };
  } catch {
    return null;
  }
}

export async function startSession(c: CustomerSession) {
  const body = Buffer.from(JSON.stringify({ id: c.id, n: c.name, exp: Math.floor(Date.now() / 1000) + DAYS * 86400 })).toString("base64url");
  (await cookies()).set(COOKIE, `${body}.${sign(body)}`, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: DAYS * 86400,
  });
}

export async function endSession() {
  (await cookies()).delete(COOKIE);
}
