import Link from "next/link";
import StatusBadge, { SourcingBadge } from "@/components/StatusBadge";
import { fmtDate, money, orderTotal } from "@/lib/format";
import type { Order } from "@/lib/types";

export default function OrderCard({ order, short = 0, parentNo }: { order: Order; short?: number; parentNo?: number | null }) {
  const lines = order.order_items ?? [];
  return (
    <Link href={`/admin/orders/${order.id}`} className="card block hover:border-emerald-400">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold">
          #{order.order_no} · {order.customer_name}
          {order.parent_order_id && <span className="ml-2 rounded bg-indigo-100 px-1.5 py-0.5 text-xs font-semibold text-indigo-800">Add-on{parentNo ? ` to #${parentNo}` : ""}</span>}
        </p>
        <div className="flex flex-wrap gap-1">
          <SourcingBadge short={short} />
          <StatusBadge status={order.status} />
        </div>
      </div>
      <p className="mt-1 text-sm text-slate-600">
        {fmtDate(order.start_date)}
        {order.end_date !== order.start_date && ` – ${fmtDate(order.end_date)}`}
      </p>
      <p className="mt-1 truncate text-sm text-slate-500">
        {lines.map((l) => `${l.qty} ${l.items?.name ?? ""}`).join(", ")}
      </p>
      <p className="mt-1 text-sm font-semibold">{money(orderTotal(order))}</p>
    </Link>
  );
}
