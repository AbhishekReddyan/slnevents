import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fmtDateTime } from "@/lib/format";
import type { Alert } from "@/lib/types";
import RealtimeRefresh from "@/components/RealtimeRefresh";
import { markAlertRead, markAllAlertsRead } from "../orders/actions";

const STYLE: Record<string, { label: string; cls: string }> = {
  new_order: { label: "New request", cls: "bg-blue-100 text-blue-800" },
  shortfall: { label: "Needs sourcing", cls: "bg-red-100 text-red-800" },
  delivery: { label: "Delivery", cls: "bg-teal-100 text-teal-800" },
  pickup_issue: { label: "Not all returned", cls: "bg-red-100 text-red-800" },
  pickup_requested: { label: "Pickup requested", cls: "bg-emerald-100 text-emerald-800" },
  order_updated: { label: "Customer added items", cls: "bg-indigo-100 text-indigo-800" },
  worker_edit: { label: "Worker edit", cls: "bg-amber-100 text-amber-800" },
  return_issue: { label: "Return issue", cls: "bg-purple-100 text-purple-800" },
};

export default async function AlertsPage() {
  const sb = await createClient();
  const { data } = await sb.from("alerts").select("*").order("created_at", { ascending: false }).limit(100);
  const alerts = (data ?? []) as Alert[];
  const unread = alerts.filter((a) => !a.read_at).length;

  return (
    <div className="space-y-4">
      <RealtimeRefresh tables={["alerts"]} />
      <div className="flex items-center justify-between">
        <h1 className="h1">Alerts</h1>
        {unread > 0 && (
          <form action={markAllAlertsRead}>
            <button className="btn-secondary">Mark all read</button>
          </form>
        )}
      </div>
      {alerts.length === 0 && <p className="card text-slate-600">No alerts yet.</p>}
      <div className="space-y-2">
        {alerts.map((a) => {
          const s = STYLE[a.type] ?? { label: a.type, cls: "bg-slate-100 text-slate-700" };
          return (
            <div key={a.id} className={`card flex items-start justify-between gap-3 ${a.read_at ? "opacity-60" : ""}`}>
              <div className="min-w-0">
                <span className={`badge ${s.cls}`}>{s.label}</span>
                <p className="mt-1 text-sm">{a.message}</p>
                <p className="mt-1 text-xs text-slate-500">{fmtDateTime(a.created_at)}</p>
                {a.order_id && (
                  <Link href={`/admin/orders/${a.order_id}`} className="mt-1 inline-block text-sm font-semibold text-emerald-700 underline">
                    Open order
                  </Link>
                )}
              </div>
              {!a.read_at && (
                <form action={markAlertRead}>
                  <input type="hidden" name="id" value={a.id} />
                  <button className="text-sm text-slate-600 underline">Dismiss</button>
                </form>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
