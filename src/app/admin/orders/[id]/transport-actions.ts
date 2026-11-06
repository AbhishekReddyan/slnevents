"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/lib/types";

const money = (v: FormDataEntryValue | null) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) && n >= 0 && n <= 10000000 ? n : null;
};

/** Owner only: transport, an extra amount (with a reason shown on the bill) and discount for ONE order. */
export async function saveBill(_: FormState, fd: FormData): Promise<FormState> {
  await requireRole(["owner"]);
  const id = String(fd.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: "Invalid order." };
  const transport = money(fd.get("transport"));
  const extra = money(fd.get("extra_amount"));
  const discount = money(fd.get("discount"));
  if (transport === null || extra === null || discount === null) return { error: "Enter amounts of 0 or more." };
  const note = String(fd.get("extra_note") ?? "").trim().slice(0, 200);
  const sb = await createClient();
  const { error } = await sb
    .from("order_prices")
    .upsert({ order_id: id, transport, extra_amount: extra, extra_note: note || null, discount }, { onConflict: "order_id" });
  if (error) return { error: error.message };
  revalidatePath(`/admin/orders/${id}`);
  return { ok: "Bill saved." };
}
