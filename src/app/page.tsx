import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCustomer } from "@/lib/customer-session";
import { fmtDate } from "@/lib/format";
import { STATUS_LABEL, type OrderStatus } from "@/lib/types";
import SiteHeader from "@/components/SiteHeader";
import Backdrop from "@/components/Backdrop";
import OrderProgress from "@/components/OrderProgress";
import StatusBadge from "@/components/StatusBadge";
import AuthCard from "./AuthCard";

export const dynamic = "force-dynamic";

type Row = { id: string; order_no: number; status: OrderStatus; start_date: string; end_date: string };
const FINISHED = ["closed", "declined", "cancelled"];

/** Landing page. Visitors see a tagline and the register / log in card; logged-in customers see their orders and the Tent House / Decoration options. */
export default async function Landing({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const sp = await searchParams;
  const next = sp.next && sp.next.startsWith("/") && !sp.next.startsWith("//") ? sp.next : "/";
  const sb = await createClient();
  const [{ data: info }, me] = await Promise.all([sb.rpc("public_info"), getCustomer()]);
  const business = (info as { business_name: string }[] | null)?.[0]?.business_name ?? "SLN Tent House";

  let active: Row[] = [];
  if (me) {
    const { data } = await createAdminClient().rpc("customer_orders", { p_customer: me.id });
    active = ((data ?? []) as Row[]).filter((o) => !FINISHED.includes(o.status)).slice(0, 3);
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Backdrop />
      <SiteHeader business={business} showStaff />
      <main className="flex flex-1 items-center">
        <div className="mx-auto grid w-full max-w-4xl gap-8 px-4 py-12 md:grid-cols-2 md:items-center">
          <div className="space-y-3 text-white">
            <h1 className="text-4xl font-bold leading-tight">One stop for every event</h1>
            <p className="text-lg text-white/90">Tents, chairs, tables and flowers. You celebrate, we set it up.</p>
          </div>

          {me ? (
            <div className="space-y-3">
              <p className="text-xl font-semibold text-white">Hi {me.name}</p>
              {active.length > 0 && (
                <section className="card space-y-3">
                  <h2 className="font-semibold">Track your orders</h2>
                  {active.map((o) => (
                    <Link key={o.id} href={`/account/orders/${o.id}`} className="block rounded-lg border border-slate-200 p-3 hover:border-emerald-400">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold">Order #{o.order_no} · {fmtDate(o.start_date)}</p>
                        <StatusBadge status={o.status} label={STATUS_LABEL[o.status]} />
                      </div>
                      <OrderProgress status={o.status} compact />
                    </Link>
                  ))}
                  <Link href="/account" className="block text-sm font-medium text-emerald-700 underline">All my orders and photos</Link>
                </section>
              )}
              <Link href="/order?tab=tent" className="card block hover:border-emerald-400">
                <h2 className="text-lg font-semibold text-emerald-800">Tent House</h2>
                <p className="text-sm text-slate-600">Tents, chairs, tables and more, with prices.</p>
              </Link>
              <Link href="/order?tab=decor" className="card block hover:border-emerald-400">
                <h2 className="text-lg font-semibold text-emerald-800">Decoration</h2>
                <p className="text-sm text-slate-600">Flower decoration designs.</p>
              </Link>
              {active.length === 0 && <Link href="/account" className="block text-center text-sm font-medium text-white underline">My orders and photos</Link>}
            </div>
          ) : (
            <AuthCard next={next} />
          )}
        </div>
      </main>
    </div>
  );
}
