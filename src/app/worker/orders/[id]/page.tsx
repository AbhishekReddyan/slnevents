import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { WORKER_ORDER_SELECT } from "@/lib/queries";
import { fmtDate } from "@/lib/format";
import { dictionaries, fill, getLang, itemName, statusText } from "@/lib/i18n";
import type { Order, OrderStatus } from "@/lib/types";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import StatusBadge from "@/components/StatusBadge";
import RealtimeRefresh from "@/components/RealtimeRefresh";
import ReturnLine from "../../ReturnLine";
import DeliveryForm from "../../DeliveryForm";
import PickupForm from "../../PickupForm";
import { checkIn, setQty, toggleLoaded, workerStatus } from "../../actions";

// Delivered and Picked up are saved from the photo forms below, not from a plain button.
const NEXT: Partial<Record<OrderStatus, { to: OrderStatus; key: "btnLoaded" }>> = {
  confirmed: { to: "loaded", key: "btnLoaded" },
};

export default async function WorkerOrder({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lang = await getLang();
  const t = dictionaries[lang];
  const sb = await createClient();
  const [{ data }, { data: itemData }, { data: photoData }] = await Promise.all([
    sb.from("orders").select(WORKER_ORDER_SELECT).eq("id", id).single(),
    sb.from("items").select("id, name, name_kn").eq("active", true).order("sort_order").order("name"),
    sb.from("order_item_photos").select("order_item_id, kind").eq("order_id", id).eq("recorded", false),
  ]);
  if (!data) notFound();
  const order = data as unknown as Order;
  const lines = order.order_items ?? [];
  const allItems = (itemData ?? []) as { id: string; name: string; name_kn: string | null }[];
  const next = NEXT[order.status];
  const checklist = order.status === "confirmed" || order.status === "loaded";
  const canEditQty = ["confirmed", "loaded", "delivered"].includes(order.status);
  const unticked = lines.filter((l) => !l.loaded).length;
  const needTicks = (order.status === "confirmed" || order.status === "loaded") && unticked > 0;
  const onOrder = new Set(lines.map((l) => l.item_id));
  const newPhotos = (lineId: string, kind: string) =>
    (photoData ?? []).filter((p) => p.order_item_id === lineId && p.kind === kind).length;
  const toDeliver = lines.filter((l) => order.status === "loaded" || l.qty > l.delivered_qty);
  const showDelivery = (order.status === "loaded" || order.status === "delivered") && toDeliver.some((l) => l.qty > l.delivered_qty);
  const pendingTotal = lines.reduce((s, l) => s + Math.max(0, l.qty - l.delivered_qty), 0);

  return (
    <div className="space-y-5">
      <RealtimeRefresh tables={["orders", "order_items"]} />
      <Link href="/worker" className="text-sm text-emerald-700 underline">{t.back}</Link>

      <div className="flex items-center justify-between">
        <h1 className="h1">#{order.order_no} · {order.customer_name}</h1>
        <StatusBadge status={order.status} label={statusText(t, order.status)} />
      </div>

      <section className="card space-y-1 text-sm">
        <a href={`tel:${order.phone}`} className="btn-secondary w-full">{t.call} {order.phone}</a>
        <p className="pt-2">{order.address}</p>
        <a className="font-semibold text-emerald-700 underline" target="_blank" rel="noreferrer"
           href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.address)}`}>{t.openMaps}</a>
        <p className="pt-1 text-slate-600">{t.event}: {fmtDate(order.start_date)} – {fmtDate(order.end_date)}</p>
        {order.notes && <p className="rounded bg-amber-50 p-2 text-amber-900">{t.note}: {order.notes}</p>}
      </section>

      {order.status === "delivered" && order.pickup_requested_at && (
        <p className="rounded-lg bg-emerald-50 p-3 text-sm font-medium text-emerald-900">
          The customer says the event is over and is ready for pickup.
        </p>
      )}

      {/* Flower decoration chosen by the customer */}
      {(order.order_decorations ?? []).length > 0 && (
        <section className="card space-y-2">
          <h2 className="font-semibold">{t.decorations}</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {(order.order_decorations ?? []).map((d) => {
              const title = (lang === "kn" && d.decorations?.title_kn) || d.decorations?.title || "";
              return (
                <div key={d.decoration_id} className="text-center text-xs">
                  {d.decorations?.photo_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={d.decorations.photo_url} alt="Decoration design" className="aspect-square w-full rounded-lg object-cover" />
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Return check-in */}
      {order.status === "picked_up" && (
        <ActionForm action={checkIn} className="space-y-3">
          <h2 className="font-semibold">{t.returnChecklist}</h2>
          <p className="text-sm text-slate-600">{t.returnHelp}</p>
          <input type="hidden" name="id" value={order.id} />
          {lines.map((l) => (
            <ReturnLine key={l.id} id={l.id} name={itemName(lang, l.items)} qty={l.pickup_qty ?? l.qty} sourced={l.sourced_qty} t={t} />
          ))}
          <SubmitButton className="btn-primary w-full !min-h-[52px] text-base">{t.btnReturned}</SubmitButton>
        </ActionForm>
      )}

      {/* Loading checklist / items */}
      {order.status !== "picked_up" && (
        <section className="space-y-2">
          <h2 className="font-semibold">{checklist ? t.loadingChecklist : t.items}</h2>
          {lines.map((l) => (
            <div key={l.id} className="card !p-3">
              <div className="flex items-center gap-3">
                {checklist ? (
                  <form action={toggleLoaded} className="flex-1">
                    <input type="hidden" name="id" value={l.id} />
                    <input type="hidden" name="loaded" value={String(!l.loaded)} />
                    <button className={`flex min-h-[48px] w-full items-center gap-3 rounded-lg px-2 text-left ${l.loaded ? "bg-emerald-50" : ""}`}>
                      <span className={`flex h-7 w-7 flex-none items-center justify-center rounded border-2 text-lg ${l.loaded ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-400"}`}>
                        {l.loaded ? "✓" : ""}
                      </span>
                      <span className={`font-medium ${l.loaded ? "text-slate-500 line-through" : ""}`}>{itemName(lang, l.items)}</span>
                    </button>
                  </form>
                ) : (
                  <p className="flex-1 font-medium">{itemName(lang, l.items)}</p>
                )}
                <span className="text-xl font-bold">× {l.qty}</span>
              </div>
              {l.sourced_qty > 0 && (
                <p className="mt-1 text-xs text-amber-700">{fill(t.fromSupplier, { n: l.sourced_qty })}</p>
              )}
              {canEditQty && (
                <ActionForm action={setQty} className="mt-2 flex items-center gap-2">
                  <input type="hidden" name="order_id" value={order.id} />
                  <input type="hidden" name="item_id" value={l.item_id} />
                  <input name="qty" type="number" inputMode="numeric" min={0} defaultValue={l.qty} aria-label={t.changeQty} className="input !w-24 text-center" />
                  <SubmitButton className="btn-secondary">{t.updateQty}</SubmitButton>
                </ActionForm>
              )}
              {(order.status === "delivered" || order.status === "returned") && (
                <p className="mt-1 text-xs text-slate-500">
                  Delivered {l.delivered_qty} of {l.qty}
                  {l.qty > l.delivered_qty && <b className="text-amber-700"> · {l.qty - l.delivered_qty} pending</b>}
                  {l.pickup_qty != null && ` · picked up ${l.pickup_qty}`}
                </p>
              )}
              {order.status === "returned" && (
                <p className="mt-1 text-xs text-slate-500">
                  {fill(t.returnedLine, { r: l.returned_qty ?? 0, d: l.damaged_qty ?? 0, m: l.missing_qty ?? 0 })}
                </p>
              )}
            </div>
          ))}
        </section>
      )}

      {canEditQty && (
        <ActionForm action={setQty} className="card space-y-2">
          <h2 className="text-sm font-semibold">{t.extraTitle}</h2>
          <input type="hidden" name="order_id" value={order.id} />
          <div className="flex gap-2">
            <select name="item_id" required defaultValue="" className="input">
              <option value="" disabled>{t.chooseItem}</option>
              {allItems.filter((i) => !onOrder.has(i.id)).map((i) => (
                <option key={i.id} value={i.id}>{itemName(lang, i)}</option>
              ))}
            </select>
            <input name="qty" type="number" inputMode="numeric" min={1} defaultValue={1} aria-label={t.items} className="input !w-20 text-center" />
          </div>
          <SubmitButton className="btn-secondary w-full">{t.addToOrder}</SubmitButton>
        </ActionForm>
      )}

      {/* Delivery with photos */}
      {showDelivery && (
        <DeliveryForm
          orderId={order.id}
          title={order.status === "delivered" ? `Pending delivery (${pendingTotal})` : "Deliver the items"}
          lines={toDeliver.filter((l) => l.qty > l.delivered_qty).map((l) => ({
            id: l.id, name: itemName(lang, l.items), ordered: l.qty, delivered: l.delivered_qty, photos: newPhotos(l.id, "delivery"), group: l.items?.group_name ?? null,
          }))}
        />
      )}

      {/* Pickup with photos */}
      {order.status === "delivered" && (
        <PickupForm
          orderId={order.id}
          lines={lines.map((l) => ({ id: l.id, name: itemName(lang, l.items), delivered: l.delivered_qty, photos: newPhotos(l.id, "pickup"), group: l.items?.group_name ?? null }))}
        />
      )}

      {/* Status button */}
      {next && (
        <ActionForm action={workerStatus}>
          <input type="hidden" name="id" value={order.id} />
          <input type="hidden" name="status" value={next.to} />
          <SubmitButton disabled={needTicks} className="btn-primary w-full !min-h-[56px] text-lg">
            {t[next.key]}
          </SubmitButton>
          {needTicks && <p className="mt-1 text-center text-xs text-slate-500">{fill(t.notTicked, { n: unticked })}</p>}
        </ActionForm>
      )}
    </div>
  );
}
