"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { purgePhotos, type CleanupResult } from "@/lib/photo-cleanup";
import type { FormState } from "@/lib/types";

/** Owner only: delete every photo of this order now, ignoring the retention period. */
export async function deleteOrderPhotos(_: FormState, fd: FormData): Promise<FormState> {
  await requireRole(["owner"]);
  const id = String(fd.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: "Invalid order." };
  const sb = await createClient();
  const { data, error } = await sb.from("order_item_photos").select("id, path").eq("order_id", id);
  if (error) return { error: error.message };
  const res: CleanupResult = { orders: 0, filesDeleted: 0, rowsDeleted: 0, errors: [] };
  await purgePhotos(createAdminClient(), id, (data ?? []) as { id: string; path: string }[], "owner", res);
  console.log(JSON.stringify({ event: "photo_delete_now", order: id, ...res, errors: res.errors.length }));
  if (res.errors.length) return { error: res.errors[0] };
  revalidatePath(`/admin/orders/${id}`);
  return { ok: `Deleted ${res.filesDeleted} photo file(s).` };
}
