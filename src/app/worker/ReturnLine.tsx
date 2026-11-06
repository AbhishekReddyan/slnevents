"use client";

import { useState } from "react";
import { fill, type Dict } from "@/lib/i18n-shared";

/** One row of the return checklist. Missing is worked out automatically. */
export default function ReturnLine({
  id, name, qty, sourced, t,
}: { id: string; name: string; qty: number; sourced: number; t: Dict }) {
  const [ret, setRet] = useState(qty);
  const [dmg, setDmg] = useState(0);
  const missing = Math.max(0, qty - ret - dmg);
  const over = ret + dmg > qty;
  const n = (v: string) => Math.max(0, Math.floor(Number(v)) || 0);

  return (
    <div className={`rounded-lg border p-3 ${over ? "border-red-400 bg-red-50" : "border-slate-200 bg-white"}`}>
      <div className="flex items-center justify-between">
        <p className="font-semibold">{name}</p>
        <p className="text-sm text-slate-600">{t.sent}: <b>{qty}</b></p>
      </div>
      {sourced > 0 && <p className="text-xs text-amber-700">{fill(t.supplierReturn, { n: sourced })}</p>}
      <input type="hidden" name={`mis_${id}`} value={missing} />
      <div className="mt-2 grid grid-cols-3 gap-2 text-center text-sm">
        <label>
          <span className="mb-1 block text-xs text-slate-500">{t.returnedOk}</span>
          <input name={`ret_${id}`} type="number" inputMode="numeric" min={0} value={ret} onChange={(e) => setRet(n(e.target.value))} className="input text-center" />
        </label>
        <label>
          <span className="mb-1 block text-xs text-slate-500">{t.damaged}</span>
          <input name={`dmg_${id}`} type="number" inputMode="numeric" min={0} value={dmg} onChange={(e) => setDmg(n(e.target.value))} className="input text-center" />
        </label>
        <div>
          <span className="mb-1 block text-xs text-slate-500">{t.missing}</span>
          <div className={`flex min-h-[44px] items-center justify-center rounded-lg font-bold ${missing > 0 ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-500"}`}>
            {missing}
          </div>
        </div>
      </div>
      {over && <p className="mt-1 text-xs font-semibold text-red-600">{fill(t.returnedMore, { n: qty })}</p>}
    </div>
  );
}
