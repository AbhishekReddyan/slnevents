import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/auth";
import { addDays, fmtDate, isIsoDate, todayIn } from "@/lib/format";
import RealtimeRefresh from "@/components/RealtimeRefresh";
import StatusBadge from "@/components/StatusBadge";
import type { Order } from "@/lib/types";

type Row = {
  item_id: string; item_name: string; category: string | null; day: string;
  total: number; unavailable: number; booked: number; pending: number; remaining: number;
};

export default async function AvailabilityPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const sp = await searchParams;
  const settings = await getSettings();
  const date = isIsoDate(sp.date) ? sp.date : todayIn(settings.timezone);
  const sb = await createClient();

  const [{ data: rows, error }, { data: orders }] = await Promise.all([
    sb.rpc("availability_range", { p_start: date, p_end: date }),
    sb
      .from("orders")
      .select("id, order_no, customer_name, start_date, end_date, status, order_items(qty, items(name))")
      .in("status", ["pending_approval", "confirmed", "loaded", "delivered", "picked_up"])
      .lte("start_date", date)
      .gte("end_date", date)
      .order("start_date"),
  ]);
  const list = (rows ?? []) as Row[];
  const shortCount = list.filter((r) => r.remaining < 0).length;

  return (
    <div className="space-y-4">
      <RealtimeRefresh tables={["items", "orders", "order_items"]} />
      <h1 className="h1">Availability on {fmtDate(date)}</h1>

      <form className="flex flex-wrap items-center gap-2" method="get">
        <Link href={`?date=${addDays(date, -1)}`} className="btn-secondary">←</Link>
        <input type="date" name="date" defaultValue={date} className="input !w-auto" />
        <button className="btn-primary">Go</button>
        <Link href={`?date=${addDays(date, 1)}`} className="btn-secondary">→</Link>
        <Link href="?" className="btn-secondary">Today</Link>
      </form>

      {error && <p className="card text-red-700">{error.message}</p>}
      {shortCount > 0 && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          {shortCount} item{shortCount > 1 ? "s are" : " is"} short on this date.
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[520px] text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="p-3">Item</th>
              <th className="p-3 text-right">Total</th>
              <th className="p-3 text-right">Repair</th>
              <th className="p-3 text-right">Booked</th>
              <th className="p-3 text-right">Pending</th>
              <th className="p-3 text-right">Remaining</th>
            </tr>
          </thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.item_id} className="border-t border-slate-100">
                <td className="p-3">
                  <p className="font-medium">{r.item_name}</p>
                  <p className="text-xs text-slate-500">{r.category ?? ""}</p>
                </td>
                <td className="p-3 text-right">{r.total}</td>
                <td className="p-3 text-right text-slate-500">{r.unavailable || "–"}</td>
                <td className="p-3 text-right">{r.booked}</td>
                <td className="p-3 text-right text-amber-700">
                  {r.pending || "–"}
                  {r.pending > 0 && r.remaining - r.pending < 0 && <span title="Would be short if approved"> ⚠</span>}
                </td>
                <td className={`p-3 text-right font-bold ${r.remaining < 0 ? "text-red-600" : "text-emerald-700"}`}>
                  {r.remaining}
                  {r.remaining < 0 && <span className="block text-xs font-semibold">short by {-r.remaining}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">
        Booked = confirmed orders that overlap this date. Pending requests do not reserve stock; ⚠ means approving them
        would cause a shortfall.
      </p>

      <section>
        <h2 className="mb-2 font-semibold">Orders on this date</h2>
        <div className="space-y-2">
          {((orders ?? []) as unknown as Order[]).map((o) => (
            <Link key={o.id} href={`/admin/orders/${o.id}`} className="card flex items-center justify-between">
              <span>
                <b>#{o.order_no}</b> {o.customer_name}
                <span className="block text-xs text-slate-500">{fmtDate(o.start_date)} – {fmtDate(o.end_date)}</span>
              </span>
              <StatusBadge status={o.status} />
            </Link>
          ))}
          {(orders ?? []).length === 0 && <p className="text-sm text-slate-500">No orders on this date.</p>}
        </div>
      </section>
    </div>
  );
}
