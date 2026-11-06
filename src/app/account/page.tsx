import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCustomer } from "@/lib/customer-session";
import { fmtDate } from "@/lib/format";
import { STATUS_LABEL, type OrderStatus } from "@/lib/types";
import StatusBadge from "@/components/StatusBadge";
import SiteHeader from "@/components/SiteHeader";
import Backdrop from "@/components/Backdrop";
import OrderProgress from "@/components/OrderProgress";

export const dynamic = "force-dynamic";

type Row = { id: string; order_no: number; status: OrderStatus; start_date: string; end_date: string; item_count: number; photo_count: number; parent_order_id?: string | null };

export default async function AccountPage() {
  const me = await getCustomer();
  if (!me) redirect("/?next=/account#account");
  const { data } = await createAdminClient().rpc("customer_orders", { p_customer: me.id });
  const rows = (data ?? []) as Row[];

  const ids = new Set(rows.map((r) => r.id));
  const kids = new Map<string, Row[]>();
  rows.forEach((r) => { if (r.parent_order_id && ids.has(r.parent_order_id)) kids.set(r.parent_order_id, [...(kids.get(r.parent_order_id) ?? []), r]); });
  const roots = rows.filter((r) => !(r.parent_order_id && ids.has(r.parent_order_id)));

  return (
    <div>
      <Backdrop soft />
      <SiteHeader business={BRAND} />
      <main className="mx-auto max-w-2xl space-y-4 px-4 py-6">
        <h1 className="h1">Hi {me.name}</h1>
        <div className="flex gap-3">
          <Link href="/order?tab=tent" className="btn-primary">New request</Link>
        </div>
        <h2 className="font-semibold">My orders</h2>
        {rows.length === 0 && <p className="card text-slate-600">You have no orders yet.</p>}
        <div className="space-y-4">
          {roots.map((root) => [root, ...(kids.get(root.id) ?? [])].map((o) => (
            <div key={o.id} className={o.id === root.id ? "" : "ml-5 border-l-4 border-indigo-200 pl-3"}>
            <Link href={`/account/orders/${o.id}`} className="card block hover:border-emerald-400">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold">Order #{o.order_no}{o.id !== root.id && <span className="ml-2 rounded bg-indigo-100 px-1.5 py-0.5 text-xs font-semibold text-indigo-800">Add-on to #{root.order_no}</span>}</p>
                <StatusBadge status={o.status} label={STATUS_LABEL[o.status]} />
              </div>
              <p className="mb-2 text-sm text-slate-600">{fmtDate(o.start_date)} to {fmtDate(o.end_date)} · {o.item_count} item(s)</p>
              <OrderProgress status={o.status} compact />
              {o.photo_count > 0 && <p className="mt-1 text-xs font-medium text-emerald-700">{o.photo_count} delivery/pickup photo(s)</p>}
            </Link>
            </div>
          )))}
        </div>
      </main>
    </div>
  );
}
