import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fmtDate } from "@/lib/format";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { resetPin } from "./actions";

type Row = { id: string; name: string; phone: string; created_at: string; order_count: number; last_order_at: string | null; locked: boolean };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const sb = await createClient();
  const { data, error } = await sb.rpc("owner_customers");
  const term = (q ?? "").trim().toLowerCase();
  const rows = ((data ?? []) as Row[]).filter((r) => !term || r.name.toLowerCase().includes(term) || r.phone.includes(term));

  return (
    <div className="space-y-4">
      <h1 className="h1">Customers ({rows.length})</h1>
      <form method="get" className="flex gap-2">
        <input name="q" defaultValue={q ?? ""} placeholder="Search name or mobile number" className="input" />
        <button className="btn-primary">Search</button>
      </form>
      {error && <p className="card text-red-700">Could not load customers: {error.message}. Has migration 013 been run?</p>}
      <div className="space-y-3">
        {rows.map((c) => (
          <div key={c.id} className="card space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-semibold">{c.name} {c.locked && <span className="badge bg-red-100 text-red-800">Locked</span>}</p>
                <p className="text-sm"><a href={`tel:${c.phone}`} className="text-emerald-700 underline">{c.phone}</a></p>
              </div>
              <div className="text-right text-xs text-slate-500">
                <p>Registered {fmtDate(c.created_at.slice(0, 10))}</p>
                <p>{c.order_count} order(s){c.last_order_at ? ` · last ${fmtDate(c.last_order_at.slice(0, 10))}` : ""}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Link href={`/admin/orders?q=${c.phone}&status=all`} className="text-sm text-emerald-700 underline">View orders</Link>
              <ActionForm action={resetPin} className="flex items-center gap-2">
                <input type="hidden" name="id" value={c.id} />
                <input name="pin" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} required placeholder="New PIN" aria-label="New PIN" className="input !w-28" />
                <SubmitButton className="btn-secondary">Reset PIN</SubmitButton>
              </ActionForm>
            </div>
          </div>
        ))}
        {rows.length === 0 && !error && <p className="card text-slate-600">No customers yet.</p>}
      </div>
    </div>
  );
}
