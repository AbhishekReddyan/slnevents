"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/lib/types";

function done(): FormState {
  revalidatePath("/admin", "layout");
  return { ok: "Saved." };
}

export async function changeStatus(_: FormState, fd: FormData): Promise<FormState> {
  const sb = await createClient();
  const { error } = await sb.rpc("set_order_status", {
    p_order: String(fd.get("id")),
    p_status: String(fd.get("status")),
    p_reason: String(fd.get("reason") ?? "") || null,
  });
  if (error) return { error: error.message };
  return done();
}

export async function saveOrder(_: FormState, fd: FormData): Promise<FormState> {
  const sb = await createClient();
  const lines: { item_id: string; qty: number; price_per_day: number }[] = [];
  for (const [key, value] of fd.entries()) {
    if (!key.startsWith("qty_")) continue;
    const itemId = key.slice(4);
    const qty = Math.floor(Number(value));
    if (!(qty > 0)) continue;
    const price = Number(fd.get("price_" + itemId));
    lines.push({ item_id: itemId, qty, price_per_day: Number.isFinite(price) && price >= 0 ? price : 0 });
  }
  if (lines.length === 0) return { error: "An order needs at least one item with a quantity." };

  const { error } = await sb.rpc("owner_save_order", {
    p_order: String(fd.get("id")),
    p_name: String(fd.get("customer_name") ?? ""),
    p_phone: String(fd.get("phone") ?? ""),
    p_address: String(fd.get("address") ?? ""),
    p_notes: String(fd.get("notes") ?? ""),
    p_start: String(fd.get("start_date") ?? ""),
    p_end: String(fd.get("end_date") ?? ""),
    p_discount: Number(fd.get("discount") ?? 0) || 0,
    p_transport: Number(fd.get("transport") ?? 0) || 0,
    p_lines: lines,
  });
  if (error) return { error: error.message };
  return done();
}

export async function setDecorations(_: FormState, fd: FormData): Promise<FormState> {
  const sb = await createClient();
  const ids = fd.getAll("decoration").map(String);
  const { error } = await sb.rpc("owner_set_decorations", {
    p_order: String(fd.get("id")),
    p_ids: ids,
    p_charge: Number(fd.get("decoration_charge") ?? 0) || 0,
  });
  if (error) return { error: error.message };
  return done();
}

export async function addSourcing(_: FormState, fd: FormData): Promise<FormState> {
  const sb = await createClient();
  const qty = Math.floor(Number(fd.get("qty")));
  if (!(qty > 0)) return { error: "Enter the quantity you arranged." };
  const supplier = String(fd.get("supplier") ?? "").trim();
  if (!supplier) return { error: "Enter the supplier name." };
  const { error } = await sb.rpc("add_sourcing", {
    p_order: String(fd.get("order_id")),
    p_item: String(fd.get("item_id")),
    p_supplier: supplier,
    p_qty: qty,
    p_cost: Number(fd.get("cost") ?? 0) || 0,
  });
  if (error) return { error: error.message };
  return done();
}

export async function removeSourcing(fd: FormData) {
  const sb = await createClient();
  await sb.rpc("remove_sourcing", { p_id: String(fd.get("id")) });
  revalidatePath("/admin", "layout");
}

export async function markAlertRead(fd: FormData) {
  const sb = await createClient();
  await sb.from("alerts").update({ read_at: new Date().toISOString() }).eq("id", String(fd.get("id")));
  revalidatePath("/admin", "layout");
}

export async function markAllAlertsRead() {
  const sb = await createClient();
  await sb.from("alerts").update({ read_at: new Date().toISOString() }).is("read_at", null);
  revalidatePath("/admin", "layout");
}
