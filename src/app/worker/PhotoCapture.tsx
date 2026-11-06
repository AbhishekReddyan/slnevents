"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { addLinePhoto } from "./actions";

/** Shrinks big phone photos before upload (max 1280px, JPEG). */
async function shrink(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not read the photo"))), "image/jpeg", 0.8)
  );
}

/**
 * Opens the phone camera directly (no gallery upload) and saves the photo for one order line.
 * `capture="environment"` asks the phone to open the rear camera.
 */
export default function PhotoCapture({
  orderId, lineId, lineIds, kind, count, onAdded,
}: {
  orderId: string;
  lineId: string;
  /** Extra order lines that share this one photo (same file saved for each). Defaults to just lineId. */
  lineIds?: string[];
  kind: "delivery" | "pickup";
  count: number;
  onAdded: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [thumbs, setThumbs] = useState<string[]>([]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setErr("");
    try {
      const blob = await shrink(file);
      const path = `${orderId}/${lineId}-${kind}-${crypto.randomUUID()}.jpg`;
      const sb = createClient();
      const { error } = await sb.storage.from("proof-photos").upload(path, blob, { contentType: "image/jpeg" });
      if (error) throw new Error(error.message);
      for (const id of lineIds && lineIds.length > 0 ? lineIds : [lineId]) {
        const saved = await addLinePhoto(id, kind, path);
        if (saved.error) throw new Error(saved.error);
      }
      setThumbs((t) => [...t, URL.createObjectURL(blob)]);
      onAdded();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Could not save the photo");
    }
    setBusy(false);
  }

  return (
    <div className="mt-2">
      <input ref={ref} type="file" accept="image/*" capture="environment" onChange={onFile} className="hidden" />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => ref.current?.click()}
          disabled={busy}
          className={`btn !min-h-[44px] flex-1 ${count > 0 ? "border border-emerald-600 bg-emerald-50 text-emerald-800" : "bg-slate-800 text-white"}`}
        >
          {busy ? "Saving photo…" : count > 0 ? `Photo taken (${count}). Add another` : "Take photo"}
        </button>
        {thumbs.slice(-3).map((src) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={src} src={src} alt="" className="h-11 w-11 rounded-lg object-cover" />
        ))}
      </div>
      {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
    </div>
  );
}
