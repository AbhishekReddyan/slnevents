import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/auth";
import { ORDER_SELECT } from "@/lib/queries";
import { addDays, todayIn } from "@/lib/format";
import type { Alert, Order } from "@/lib/types";
import OrderCard from "@/components/OrderCard";
import RealtimeRefresh from "@/components/RealtimeRefresh";

export default async function Dashboard() {
  const sb = await createClient();
  const settings = await getSettings();
  const today = todayIn(settings.timezone);

  const [{ data: orderData, error: orderError }, { data: short }, { data: alertData }] = await Promise.all([
    sb
      .from("orders")
      .select(ORDER_SELECT)
      .in("status", ["pending_approval", "confirmed", "loaded", "delivered", "picked_up", "returned"])
      .order("start_date"),
    sb.rpc("orders_shortfalls"),
    sb.from("alerts").select("*").is("read_at", null).order("created_at", { ascending: false }).limit(5),
  ]);
  const orders = (orderData ?? []) as unknown as Order[];
  const shortMap = new Map<string, number>(((short ?? []) as { order_id: string; total_shortage: number }[]).map((s) => [s.order_id, s.total_shortage]));
  const alerts = (alertData ?? []) as Alert[];

  const pending = orders.filter((o) => o.status === "pending_approval");
  const needSourcing = orders.filter((o) => shortMap.has(o.id));
  const weekEnd = addDays(today, 7);
  const upcoming = orders.filter(
    (o) => ["confirmed", "loaded", "delivered", "picked_up"].includes(o.status) && o.start_date <= weekEnd
  );
  const awaitingReturn = orders.filter((o) => o.status === "picked_up");
  const { count: notReturned } = await sb.from("outstanding_items").select("id", { count: "exact", head: true }).eq("status", "open");

  return (
    <div className="space-y-6">
      <RealtimeRefresh tables={["orders", "order_items", "items"]} />
      <h1 className="h1">Dashboard</h1>
      {orderError && <p className="card text-red-700">Could not load orders: {orderError.message}</p>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Pending approval" value={pending.length} href="/admin/orders?status=pending_approval" tone="amber" />
        <Stat label="Needs sourcing" value={needSourcing.length} href="/admin/orders" tone="red" />
        <Stat label="Next 7 days" value={upcoming.length} href="/admin/orders?status=confirmed" tone="blue" />
        <Stat label="Awaiting return check-in" value={awaitingReturn.length} href="/admin/orders" tone="purple" />
        <Stat label="Items not returned" value={notReturned ?? 0} href="/admin/outstanding" tone="red" />
      </div>

      {alerts.length > 0 && (
        <section className="card border-red-200 bg-red-50">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold text-red-800">Unread alerts</h2>
            <Link href="/admin/alerts" className="text-sm font-semibold text-red-800 underline">See all</Link>
          </div>
          <ul className="space-y-1 text-sm">
            {alerts.map((a) => (
              <li key={a.id}>
                {a.order_id ? <Link href={`/admin/orders/${a.order_id}`} className="underline">{a.message}</Link> : a.message}
              </li>
            ))}
          </ul>
        </section>
      )}

      {needSourcing.length > 0 && (
        <Section title="Needs sourcing">
          {needSourcing.map((o) => <OrderCard key={o.id} order={o} short={shortMap.get(o.id)} />)}
        </Section>
      )}

      <Section title="Pending requests (do not reserve stock)">
        {pending.map((o) => <OrderCard key={o.id} order={o} short={shortMap.get(o.id) ?? 0} />)}
        {pending.length === 0 && <p className="text-sm text-slate-500">Nothing waiting.</p>}
      </Section>

      <Section title="Confirmed and in progress">
        {orders.filter((o) => o.status !== "pending_approval").map((o) => (
          <OrderCard key={o.id} order={o} short={shortMap.get(o.id) ?? 0} />
        ))}
      </Section>
    </div>
  );
}

function Stat({ label, value, href, tone }: { label: string; value: number; href: string; tone: "amber" | "red" | "blue" | "purple" }) {
  const tones = { amber: "text-amber-700", red: "text-red-600", blue: "text-blue-700", purple: "text-purple-700" };
  return (
    <Link href={href} className="card">
      <p className={`text-3xl font-bold ${tones[tone]}`}>{value}</p>
      <p className="text-xs text-slate-600">{label}</p>
    </Link>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 font-semibold">{title}</h2>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </section>
  );
}
