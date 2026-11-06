import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;
export type PhotoRow = { id: string; path: string };
export type CleanupResult = { orders: number; filesDeleted: number; rowsDeleted: number; errors: string[] };

const BUCKET = "proof-photos";

/**
 * Deletes the files from Storage first, then their database rows.
 * Safe to repeat: files that are already gone are ignored, and rows that are gone are not counted.
 * If Storage fails for an order, its rows are kept so the next run retries it.
 */
export async function purgePhotos(admin: Admin, orderId: string, photos: PhotoRow[], by: "auto" | "owner", res: CleanupResult) {
  if (photos.length === 0) return;
  let removed = 0;
  const paths = [...new Set(photos.map((p) => p.path))]; // one shared photo can belong to several order lines
  for (let i = 0; i < paths.length; i += 100) {
    const { data, error } = await admin.storage.from(BUCKET).remove(paths.slice(i, i + 100));
    if (error) {
      res.errors.push(`order ${orderId}: storage: ${error.message}`);
      res.filesDeleted += removed;
      return;
    }
    removed += data?.length ?? 0;
  }
  res.filesDeleted += removed;
  const { data: n, error } = await admin.rpc("finish_photo_cleanup", { p_order: orderId, p_photo_ids: photos.map((p) => p.id), p_by: by });
  if (error) { res.errors.push(`order ${orderId}: database: ${error.message}`); return; }
  res.rowsDeleted += Number(n ?? 0);
  res.orders += 1;
}

/** Scheduled cleanup: everything the database says is due. `dry` only reports. */
export async function runCleanup(dry = false): Promise<CleanupResult & { dry: boolean; due: number }> {
  const admin = createAdminClient();
  const res: CleanupResult = { orders: 0, filesDeleted: 0, rowsDeleted: 0, errors: [] };
  const { data, error } = await admin.rpc("photo_cleanup_candidates");
  if (error) {
    res.errors.push(`candidates: ${error.message}`);
    return { ...res, dry, due: 0 };
  }
  const rows = (data ?? []) as { order_id: string; photo_id: string; path: string }[];
  if (!dry) {
    const byOrder = new Map<string, PhotoRow[]>();
    rows.forEach((r) => byOrder.set(r.order_id, [...(byOrder.get(r.order_id) ?? []), { id: r.photo_id, path: r.path }]));
    for (const [orderId, photos] of byOrder) await purgePhotos(admin, orderId, photos, "auto", res);
  }
  const out = { ...res, dry, due: rows.length };
  console.log(JSON.stringify({ event: "photo_cleanup", ...out, errors: res.errors.length }));
  return out;
}
