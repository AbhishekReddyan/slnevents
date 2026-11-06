"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getLang, workerError } from "@/lib/i18n";
import type { FormState } from "@/lib/types";

function done(lang: "kn" | "en"): FormState {
  revalidatePath("/worker", "layout");
  revalidatePath("/admin", "layout");
  return { ok: "Saved." };
}

export async function toggleLoaded(fd: FormData) {
  const sb = await createClient();
  await sb.rpc("set_item_loaded", {
    p_order_item: String(fd.get("id")),
    p_loaded: String(fd.get("loaded")) === "true",
  });
  revalidatePath("/worker", "layout");
}

export async function setQty(_: FormState, fd: FormData): Promise<FormState> {
  const lang = await getLang();
  const qty = Math.floor(Number(fd.get("qty")));
  if (!(qty >= 0)) return { error: "Enter a quantity of 0 or more." };
  const sb = await createClient();
  const { error } = await sb.rpc("worker_set_item_qty", {
    p_order: String(fd.get("order_id")),
    p_item: String(fd.get("item_id")),
    p_qty: qty,
  });
  if (error) return { error: workerError(lang, error.message) };
  return done(lang);
}

export async function workerStatus(_: FormState, fd: FormData): Promise<FormState> {
  const lang = await getLang();
  const sb = await createClient();
  const { error } = await sb.rpc("set_order_status", {
    p_order: String(fd.get("id")),
    p_status: String(fd.get("status")),
    p_reason: null,
  });
  if (error) return { error: workerError(lang, error.message) };
  return done(lang);
}

export async function checkIn(_: FormState, fd: FormData): Promise<FormState> {
  const lang = await getLang();
  const lines: { order_item_id: string; returned: number; damaged: number; missing: number }[] = [];
  for (const [key, value] of fd.entries()) {
    if (!key.startsWith("ret_")) continue;
    const id = key.slice(4);
    lines.push({
      order_item_id: id,
      returned: Math.floor(Number(value)),
      damaged: Math.floor(Number(fd.get("dmg_" + id) ?? 0)),
      missing: Math.floor(Number(fd.get("mis_" + id) ?? 0)),
    });
  }
  const sb = await createClient();
  const { error } = await sb.rpc("check_in_return", { p_order: String(fd.get("id")), p_lines: lines });
  if (error) return { error: workerError(lang, error.message) };
  return done(lang);
}

/** Saves the record of a photo already uploaded from the phone camera. */
export async function addLinePhoto(lineId: string, kind: "delivery" | "pickup", path: string): Promise<{ error?: string }> {
  const sb = await createClient();
  const { error } = await sb.rpc("add_line_photo", { p_order_item: lineId, p_kind: kind, p_path: path });
  return error ? { error: error.message } : {};
}

export async function recordDelivery(_: FormState, fd: FormData): Promise<FormState> {
  const lines: { order_item_id: string; qty: number }[] = [];
  for (const [key, value] of fd.entries()) {
    if (!key.startsWith("dq_")) continue;
    lines.push({ order_item_id: key.slice(3), qty: Math.max(0, Math.floor(Number(value)) || 0) });
  }
  const sb = await createClient();
  const { error } = await sb.rpc("record_delivery", { p_order: String(fd.get("id")), p_lines: lines });
  if (error) return { error: error.message };
  return done("en");
}

export async function recordPickup(_: FormState, fd: FormData): Promise<FormState> {
  const lines: { order_item_id: string; qty: number; reason: string; note: string }[] = [];
  for (const [key, value] of fd.entries()) {
    if (!key.startsWith("pq_")) continue;
    const id = key.slice(3);
    lines.push({
      order_item_id: id,
      qty: Math.max(0, Math.floor(Number(value)) || 0),
      reason: String(fd.get("pr_" + id) ?? ""),
      note: String(fd.get("pn_" + id) ?? ""),
    });
  }
  const sb = await createClient();
  const { error } = await sb.rpc("record_pickup", { p_order: String(fd.get("id")), p_lines: lines });
  if (error) return { error: error.message };
  return done("en");
}
