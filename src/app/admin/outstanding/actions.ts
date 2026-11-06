"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/lib/types";

export async function resolveOutstanding(_: FormState, fd: FormData): Promise<FormState> {
  const sb = await createClient();
  const action = String(fd.get("action"));
  const qtyRaw = String(fd.get("qty") ?? "").trim();
  const { error } = await sb.rpc("resolve_outstanding", {
    p_id: String(fd.get("id")),
    p_action: action,
    p_qty: qtyRaw === "" ? null : Math.floor(Number(qtyRaw)),
  });
  if (error) return { error: error.message };
  revalidatePath("/admin", "layout");
  return { ok: action === "lost" ? "Written off." : "Marked as received." };
}
