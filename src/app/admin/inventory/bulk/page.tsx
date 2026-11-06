import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { one } from "@/lib/format";
import type { Item } from "@/lib/types";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { bulkSave } from "../actions";

export default async function BulkPage() {
  const sb = await createClient();
  const { data } = await sb
    .from("items")
    .select("id, name, total_qty, unavailable_qty, emoji, item_prices(price_per_day)")
    .eq("active", true)
    .order("sort_order")
    .order("name");
  const items = (data ?? []) as unknown as Item[];

  return (
    <div className="space-y-4">
      <Link href="/admin/inventory" className="text-sm text-emerald-700 underline">← Inventory</Link>
      <h1 className="h1">Quick update: stock and prices</h1>
      <p className="text-sm text-slate-600">
        Type the quantity you own, how many are damaged or in repair, and the price per day. Press Save once at the
        bottom. Only the rows you change are updated.
      </p>
      <ActionForm action={bulkSave} className="space-y-3">
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[480px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="p-2">Item</th>
                <th className="p-2">Total qty</th>
                <th className="p-2">Damaged</th>
                <th className="p-2">₹ / day</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className="border-t border-slate-100">
                  <td className="p-2 font-medium">{it.emoji} {it.name}</td>
                  <td className="p-2"><input name={`qty_${it.id}`} type="number" min={0} defaultValue={it.total_qty} className="input !w-24" /></td>
                  <td className="p-2"><input name={`dmg_${it.id}`} type="number" min={0} defaultValue={it.unavailable_qty} className="input !w-24" /></td>
                  <td className="p-2"><input name={`price_${it.id}`} type="number" min={0} step="0.01" defaultValue={Number(one(it.item_prices)?.price_per_day ?? 0)} className="input !w-28" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <SubmitButton className="btn-primary w-full">Save all</SubmitButton>
      </ActionForm>
    </div>
  );
}
