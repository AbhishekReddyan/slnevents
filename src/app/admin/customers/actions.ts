"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/lib/types";

export async function resetPin(_: FormState, fd: FormData): Promise<FormState> {
  await requireRole(["owner"]);
  const pin = String(fd.get("pin") ?? "");
  if (!/^\d{4}$/.test(pin)) return { error: "Enter a 4-digit PIN." };
  const sb = await createClient();
  const { error } = await sb.rpc("owner_reset_customer_pin", { p_id: String(fd.get("id") ?? ""), p_pin: pin });
  if (error) return { error: error.message };
  revalidatePath("/admin/customers");
  return { ok: "PIN changed. Tell the customer." };
}
