"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/lib/types";

/** Owner only: set the transport charge of one order (separate from editing the order). */
export async function setTransport(_: FormState, fd: FormData): Promise<FormState> {
  await requireRole(["owner"]);
  const id = String(fd.get("id") ?? "");
  const amount = Number(fd.get("transport"));
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: "Invalid order." };
  if (!Number.isFinite(amount) || amount < 0 || amount > 10000000) return { error: "Enter a valid amount." };
  const sb = await createClient();
  const { error } = await sb.from("order_prices").upsert({ order_id: id, transport: amount }, { onConflict: "order_id" });
  if (error) return { error: error.message };
  revalidatePath(`/admin/orders/${id}`);
  return { ok: "Transport charge saved." };
}
