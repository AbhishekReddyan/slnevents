"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import PhotoCapture from "./PhotoCapture";
import { sharedPhotoGroup } from "@/lib/photo-groups";
import { recordDelivery } from "./actions";

export type DeliveryLine = { id: string; name: string; ordered: number; delivered: number; photos: number; group?: string | null };

/** Delivery: quantity per item + a camera photo for every item before it can be marked delivered. */
export default function DeliveryForm({ orderId, lines, title }: { orderId: string; lines: DeliveryLine[]; title: string }) {
  const [qty, setQty] = useState<Record<string, number>>(
    Object.fromEntries(lines.map((l) => [l.id, l.ordered - l.delivered]))
  );
  const [photos, setPhotos] = useState<Record<string, number>>(Object.fromEntries(lines.map((l) => [l.id, l.photos])));

  const sharedOf = (l: DeliveryLine) => sharedPhotoGroup(l.group);
  const needPhoto = lines.filter((l) => (qty[l.id] ?? 0) > 0 && (photos[l.id] ?? 0) === 0);
  const total = lines.reduce((s, l) => s + (qty[l.id] ?? 0), 0);
  const pendingAfter = lines.reduce((s, l) => s + (l.ordered - l.delivered - (qty[l.id] ?? 0)), 0);

  return (
    <ActionForm action={recordDelivery} className="space-y-3">
      <h2 className="font-semibold">{title}</h2>
      <p className="text-sm text-slate-600">
        Enter how many you delivered and take one photo of each item (for example all 50 chairs stacked together).
      </p>
      <input type="hidden" name="id" value={orderId} />
      {lines.map((l, idx) => {
        const left = l.ordered - l.delivered;
        const sg = sharedOf(l);
        const lastOfGroup = sg && !lines.slice(idx + 1).some((x) => sharedOf(x) === sg);
        const covered = sg ? lines.filter((x) => sharedOf(x) === sg && (qty[x.id] ?? 0) > 0) : [];
        return (
          <div key={l.id} className="space-y-3">
          <div className="card !p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold">{l.name}</p>
              <p className="text-xs text-slate-500">Ordered {l.ordered}{l.delivered > 0 && ` · delivered ${l.delivered}`}</p>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <label className="text-sm text-slate-600" htmlFor={`dq_${l.id}`}>Delivered now</label>
              <input
                id={`dq_${l.id}`} name={`dq_${l.id}`} type="number" inputMode="numeric" min={0} max={left}
                value={qty[l.id] ?? 0}
                onChange={(e) => setQty((q) => ({ ...q, [l.id]: Math.max(0, Math.min(left, Math.floor(Number(e.target.value)) || 0)) }))}
                className="input !w-24 text-center"
              />
              {(qty[l.id] ?? 0) < left && <span className="text-xs font-semibold text-amber-700">{left - (qty[l.id] ?? 0)} pending</span>}
            </div>
            {!sg && (qty[l.id] ?? 0) > 0 && (
              <PhotoCapture
                orderId={orderId} lineId={l.id} kind="delivery" count={photos[l.id] ?? 0}
                onAdded={() => setPhotos((p) => ({ ...p, [l.id]: (p[l.id] ?? 0) + 1 }))}
              />
            )}
          </div>
          {lastOfGroup && covered.length > 0 && (
            <div className="card !border-emerald-500 !p-3">
              <p className="text-sm font-semibold">One photo for all {sg} sizes</p>
              <p className="text-xs text-slate-500">Stack them together and take one photo. It is saved for: {covered.map((x) => x.name).join(", ")}.</p>
              <PhotoCapture
                orderId={orderId} lineId={covered[0].id} lineIds={covered.map((x) => x.id)} kind="delivery"
                count={Math.min(...covered.map((x) => photos[x.id] ?? 0))}
                onAdded={() => setPhotos((p) => { const n = { ...p }; covered.forEach((x) => { n[x.id] = (n[x.id] ?? 0) + 1; }); return n; })}
              />
            </div>
          )}
          </div>
        );
      })}
      {needPhoto.length > 0 && (
        <p className="text-sm font-medium text-red-600">Photo needed for: {needPhoto.map((l) => l.name).join(", ")}</p>
      )}
      <SubmitButton disabled={total === 0 || needPhoto.length > 0} className="btn-primary w-full !min-h-[56px] text-lg">
        {pendingAfter > 0 ? "Mark delivered (some pending)" : "Mark delivered"}
      </SubmitButton>
    </ActionForm>
  );
}
