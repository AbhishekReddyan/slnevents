import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/auth";
import { fmtDate, one } from "@/lib/format";
import { outstandingMessage, waLink } from "@/lib/messages";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import RealtimeRefresh from "@/components/RealtimeRefresh";
import { resolveOutstanding } from "./actions";

type Row = {
  id: string; qty: number; reason: "returning_late" | "missing"; note: string | null; created_at: string;
  items: { name: string; name_kn: string | null } | { name: string; name_kn: string | null }[] | null;
  orders: { id: string; order_no: number; customer_name: string; phone: string; end_date: string; status: string }
    | { id: string; order_no: number; customer_name: string; phone: string; end_date: string; status: string }[] | null;
};

export default async function OutstandingPage() {
  const sb = await createClient();
  const settings = await getSettings();
  const { data, error } = await sb
    .from("outstanding_items")
    .select("id, qty, reason, note, created_at, items(name, name_kn), orders(id, order_no, customer_name, phone, end_date, status)")
    .eq("status", "open")
    .order("created_at");
  const rows = (data ?? []) as unknown as Row[];

  return (
    <div className="space-y-4">
      <RealtimeRefresh tables={["orders", "order_items"]} />
      <h1 className="h1">Items not returned ({rows.length})</h1>
      <p className="text-sm text-slate-600">
        Added when a worker picks up fewer items than were delivered. These units stay out of your available stock until
        you mark them received or written off. Check the order in at the godown first.
      </p>
      {error && <p className="card text-red-700">{error.message}</p>}
      {rows.length === 0 && <p className="card text-slate-600">Nothing outstanding.</p>}

      <div className="space-y-3">
        {rows.map((r) => {
          const o = one(r.orders);
          const it = one(r.items);
          const ready = o && ["returned", "closed"].includes(o.status);
          return (
            <div key={r.id} className="card space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">{r.qty} × {it?.name}</p>
                <span className={`badge ${r.reason === "returning_late" ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800"}`}>
                  {r.reason === "returning_late" ? "Returning late" : "Missing"}
                </span>
              </div>
              {o && (
                <p className="text-sm text-slate-600">
                  <Link href={`/admin/orders/${o.id}`} className="font-semibold text-emerald-700 underline">#{o.order_no}</Link>{" "}
                  · {o.customer_name} · <a href={`tel:${o.phone}`} className="underline">{o.phone}</a> · event ended {fmtDate(o.end_date)}
                </p>
              )}
              {r.note && <p className="text-sm text-slate-600">Note: {r.note}</p>}
              <div className="flex flex-wrap gap-2">
                {o && (
                  <a
                    className="btn-secondary" target="_blank" rel="noreferrer"
                    href={waLink(o.phone, outstandingMessage({ business: settings.business_name, orderNo: o.order_no, lines: [{ name: it?.name ?? "", name_kn: it?.name_kn, qty: r.qty }] }))}
                  >
                    WhatsApp reminder
                  </a>
                )}
              </div>
              {ready ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  <ActionForm action={resolveOutstanding} className="flex items-center gap-2">
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="action" value="received" />
                    <input name="qty" type="number" min={1} max={r.qty} defaultValue={r.qty} aria-label="Quantity received" className="input !w-24 text-center" />
                    <SubmitButton className="btn-primary">Received back</SubmitButton>
                  </ActionForm>
                  <ActionForm action={resolveOutstanding}>
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="action" value="lost" />
                    <SubmitButton className="btn-danger w-full">Write off as lost</SubmitButton>
                  </ActionForm>
                </div>
              ) : (
                <p className="text-sm text-amber-800">Check this order in at the godown to continue.</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
