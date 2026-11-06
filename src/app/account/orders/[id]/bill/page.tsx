import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { notFound, redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCustomer } from "@/lib/customer-session";
import BillTable, { type BillData } from "@/components/BillTable";
import SiteHeader from "@/components/SiteHeader";
import Backdrop from "@/components/Backdrop";
import PrintButton from "./PrintButton";

export const dynamic = "force-dynamic";

export default async function BillPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getCustomer();
  if (!me) redirect(`/?next=/account/orders/${id}/bill#account`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const { data } = await createAdminClient().rpc("customer_bill", { p_customer: me.id, p_order: id });
  if (!data) {
    return (
      <div>
        <Backdrop soft />
        <SiteHeader business={BRAND} />
        <main className="mx-auto max-w-2xl space-y-3 px-4 py-6">
          <p className="card text-slate-700">The bill is available after you mark the event as completed.</p>
          <Link href={`/account/orders/${id}`} className="btn-secondary">← Back to my order</Link>
        </main>
      </div>
    );
  }
  const b = data as BillData;

  return (
    <div>
      <Backdrop soft />
      <div className="print:hidden"><SiteHeader business={BRAND} /></div>
      <main className="mx-auto max-w-2xl space-y-4 px-4 py-6">
        <div className="flex items-center justify-between gap-2 print:hidden">
          <Link href={`/account/orders/${id}`} className="text-sm text-emerald-700 underline">← My order</Link>
          <PrintButton />
        </div>

        <section className="card space-y-3">
          <h1 className="h1">Bill · Order #{b.order_no}</h1>
          <BillTable b={b} />
        </section>
      </main>
    </div>
  );
}
