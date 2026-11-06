"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import PhotoCapture from "./PhotoCapture";
import { sharedPhotoGroup } from "@/lib/photo-groups";
import { recordPickup } from "./actions";

export type PickupLine = { id: string; name: string; delivered: number; photos: number; group?: string | null };

/** Pickup: quantity per item, a camera photo for every item, and a reason when fewer come back. */
export default function PickupForm({ orderId, lines }: { orderId: string; lines: PickupLine[] }) {
  const [qty, setQty] = useState<Record<string, number>>(Object.fromEntries(lines.map((l) => [l.id, l.delivered])));
  const [photos, setPhotos] = useState<Record<string, number>>(Object.fromEntries(lines.map((l) => [l.id, l.photos])));
  const [reason, setReason] = useState<Record<string, string>>({});

  const sharedOf = (l: PickupLine) => sharedPhotoGroup(l.group);
  const needPhoto = lines.filter((l) => l.delivered > 0 && (qty[l.id] ?? 0) > 0 && (photos[l.id] ?? 0) === 0);
  const needReason = lines.filter((l) => (qty[l.id] ?? 0) < l.delivered && !reason[l.id]);

  return (
    <ActionForm action={recordPickup} className="space-y-3">
      <h2 className="font-semibold">Pick up from the customer</h2>
      <p className="text-sm text-slate-600">
        Count what you collected and take one photo of each item. If fewer come back, choose why.
      </p>
      <input type="hidden" name="id" value={orderId} />
      {lines.map((l, idx) => {
        const short = l.delivered - (qty[l.id] ?? 0);
        const sg = sharedOf(l);
        const lastOfGroup = sg && !lines.slice(idx + 1).some((x) => sharedOf(x) === sg);
        const covered = sg ? lines.filter((x) => sharedOf(x) === sg && x.delivered > 0 && (qty[x.id] ?? 0) > 0) : [];
        return (
          <div key={l.id} className="space-y-3">
          <div className={`card !p-3 ${short > 0 ? "!border-amber-400" : ""}`}>
            <input type="hidden" name={`pq_${l.id}`} value={qty[l.id] ?? 0} />
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold">{l.name}</p>
              <p className="text-xs text-slate-500">Delivered {l.delivered}</p>
            </div>
            {l.delivered === 0 ? (
              <p className="mt-1 text-xs text-slate-500">Never delivered. Nothing to pick up.</p>
            ) : (
              <>
                <div className="mt-2 flex items-center gap-2">
                  <label className="text-sm text-slate-600" htmlFor={`pqi_${l.id}`}>Picked up</label>
                  <input
                    id={`pqi_${l.id}`} type="number" inputMode="numeric" min={0} max={l.delivered} value={qty[l.id] ?? 0}
                    onChange={(e) => setQty((q) => ({ ...q, [l.id]: Math.max(0, Math.min(l.delivered, Math.floor(Number(e.target.value)) || 0)) }))}
                    className="input !w-24 text-center"
                  />
                </div>
                {short > 0 && (
                  <div className="mt-2 space-y-2 rounded-lg bg-amber-50 p-2">
                    <p className="text-sm font-medium text-amber-900">{short} not returned. Why?</p>
                    <select
                      name={`pr_${l.id}`} value={reason[l.id] ?? ""} onChange={(e) => setReason((r) => ({ ...r, [l.id]: e.target.value }))}
                      className="input" aria-label="Reason"
                    >
                      <option value="" disabled>Choose a reason…</option>
                      <option value="returning_late">Returning late (customer will bring it)</option>
                      <option value="missing">Missing (customer cannot find it)</option>
                    </select>
                    <input name={`pn_${l.id}`} placeholder="Note (optional), for example promised by Friday" className="input" />
                  </div>
                )}
                {!sg && (qty[l.id] ?? 0) > 0 && (
                  <PhotoCapture
                    orderId={orderId} lineId={l.id} kind="pickup" count={photos[l.id] ?? 0}
                    onAdded={() => setPhotos((p) => ({ ...p, [l.id]: (p[l.id] ?? 0) + 1 }))}
                  />
                )}
              </>
            )}
          </div>
          {lastOfGroup && covered.length > 0 && (
            <div className="card !border-emerald-500 !p-3">
              <p className="text-sm font-semibold">One photo for all {sg} sizes</p>
              <p className="text-xs text-slate-500">Stack them together and take one photo. It is saved for: {covered.map((x) => x.name).join(", ")}.</p>
              <PhotoCapture
                orderId={orderId} lineId={covered[0].id} lineIds={covered.map((x) => x.id)} kind="pickup"
                count={Math.min(...covered.map((x) => photos[x.id] ?? 0))}
                onAdded={() => setPhotos((p) => { const n = { ...p }; covered.forEach((x) => { n[x.id] = (n[x.id] ?? 0) + 1; }); return n; })}
              />
            </div>
          )}
          </div>
        );
      })}
      {needPhoto.length > 0 && <p className="text-sm font-medium text-red-600">Photo needed for: {needPhoto.map((l) => l.name).join(", ")}</p>}
      {needReason.length > 0 && <p className="text-sm font-medium text-red-600">Choose a reason for: {needReason.map((l) => l.name).join(", ")}</p>}
      <SubmitButton disabled={needPhoto.length > 0 || needReason.length > 0} className="btn-primary w-full !min-h-[56px] text-lg">
        Mark picked up
      </SubmitButton>
    </ActionForm>
  );
}
