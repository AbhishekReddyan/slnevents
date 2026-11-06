"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { saveLogo } from "./actions";

/** Shrinks to at most 600px and keeps transparency (PNG). */
async function shrink(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 600 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not read image"))), "image/png")
  );
}

export default function LogoUpload({ current }: { current: string | null }) {
  const router = useRouter();
  const [logo, setLogo] = useState(current);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setMsg("");
    try {
      const blob = await shrink(file);
      const sb = createClient();
      const path = `logo-${crypto.randomUUID()}.png`;
      const { error } = await sb.storage.from("item-photos").upload(path, blob, { contentType: "image/png" });
      if (error) throw error;
      const url = sb.storage.from("item-photos").getPublicUrl(path).data.publicUrl;
      const res = await saveLogo(url);
      if (res.error) throw new Error(res.error);
      setLogo(url);
      setMsg("Logo saved.");
      router.refresh();
    } catch (ex) {
      setMsg(ex instanceof Error ? ex.message : "Upload failed");
    }
    setBusy(false);
  }

  async function remove() {
    setBusy(true);
    const res = await saveLogo("");
    setMsg(res.error ?? "Logo removed.");
    if (!res.error) setLogo(null);
    setBusy(false);
    router.refresh();
  }

  return (
    <section className="card space-y-3">
      <h2 className="font-semibold">Logo</h2>
      <div className="flex items-center gap-3">
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt="Logo" className="h-16 w-auto max-w-[10rem] rounded-lg border border-slate-200 bg-white object-contain p-1" />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-slate-100 text-xs text-slate-400">No logo</div>
        )}
        <div className="space-y-1">
          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={onFile} disabled={busy} className="text-sm" />
          {logo && (
            <button type="button" onClick={remove} disabled={busy} className="block text-sm text-red-600 underline">
              Remove logo
            </button>
          )}
        </div>
      </div>
      {busy && <p className="text-sm text-slate-500">Working…</p>}
      {msg && <p className="text-sm text-slate-700">{msg}</p>}
      <p className="text-xs text-slate-500">
        Shown on the customer page, order tracking page, login page, the owner and worker screens, and as the browser-tab icon. A square image works best. Reload the page (or close and reopen the tab) to see the new tab icon.
      </p>
    </section>
  );
}
