"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/** Owner only. Pass an empty string to remove the logo. */
export async function saveLogo(url: string): Promise<{ error?: string }> {
  await requireRole(["owner"]);
  const sb = await createClient();
  const { error } = await sb.from("settings").update({ logo_url: url || null }).eq("id", 1);
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return {};
}
