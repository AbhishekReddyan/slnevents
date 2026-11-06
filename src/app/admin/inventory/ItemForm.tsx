"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { createClient } from "@/lib/supabase/client";
import { saveItem } from "./actions";

type Props = {
  groups: string[];
  item?: {
    id: string;
    name: string;
    group_name: string;
    variant_label: string;
    emoji: string;
    photo_url: string | null;
    price_per_day: number;
    total_qty: number;
    unavailable_qty: number;
  };
};

/** Shrinks big phone photos before upload (max 1000px, JPEG). */
async function shrink(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1000 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not read image"))), "image/jpeg", 0.82)
  );
}

export default function ItemForm({ groups, item }: Props) {
  const [photo, setPhoto] = useState(item?.photo_url ?? "");
  const [emoji, setEmoji] = useState(item?.emoji ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setErr("");
    try {
      const blob = await shrink(file);
      const sb = createClient();
      const path = `${crypto.randomUUID()}.jpg`;
      const { error } = await sb.storage.from("item-photos").upload(path, blob, { contentType: "image/jpeg" });
      if (error) throw error;
      setPhoto(sb.storage.from("item-photos").getPublicUrl(path).data.publicUrl);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Upload failed");
    }
    setBusy(false);
  }

  return (
    <ActionForm action={saveItem} className="card space-y-4">
      <input type="hidden" name="id" value={item?.id ?? ""} />
      <input type="hidden" name="photo_url" value={photo} />

      <div>
        <label className="label">Photo</label>
        <div className="flex items-center gap-3">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt="" className="h-20 w-20 rounded-lg object-cover" />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-lg bg-slate-100 text-4xl">
              {emoji || <span className="text-xs text-slate-400">No photo</span>}
            </div>
          )}
          <input type="file" accept="image/*" onChange={onFile} className="text-sm" />
        </div>
        {busy && <p className="mt-1 text-sm text-slate-500">Uploading…</p>}
        {err && <p className="mt-1 text-sm text-red-600">{err}</p>}
        <div className="mt-2">
          <label className="label">Icon (shown when there is no photo)</label>
          <input name="emoji" value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={8} className="input !w-24 text-center" placeholder="🪑" />
        </div>
      </div>

      <div>
        <label className="label">Item name</label>
        <input name="name" required defaultValue={item?.name} className="input" placeholder="e.g. Annada Patre 25 kg" />
      </div>

      <div className="rounded-lg bg-slate-50 p-3">
        <p className="mb-2 text-xs text-slate-600">
          Sizes or options: give every size the same group name (e.g. &quot;Annada Patre&quot;) and its own option (e.g.
          &quot;25 kg&quot;). Customers see them together. Leave both empty for a normal item.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Group</label>
            <input name="group_name" list="groups" defaultValue={item?.group_name} className="input" />
            <datalist id="groups">
              {groups.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="label">Size / option</label>
            <input name="variant_label" defaultValue={item?.variant_label} className="input" placeholder="25 kg" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Price per day (₹)</label>
          <input name="price_per_day" type="number" min="0" step="0.01" required defaultValue={item?.price_per_day ?? 0} className="input" />
        </div>
        <div>
          <label className="label">Total quantity</label>
          <input name="total_qty" type="number" min="0" step="1" required defaultValue={item?.total_qty ?? 0} className="input" />
        </div>
      </div>
      <div>
        <label className="label">Damaged / in repair (not available to rent)</label>
        <input name="unavailable_qty" type="number" min="0" step="1" defaultValue={item?.unavailable_qty ?? 0} className="input" />
      </div>
      <SubmitButton disabled={busy} className="btn-primary w-full">
        {item ? "Save changes" : "Add item"}
      </SubmitButton>
    </ActionForm>
  );
}
