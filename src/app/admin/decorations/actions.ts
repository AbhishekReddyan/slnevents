"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/lib/types";

export async function addDecoration(_: FormState, fd: FormData): Promise<FormState> {
  const sb = await createClient();
  const photo = String(fd.get("photo_url") ?? "").trim();
  if (!photo) return { error: "Please upload a photo of the design." };

  const { data: last } = await sb.from("decorations").select("sort_order").order("sort_order", { ascending: false }).limit(1);
  const next = ((last?.[0]?.sort_order as number | undefined) ?? 0) + 1;
  const { error } = await sb.from("decorations").insert({
    title: `Design ${next}`, // only the photo is shown; the column needs some text
    photo_url: photo,
    sort_order: next,
  });
  if (error) return { error: error.message };
  revalidatePath("/admin", "layout");
  revalidatePath("/");
  return { ok: "Design added." };
}

/** Deletes a design; if past orders used it, it is hidden from customers instead. */
export async function removeDecoration(fd: FormData) {
  const sb = await createClient();
  const id = String(fd.get("id") ?? "");
  if (!id) return;
  const { error } = await sb.from("decorations").delete().eq("id", id);
  if (error) await sb.from("decorations").update({ active: false }).eq("id", id);
  revalidatePath("/admin", "layout");
  revalidatePath("/");
}
