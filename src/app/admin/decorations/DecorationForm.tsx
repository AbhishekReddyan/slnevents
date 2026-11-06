"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { createClient } from "@/lib/supabase/client";
import { addDecoration } from "./actions";

/** Shrinks big phone photos before upload (max 1200px, JPEG). */
async function shrink(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1200 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not read image"))), "image/jpeg", 0.82)
  );
}

export default function DecorationForm() {
  const [photo, setPhoto] = useState("");
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
      const path = `decor-${crypto.randomUUID()}.jpg`;
      const { error } = await sb.storage.from("item-photos").upload(path, blob, { contentType: "image/jpeg" });
      if (error) throw error;
      setPhoto(sb.storage.from("item-photos").getPublicUrl(path).data.publicUrl);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Upload failed");
    }
    setBusy(false);
  }

  return (
    <ActionForm action={addDecoration} className="card space-y-3">
      <h2 className="font-semibold">Add a decoration design</h2>
      <input type="hidden" name="photo_url" value={photo} />
      <div className="flex items-center gap-3">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="" className="h-20 w-20 rounded-lg object-cover" />
        ) : (
          <div className="flex h-20 w-20 items-center justify-center rounded-lg bg-slate-100 text-xs text-slate-400">No photo</div>
        )}
        <input type="file" accept="image/*" onChange={onFile} className="text-sm" />
      </div>
      {busy && <p className="text-sm text-slate-500">Uploading…</p>}
      {err && <p className="text-sm text-red-600">{err}</p>}
      <SubmitButton disabled={busy} className="btn-primary w-full">Add design</SubmitButton>
    </ActionForm>
  );
}
