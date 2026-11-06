import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { notFound, redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCustomer } from "@/lib/customer-session";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { getLang } from "@/lib/i18n";
import { itemName } from "@/lib/i18n-shared";
import { STATUS_LABEL, type OrderStatus } from "@/lib/types";
import StatusBadge from "@/components/StatusBadge";
import { completeEvent } from "@/app/account-actions";
import BillTable, { type BillData } from "@/components/BillTable";
import SiteHeader from "@/components/SiteHeader";
import Backdrop from "@/components/Backdrop";
import OrderProgress from "@/components/OrderProgress";

export const dynamic = "force-dynamic";

type Detail = {
  id: string; order_no: number; status: OrderStatus; address: string; start_date: string; end_date: string;
  photos_deleted_at: string | null; completed_at: string | null;
  items: {
    id: string; name: string; name_kn: string | null; qty: number; delivered: number; pickup: number | null;
    photos: { id: string; kind: "delivery" | "pickup"; path: string; created_at: string }[];
  }[];
  decoration_photos: string[];
};

export default async function CustomerOrder({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<{ new?: string; merged?: string; done?: string; addon?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const me = await getCustomer();
  if (!me) redirect(`/?next=/account/orders/${id}#account`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const admin = createAdminClient();
  // The database returns the order only if it belongs to this customer.
  const [{ data }, { data: est }] = await Promise.all([
    admin.rpc("customer_order_detail", { p_customer: me.id, p_order: id }),
    admin.rpc("customer_estimate", { p_customer: me.id, p_order: id }),
  ]);
  if (!data) notFound();
  const o = data as Detail;
  const lang = await getLang();

  const paths = o.items.flatMap((i) => i.photos.map((p) => p.path));
  const signed = paths.length ? (await admin.storage.from("proof-photos").createSignedUrls(paths, 3600)).data ?? [] : [];
  const urlByPath = new Map(signed.map((s) => [s.path, s.signedUrl]));
  const delivered = o.items.some((i) => i.delivered > 0);

  return (
    <div>
      <Backdrop soft />
      <SiteHeader business={BRAND} />
      <main className="mx-auto max-w-2xl space-y-4 px-4 py-6">
        <Link href="/account" className="text-sm text-emerald-700 underline">← My orders</Link>
        <div className="flex items-center justify-between gap-2">
          <h1 className="h1">Order #{o.order_no}</h1>
          <StatusBadge status={o.status} label={STATUS_LABEL[o.status]} />
        </div>
        <p className="text-sm text-slate-600">{fmtDate(o.start_date)} to {fmtDate(o.end_date)} · {o.address}</p>

        {sp.new === "1" && (
          <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
            {/^\d+$/.test(sp.addon ?? "")
              ? `Your request was added as an add-on to your Order #${sp.addon}.`
              : sp.merged === "1"
              ? `We added your items to your existing request #${o.order_no} for the same dates.`
              : "Request received. It is pending approval. We will call you to confirm the items and the price."}
          </p>
        )}

        <section className="card">
          <h2 className="mb-1 font-semibold">Order status</h2>
          <OrderProgress status={o.status} />
        </section>

        {o.status === "delivered" && !o.completed_at && (
          <section className="card space-y-2 border-emerald-300">
            <h2 className="font-semibold">Is your event over?</h2>
            <p className="text-sm text-slate-600">Tap the button when your function is finished. We will come to collect the items, and your bill will be ready to view.</p>
            <form action={completeEvent}>
              <input type="hidden" name="id" value={o.id} />
              <button className="btn-primary w-full">Mark event as completed</button>
            </form>
          </section>
        )}
        {(o.completed_at || ["picked_up", "returned", "closed"].includes(o.status)) && (
          <section className="card space-y-2 border-emerald-300 bg-emerald-50">
            {sp.done === "1" && <p className="text-sm font-medium text-emerald-900">Thank you. We have been told and will contact you to collect the items.</p>}
            {o.completed_at && sp.done !== "1" && <p className="text-sm text-emerald-900">Event marked as completed on {fmtDate(o.completed_at.slice(0, 10))}.</p>}
            <Link href={`/account/orders/${o.id}/bill`} className="btn-primary w-full">View bill</Link>
          </section>
        )}

        <section className="card space-y-4">
          <h2 className="font-semibold">Your items</h2>
          {o.items.map((i) => {
            const pending = Math.max(0, i.qty - i.delivered);
            return (
              <div key={i.id} className="border-t border-slate-100 pt-3 first:border-0 first:pt-0">
                <p className="text-sm">
                  <b>{itemName(lang, i)}</b> · ordered {i.qty}
                  {delivered && <> · delivered <b>{i.delivered}</b></>}
                  {delivered && pending > 0 && <b className="text-amber-700"> · {pending} pending</b>}
                  {i.pickup != null && <> · picked up {i.pickup}</>}
                </p>
                {i.photos.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {i.photos.map((p) => {
                      const src = urlByPath.get(p.path);
                      return src ? (
                        <a key={p.id} href={src} target="_blank" rel="noreferrer" className="block text-center text-[11px] text-slate-500">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={src} alt={`${p.kind} photo`} className="h-24 w-24 rounded-lg object-cover" />
                          {p.kind === "delivery" ? "Delivered" : "Picked up"} · {fmtDateTime(p.created_at)}
                        </a>
                      ) : null;
                    })}
                  </div>
                )}
              </div>
            );
          })}
          {o.items.length === 0 && <p className="text-sm text-slate-500">No tent house items on this order.</p>}
          {o.photos_deleted_at && (
            <p className="rounded-lg bg-slate-100 p-2 text-xs text-slate-600">Delivery photos are removed a few days after the event to save storage.</p>
          )}
          {!o.photos_deleted_at && delivered && o.items.every((i) => i.photos.length === 0) && (
            <p className="text-xs text-slate-500">Photos will appear here once our team uploads them.</p>
          )}
        </section>

        {est && (
          <section className="card space-y-2">
            <h2 className="font-semibold">Approximate bill</h2>
            <BillTable b={est as BillData} estimate showHeader={false} />
          </section>
        )}

        {o.decoration_photos.length > 0 && (
          <section className="card">
            <h2 className="mb-2 font-semibold">Flower decoration</h2>
            <div className="grid grid-cols-3 gap-2">
              {o.decoration_photos.map((u) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={u} src={u} alt="Decoration design" className="aspect-square w-full rounded-lg object-cover" />
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
