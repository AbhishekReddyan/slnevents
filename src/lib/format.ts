import type { Order } from "./types";

export const money = (n: number | null | undefined) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n ?? 0);

/** "2026-11-06" -> "6 Nov 2026" */
export const fmtDate = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

export const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/** Inclusive number of days between two ISO dates. */
export const daysBetween = (start: string, end: string) =>
  Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1;

export const addDays = (iso: string, n: number) => {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Today's date (YYYY-MM-DD) in the shop's timezone. */
export const todayIn = (tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());

/** Date (YYYY-MM-DD) of a timestamp in the shop time zone. */
export const dateIn = (ts: string, tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(ts));

export const isIsoDate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** Supabase returns one-to-one embeds as an object or a 1-element array depending on version. */
export function one<T>(x: T | T[] | null | undefined): T | null {
  if (x == null) return null;
  return Array.isArray(x) ? x[0] ?? null : x;
}

export function orderTotal(o: Order): number {
  const days = daysBetween(o.start_date, o.end_date);
  const lines = (o.order_items ?? []).reduce((sum, l) => {
    const price = one(l.order_item_prices)?.price_per_day ?? 0;
    return sum + l.qty * Number(price) * days;
  }, 0);
  const discount = Number(one(o.order_prices)?.discount ?? 0);
  const transport = Number(one(o.order_prices)?.transport ?? 0);
  const decoration = Number(one(o.order_prices)?.decoration_charge ?? 0);
  return Math.max(0, lines - discount) + transport + decoration;
}
