import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ORDER_SELECT } from "@/lib/queries";
import { STATUS_LABEL, type Order, type OrderStatus } from "@/lib/types";
import OrderCard from "@/components/OrderCard";
import RealtimeRefresh from "@/components/RealtimeRefresh";

const ACTIVE: OrderStatus[] = ["pending_approval", "confirmed", "loaded", "delivered", "picked_up", "returned"];

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const { status, q: search } = await searchParams;
  const sb = await createClient();

  let q = sb.from("orders").select(ORDER_SELECT);
  const filter = status && status in STATUS_LABEL ? (status as OrderStatus) : status === "all" ? "all" : "active";
  if (filter === "active") q = q.in("status", ACTIVE);
  else if (filter !== "all") q = q.eq("status", filter);

  // search by customer name or phone (strip characters that have a special meaning in the filter)
  const term = (search ?? "").replace(/[^\p{L}\p{N} ]/gu, "").trim();
  if (term) q = q.or(`customer_name.ilike.%${term}%,phone.ilike.%${term}%`);

  const [{ data, error }, { data: short }] = await Promise.all([
    q.order("start_date", { ascending: true }),
    sb.rpc("orders_shortfalls"),
  ]);
  const orders = (data ?? []) as unknown as Order[];
  const shortMap = new Map<string, number>(((short ?? []) as { order_id: string; total_shortage: number }[]).map((s) => [s.order_id, s.total_shortage]));

  // Add-on orders are stacked under the order they belong to (when that order is in the list too)
  const ids = new Set(orders.map((o) => o.id));
  const kids = new Map<string, Order[]>();
  orders.forEach((o) => {
    if (o.parent_order_id && ids.has(o.parent_order_id)) kids.set(o.parent_order_id, [...(kids.get(o.parent_order_id) ?? []), o]);
  });
  const roots = orders.filter((o) => !(o.parent_order_id && ids.has(o.parent_order_id)));

  const tabs: { key: string; label: string }[] = [
    { key: "active", label: "Active" },
    { key: "pending_approval", label: "Pending" },
    { key: "confirmed", label: "Confirmed" },
    { key: "closed", label: "Closed" },
    { key: "declined", label: "Declined" },
    { key: "cancelled", label: "Cancelled" },
    { key: "all", label: "All" },
  ];

  return (
    <div className="space-y-4">
      <RealtimeRefresh tables={["orders", "order_items"]} />
      <h1 className="h1">Orders</h1>
      <form method="get" className="flex gap-2">
        <input type="hidden" name="status" value={filter} />
        <input name="q" defaultValue={term} placeholder="Search customer name or phone" className="input" />
        <button className="btn-primary">Search</button>
      </form>
      {error && <p className="card text-red-700">Could not load orders: {error.message}</p>}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={`/admin/orders?status=${t.key}`}
            className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium ${
              filter === t.key ? "bg-emerald-700 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {roots.map((o) => (
          <div key={o.id} className="space-y-2">
            <OrderCard order={o} short={shortMap.get(o.id) ?? 0} parentNo={null} />
            {(kids.get(o.id) ?? []).map((c) => (
              <div key={c.id} className="ml-5 border-l-4 border-indigo-200 pl-3">
                <OrderCard order={c} short={shortMap.get(c.id) ?? 0} parentNo={o.order_no} />
              </div>
            ))}
          </div>
        ))}
      </div>
      {orders.length === 0 && <p className="card text-slate-600">No orders here.</p>}
    </div>
  );
}
