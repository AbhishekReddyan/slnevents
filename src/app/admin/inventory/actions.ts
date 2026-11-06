"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/lib/types";

const int = (v: FormDataEntryValue | null) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? n : NaN;
};
const text = (v: FormDataEntryValue | null) => String(v ?? "").trim() || null;

export async function saveItem(_: FormState, fd: FormData): Promise<FormState> {
  const sb = await createClient();
  const id = String(fd.get("id") ?? "");
  const name = String(fd.get("name") ?? "").trim();
  const price = Number(fd.get("price_per_day"));
  const total = int(fd.get("total_qty"));
  const unavailable = fd.get("unavailable_qty") === null ? 0 : int(fd.get("unavailable_qty"));

  if (!name) return { error: "Item name is required." };
  if (!Number.isFinite(price) || price < 0) return { error: "Enter a valid price per day." };
  if (!(total >= 0)) return { error: "Enter a valid total quantity." };
  if (!(unavailable >= 0)) return { error: "Damaged / in repair must be 0 or more." };

  const fields = {
    name,
    group_name: text(fd.get("group_name")),
    variant_label: text(fd.get("variant_label")),
    emoji: text(fd.get("emoji")),
    photo_url: text(fd.get("photo_url")),
    total_qty: total,
    unavailable_qty: unavailable || 0,
  };

  let itemId = id;
  if (id) {
    const { error } = await sb.from("items").update(fields).eq("id", id);
    if (error) return { error: error.message };
  } else {
    // new items go to the end of the list
    const { data: last } = await sb.from("items").select("sort_order").order("sort_order", { ascending: false }).limit(1);
    const next = ((last?.[0]?.sort_order as number | undefined) ?? 0) + 1;
    const { data, error } = await sb.from("items").insert({ ...fields, sort_order: next }).select("id").single();
    if (error) return { error: error.message };
    itemId = data.id;
  }
  const { error: pErr } = await sb.from("item_prices").upsert({ item_id: itemId, price_per_day: price });
  if (pErr) return { error: pErr.message };

  revalidatePath("/admin", "layout");
  revalidatePath("/");
  redirect("/admin/inventory");
}

/** Update quantity, damaged and price of many items in one go. Only changed rows are written. */
export async function bulkSave(_: FormState, fd: FormData): Promise<FormState> {
  const sb = await createClient();
  const { data: items, error: e1 } = await sb.from("items").select("id, total_qty, unavailable_qty").eq("active", true);
  if (e1) return { error: e1.message };
  const { data: prices } = await sb.from("item_prices").select("item_id, price_per_day");
  const oldPrice = new Map((prices ?? []).map((p) => [p.item_id as string, Number(p.price_per_day)]));

  const priceRows: { item_id: string; price_per_day: number }[] = [];
  let changed = 0;
  for (const it of items ?? []) {
    const qty = int(fd.get("qty_" + it.id));
    const dmg = int(fd.get("dmg_" + it.id));
    const price = Number(fd.get("price_" + it.id));
    if (!(qty >= 0) || !(dmg >= 0) || !Number.isFinite(price) || price < 0) {
      return { error: "Every quantity and price must be a number, 0 or more." };
    }
    if (qty !== it.total_qty || dmg !== it.unavailable_qty) {
      const { error } = await sb.from("items").update({ total_qty: qty, unavailable_qty: dmg }).eq("id", it.id);
      if (error) return { error: error.message };
      changed++;
    }
    if (price !== (oldPrice.get(it.id) ?? 0)) priceRows.push({ item_id: it.id, price_per_day: price });
  }
  if (priceRows.length > 0) {
    const { error } = await sb.from("item_prices").upsert(priceRows);
    if (error) return { error: error.message };
  }
  revalidatePath("/admin", "layout");
  revalidatePath("/");
  return { ok: `Saved. ${changed} stock change(s), ${priceRows.length} price change(s).` };
}

/** Removes an item. If it appears in past orders it is archived instead, so history stays intact. */
export async function removeItem(fd: FormData) {
  const sb = await createClient();
  const id = String(fd.get("id") ?? "");
  if (!id) return;
  const { error } = await sb.from("items").delete().eq("id", id);
  if (error) {
    // foreign key violation: item is used by an order
    await sb.from("items").update({ active: false }).eq("id", id);
  }
  revalidatePath("/admin", "layout");
  revalidatePath("/");
}
