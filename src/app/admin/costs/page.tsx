import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { money, one } from "@/lib/format";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { saveRates } from "./actions";

type Row = { id: string; name: string; emoji: string | null; group_name: string | null; item_prices: { price_per_day: number } | { price_per_day: number }[] | null };

/** The standard rate card: one price per day for each item, used for every new order. */
export default async function CostsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const term = (q ?? "").trim().toLowerCase();
  const sb = await createClient();
  const { data, error } = await sb
    .from("items")
    .select("id, name, emoji, group_name, item_prices(price_per_day)")
    .eq("active", true)
    .order("sort_order")
    .order("name");
  const all = (data ?? []) as unknown as Row[];
  const rows = all.filter((r) => !term || r.name.toLowerCase().includes(term));
  const unpriced = all.filter((r) => Number(one(r.item_prices)?.price_per_day ?? 0) === 0).length;

  return (
    <div className="space-y-4">
      <h1 className="h1">Costs: standard rates</h1>
      <p className="text-sm text-slate-600">
        These are the prices per day used for every new order, so you do not enter prices order by order. For one customer,
        use the <b>Bill</b> card on their order (transport, an extra amount with a reason, or a discount).
      </p>
      {unpriced > 0 && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{unpriced} item(s) have no price yet (₹0).</p>}
      {error && <p className="card text-red-700">Could not load items: {error.message}</p>}

      <form method="get" className="flex gap-2">
        <input name="q" defaultValue={q ?? ""} placeholder="Search item" className="input" />
        <button className="btn-secondary">Search</button>
      </form>

      <ActionForm action={saveRates} className="space-y-3">
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[360px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr><th className="p-2">Item</th><th className="p-2 text-right">Now</th><th className="p-2">₹ per day</th></tr>
            </thead>
            <tbody>
              {rows.map((it) => {
                const price = Number(one(it.item_prices)?.price_per_day ?? 0);
                return (
                  <tr key={it.id} className="border-t border-slate-100">
                    <td className="p-2 font-medium">{it.emoji} {it.name}</td>
                    <td className="p-2 text-right text-slate-500">{money(price)}</td>
                    <td className="p-2"><input name={`price_${it.id}`} type="number" min={0} step="0.01" defaultValue={price} className="input !w-28" /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="apply_open" className="mt-0.5 h-5 w-5" />
          <span>Also use the new prices for orders that are still <b>Pending</b> or <b>Confirmed</b>. Orders already loaded or delivered keep their price.</span>
        </label>
        <SubmitButton className="btn-primary w-full">Save rates</SubmitButton>
      </ActionForm>
      <p className="text-xs text-slate-500">Searching shows only some rows; saving changes only the prices of the rows shown. Stock quantities are in <Link href="/admin/inventory" className="underline">Inventory</Link>.</p>
    </div>
  );
}
