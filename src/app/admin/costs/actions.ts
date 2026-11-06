"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/lib/types";

/** Owner only: update the standard price per day of many items at once. */
export async function saveRates(_: FormState, fd: FormData): Promise<FormState> {
  await requireRole(["owner"]);
  const sb = await createClient();
  const [{ data: items }, { data: prices }] = await Promise.all([
    sb.from("items").select("id").eq("active", true),
    sb.from("item_prices").select("item_id, price_per_day"),
  ]);
  const old = new Map((prices ?? []).map((p) => [p.item_id as string, Number(p.price_per_day)]));

  const changed: { item_id: string; price_per_day: number }[] = [];
  for (const it of items ?? []) {
    const raw = fd.get("price_" + it.id);
    if (raw === null) continue;
    const price = Number(raw);
    if (!Number.isFinite(price) || price < 0 || price > 10000000) return { error: "Every price must be a number, 0 or more." };
    if (price !== (old.get(it.id as string) ?? 0)) changed.push({ item_id: it.id as string, price_per_day: price });
  }
  if (changed.length === 0) return { ok: "No price was changed." };

  const { error } = await sb.from("item_prices").upsert(changed);
  if (error) return { error: error.message };

  // Optionally apply the new rates to orders that are still Pending or Confirmed
  let updatedOrders = 0;
  if (fd.get("apply_open") === "on") {
    for (const c of changed) {
      const { data: lines } = await sb
        .from("order_items")
        .select("id, orders!inner(status)")
        .eq("item_id", c.item_id)
        .in("orders.status", ["pending_approval", "confirmed"]);
      const ids = (lines ?? []).map((l) => l.id as string);
      if (ids.length > 0) {
        const { error: e2 } = await sb.from("order_item_prices").update({ price_per_day: c.price_per_day }).in("order_item_id", ids);
        if (e2) return { error: e2.message };
        updatedOrders += ids.length;
      }
    }
  }
  revalidatePath("/admin/costs");
  revalidatePath("/admin/orders");
  return { ok: `Saved ${changed.length} price(s).${fd.get("apply_open") === "on" ? ` Updated ${updatedOrders} line(s) in open orders.` : " Existing orders keep the price they were placed with."}` };
}
