import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { money, one } from "@/lib/format";
import type { Item } from "@/lib/types";
import RealtimeRefresh from "@/components/RealtimeRefresh";
import { removeItem } from "./actions";

export default async function InventoryPage() {
  const sb = await createClient();
  const { data } = await sb
    .from("items")
    .select("*, item_prices(price_per_day)")
    .eq("active", true)
    .order("sort_order")
    .order("name");
  const items = (data ?? []) as Item[];

  return (
    <div className="space-y-4">
      <RealtimeRefresh tables={["items"]} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="h1">Inventory ({items.length})</h1>
        <div className="flex gap-2">
          <Link href="/admin/inventory/bulk" className="btn-secondary">Quick update all</Link>
          <Link href="/admin/inventory/new" className="btn-primary">+ Add item</Link>
        </div>
      </div>

      {items.length === 0 && <p className="card text-slate-600">No items yet. Add your first item.</p>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {items.map((it) => {
          const price = one(it.item_prices)?.price_per_day ?? 0;
          return (
            <div key={it.id} className="card flex gap-3">
              {it.photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={it.photo_url} alt={it.name} className="h-20 w-20 flex-none rounded-lg object-cover" />
              ) : (
                <div className="flex h-20 w-20 flex-none items-center justify-center rounded-lg bg-slate-100 text-4xl">{it.emoji ?? ""}</div>
              )}
              <div className="min-w-0 flex-1">
                <p className="font-semibold leading-tight">{it.name}</p>
                <p className="text-xs text-slate-500">{Number(price) > 0 ? `${money(Number(price))}/day` : "Price not set"}</p>
                <p className="mt-1 text-sm">
                  Total <b>{it.total_qty}</b>
                  {it.unavailable_qty > 0 && <span className="text-red-600"> · {it.unavailable_qty} damaged/repair</span>}
                </p>
                <div className="mt-2 flex items-center gap-3 text-sm">
                  <Link href={`/admin/inventory/${it.id}`} className="font-semibold text-emerald-700 underline">Edit</Link>
                  <form action={removeItem}>
                    <input type="hidden" name="id" value={it.id} />
                    <button className="text-red-600 underline">Remove</button>
                  </form>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
