import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ORDER_SELECT } from "@/lib/queries";
import { dateIn, daysBetween, fmtDate, fmtDateTime, money, one, orderTotal } from "@/lib/format";
import type { Order, OrderStatus } from "@/lib/types";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import StatusBadge from "@/components/StatusBadge";
import RealtimeRefresh from "@/components/RealtimeRefresh";
import { getSettings } from "@/lib/auth";
import { siteOrigin } from "@/lib/site";
import { confirmedMessage, deliveryMessage, outstandingMessage, pickupMessage } from "@/lib/messages";
import WhatsAppSend from "@/components/WhatsAppSend";
import DeletePhotosButton from "./DeletePhotosButton";
import { setTransport } from "./transport-actions";
import { addSourcing, changeStatus, removeSourcing, saveOrder, setDecorations } from "../actions";

type Short = { item_id: string; item_name: string; qty: number; sourced: number; shortage: number };
type Event = { id: string; actor_name: string | null; actor_role: string | null; summary: string; created_at: string };
type Photo = { id: string; order_item_id: string; kind: "delivery" | "pickup"; path: string; created_at: string };
type Outstanding = {
  id: string; resolved_at?: string | null; qty: number; reason: "returning_late" | "missing"; note: string | null; status: string;
  items: { name: string; name_kn: string | null } | { name: string; name_kn: string | null }[] | null;
};
type Sourcing = { id: string; supplier: string; qty: number; cost: number; items: { name: string } | { name: string }[] | null };

const EDITABLE: OrderStatus[] = ["pending_approval", "confirmed", "loaded", "delivered"];

export default async function OrderDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await createClient();
  const [{ data: orderData, error: orderError }, { data: eventData }, { data: srcData }, { data: shortData }, { data: itemData }, { data: decorData }] =
    await Promise.all([
      sb.from("orders").select(ORDER_SELECT).eq("id", id).single(),
      sb.from("order_events").select("id, actor_name, actor_role, summary, created_at").eq("order_id", id).order("created_at", { ascending: false }),
      sb.from("sourcing_records").select("id, supplier, qty, cost, items(name)").eq("order_id", id).order("created_at"),
      sb.rpc("get_order_shortfall", { p_order: id }),
      sb.from("items").select("id, name, item_prices(price_per_day)").eq("active", true).order("sort_order").order("name"),
      sb.from("decorations").select("id, title, photo_url").eq("active", true).order("sort_order"),
    ]);
  if (orderError) return <p className="card text-red-700">Could not load this order: {orderError.message}</p>;
  if (!orderData) notFound();

  const order = orderData as unknown as Order;
  const events = (eventData ?? []) as Event[];
  const sourcing = (srcData ?? []) as unknown as Sourcing[];
  const shortages = ((shortData ?? []) as Short[]).filter((s) => s.shortage > 0);
  const catalog = (itemData ?? []) as unknown as { id: string; name: string; item_prices: { price_per_day: number } | { price_per_day: number }[] | null }[];
  const allDecor = (decorData ?? []) as { id: string; title: string; photo_url: string | null }[];
  const pickedDecor = new Set((order.order_decorations ?? []).map((d) => d.decoration_id));
  const decorCharge = Number(one(order.order_prices)?.decoration_charge ?? 0);
  // other orders from the same customer (matched on the last 10 digits of the phone number)
  const phoneKey = order.phone.replace(/\D/g, "").slice(-10);
  const { data: otherData } = phoneKey.length >= 6
    ? await sb.from("orders").select("id, order_no, status, start_date, end_date").ilike("phone", `%${phoneKey}%`).neq("id", order.id).order("start_date", { ascending: false }).limit(10)
    : { data: [] as never[] };
  const others = (otherData ?? []) as unknown as Pick<Order, "id" | "order_no" | "status" | "start_date" | "end_date">[];
  // add-on orders: the order this one belongs to, and the add-ons stacked under it
  const [{ data: parentData }, { data: kidData }] = await Promise.all([
    order.parent_order_id ? sb.from("orders").select("id, order_no").eq("id", order.parent_order_id).maybeSingle() : Promise.resolve({ data: null }),
    sb.from("orders").select(ORDER_SELECT).eq("parent_order_id", order.id).order("created_at"),
  ]);
  const parent = parentData as { id: string; order_no: number } | null;
  const addOns = (kidData ?? []) as unknown as Order[];
  const lineByItem = new Map((order.order_items ?? []).map((l) => [l.item_id, l]));
  const days = daysBetween(order.start_date, order.end_date);
  const discount = Number(one(order.order_prices)?.discount ?? 0);
  const transport = Number(one(order.order_prices)?.transport ?? 0);
  const sourcingCost = sourcing.reduce((s, r) => s + Number(r.cost), 0);
  const editable = EDITABLE.includes(order.status);
  const workerView = ["confirmed", "loaded", "delivered", "picked_up"].includes(order.status);

  // delivery / pickup photos (private bucket, so each one gets a temporary link)
  const [{ data: photoData }, { data: outData }, settings, { data: deleteOn }, { data: delInfo }] = await Promise.all([
    sb.from("order_item_photos").select("id, order_item_id, kind, path, created_at").eq("order_id", id).order("created_at"),
    sb.from("outstanding_items").select("id, qty, reason, note, status, resolved_at, items(name, name_kn)").eq("order_id", id).order("created_at"),
    getSettings(),
    sb.rpc("photo_delete_on", { p_order: id }),
    sb.from("orders").select("photos_deleted_at, photos_deleted_by").eq("id", id).single(),
  ]);
  const photosGone = (delInfo as { photos_deleted_at: string | null; photos_deleted_by: string | null } | null) ?? null;
  const photos = (photoData ?? []) as Photo[];
  const outstanding = ((outData ?? []) as unknown as Outstanding[]).filter((o) => o.status === "open");
  const signed = photos.length ? (await sb.storage.from("proof-photos").createSignedUrls(photos.map((p) => p.path), 3600)).data ?? [] : [];
  const urlByPath = new Map(signed.map((s) => [s.path, s.signedUrl]));
  const lines = order.order_items ?? [];
  const showDelivery = lines.some((l) => l.delivered_qty > 0) || photos.length > 0;

  // ready-to-send WhatsApp messages (English + Kannada)
  const trackUrl = `${await siteOrigin()}/track/${order.track_token}`;
  const msgItems = lines.map((l) => ({ name: l.items?.name ?? "", name_kn: l.items?.name_kn, qty: l.qty }));
  const pendingItems = lines
    .filter((l) => l.qty > l.delivered_qty)
    .map((l) => ({ name: l.items?.name ?? "", name_kn: l.items?.name_kn, qty: l.qty - l.delivered_qty }));
  const ctx = { business: settings.business_name, orderNo: order.order_no, start: order.start_date, end: order.end_date, trackUrl, items: msgItems };
  const outstandingLines = outstanding.map((o) => ({ name: one(o.items)?.name ?? "", name_kn: one(o.items)?.name_kn, qty: o.qty }));

  return (
    <div className="space-y-5">
      <RealtimeRefresh tables={["orders", "order_items", "items"]} />
      <Link href="/admin/orders" className="text-sm text-emerald-700 underline">← Orders</Link>

      {parent && (
        <p className="rounded-lg bg-indigo-50 px-3 py-2 text-sm text-indigo-900">
          This is an add-on to <Link href={`/admin/orders/${parent.id}`} className="font-semibold underline">Order #{parent.order_no}</Link> (same customer, same dates).
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="h1">Order #{order.order_no}</h1>
        <StatusBadge status={order.status} />
      </div>
      {order.decline_reason && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">Declined: {order.decline_reason}</p>}

      {/* Shortfall */}
      {shortages.length > 0 && (
        <section className="card border-red-300 bg-red-50 space-y-3">
          <h2 className="font-semibold text-red-800">Needs sourcing</h2>
          {shortages.map((s) => (
            <div key={s.item_id} className="rounded-lg bg-white p-3">
              <p className="text-sm">
                <b>{s.item_name}</b>: ordered {s.qty}, short by <b className="text-red-600">{s.shortage}</b>
                {s.sourced > 0 && <span className="text-slate-500"> (already sourced {s.sourced})</span>}
              </p>
              <ActionForm action={addSourcing} className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
                <input type="hidden" name="order_id" value={order.id} />
                <input type="hidden" name="item_id" value={s.item_id} />
                <input name="supplier" required placeholder="Supplier" className="input col-span-2" />
                <input name="qty" type="number" min={1} required defaultValue={s.shortage} aria-label="Quantity" className="input" />
                <input name="cost" type="number" min={0} step="0.01" placeholder="Cost ₹" aria-label="Cost" className="input" />
                <SubmitButton className="btn-primary col-span-2 sm:col-span-1">Record</SubmitButton>
              </ActionForm>
            </div>
          ))}
          <p className="text-xs text-red-800">Recording the extra stock clears this flag once the shortage is covered.</p>
        </section>
      )}

      {sourcing.length > 0 && (
        <section className="card">
          <h2 className="mb-2 font-semibold">Sourced from outside suppliers</h2>
          <ul className="divide-y divide-slate-100 text-sm">
            {sourcing.map((r) => (
              <li key={r.id} className="flex items-center justify-between py-2">
                <span>
                  {r.qty} × {one(r.items)?.name} from <b>{r.supplier}</b> · {money(Number(r.cost))}
                </span>
                <form action={removeSourcing}>
                  <input type="hidden" name="id" value={r.id} />
                  <button className="text-red-600 underline">Remove</button>
                </form>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-500">These units return to the supplier, not to your stock. Total cost {money(sourcingCost)}.</p>
        </section>
      )}

      {/* Status actions */}
      <section className="card space-y-3">
        <h2 className="font-semibold">Actions</h2>
        <div className="flex flex-wrap gap-2">
          {order.status === "pending_approval" && (
            <>
              <StatusButton id={order.id} to="confirmed" label="Approve" cls="btn-primary" />
              <StatusButton id={order.id} to="cancelled" label="Cancel" cls="btn-secondary" />
            </>
          )}
          {order.status === "confirmed" && <StatusButton id={order.id} to="loaded" label="Mark loaded" cls="btn-secondary" />}
          {order.status === "loaded" && <StatusButton id={order.id} to="delivered" label="Mark delivered" cls="btn-secondary" />}
          {order.status === "delivered" && <StatusButton id={order.id} to="picked_up" label="Mark picked up" cls="btn-secondary" />}
          {order.status === "picked_up" && (
            <Link href={`/worker/orders/${order.id}`} className="btn-primary">Check in return</Link>
          )}
          {order.status === "returned" && <StatusButton id={order.id} to="closed" label="Close order" cls="btn-primary" />}
          {["confirmed", "loaded"].includes(order.status) && <StatusButton id={order.id} to="cancelled" label="Cancel order" cls="btn-danger" />}
          {workerView && <Link href={`/worker/orders/${order.id}`} className="btn-secondary">Open worker view</Link>}
        </div>
        {order.status === "pending_approval" && (
          <ActionForm action={changeStatus} className="flex gap-2">
            <input type="hidden" name="id" value={order.id} />
            <input type="hidden" name="status" value="declined" />
            <input name="reason" placeholder="Reason for declining (optional)" className="input" />
            <SubmitButton className="btn-danger">Decline</SubmitButton>
          </ActionForm>
        )}
      </section>

      {order.pickup_requested_at && order.status === "delivered" && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-900">
          Customer says the event is over and is ready for pickup ({fmtDateTime(order.pickup_requested_at)}).
        </p>
      )}

      {/* Items not returned */}
      {outstanding.length > 0 && (
        <section className="card border-amber-300 bg-amber-50 space-y-2">
          <h2 className="font-semibold text-amber-900">Not returned yet</h2>
          <ul className="text-sm">
            {outstanding.map((o) => (
              <li key={o.id}>
                {o.qty} × {one(o.items)?.name} ·{" "}
                <b>{o.reason === "returning_late" ? "returning late" : "missing"}</b>
                {o.note && ` · ${o.note}`}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/outstanding" className="btn-secondary">Manage</Link>
          </div>
        </section>
      )}

      {/* Message the customer */}
      {!["declined", "cancelled", "pending_approval"].includes(order.status) && (
        <section className="card space-y-2">
          <h2 className="font-semibold">Message the customer</h2>
          <p className="text-xs text-slate-500">Opens WhatsApp with the message ready, in English and Kannada. You press send.</p>
          <WhatsAppSend
            defaultPhone={order.phone}
            messages={[
              { label: "Order confirmed", text: confirmedMessage(ctx) },
              ...(showDelivery ? [{ label: "Delivery update", text: deliveryMessage({ ...ctx, pending: pendingItems }) }] : []),
              { label: "Pickup", text: pickupMessage(ctx) },
              ...(outstanding.length > 0
                ? [{ label: "Not-returned reminder", text: outstandingMessage({ business: settings.business_name, orderNo: order.order_no, lines: outstandingLines }) }]
                : []),
            ]}
          />
        </section>
      )}

      {/* Delivery and pickup proof */}
      {showDelivery && (
        <section className="card space-y-3">
          <h2 className="font-semibold">Delivery and pickup</h2>
          {photosGone?.photos_deleted_at && photos.length === 0 ? (
            <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">
              Photos were deleted {photosGone.photos_deleted_by === "owner" ? "by the owner" : "automatically"} on {fmtDate(dateIn(photosGone.photos_deleted_at, settings.timezone))}.
            </p>
          ) : photos.length > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
              <p className="text-xs text-slate-600">
                {deleteOn
                  ? `Photos will be deleted on ${fmtDate(deleteOn as string)}.`
                  : outstanding.length > 0
                    ? "Photos are kept while items are not returned."
                    : "Photos are scheduled for deletion once the order is picked up."}
              </p>
              <DeletePhotosButton orderId={order.id} />
            </div>
          ) : null}
          {lines.map((l) => {
            const lp = photos.filter((p) => p.order_item_id === l.id);
            const pending = Math.max(0, l.qty - l.delivered_qty);
            return (
              <div key={l.id} className="border-t border-slate-100 pt-2 first:border-0 first:pt-0">
                <p className="text-sm">
                  <b>{l.items?.name}</b> · ordered {l.qty} · delivered {l.delivered_qty}
                  {pending > 0 && <b className="text-amber-700"> · {pending} pending</b>}
                  {l.pickup_qty != null && <> · picked up {l.pickup_qty}</>}
                  {l.pickup_qty != null && l.pickup_qty < l.delivered_qty && <b className="text-red-600"> · {l.delivered_qty - l.pickup_qty} not returned</b>}
                </p>
                {lp.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-2">
                    {lp.map((p) => {
                      const src = urlByPath.get(p.path);
                      return src ? (
                        <a key={p.id} href={src} target="_blank" rel="noreferrer" className="block text-center text-[11px] text-slate-500">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={src} alt={`${p.kind} photo`} className="h-20 w-20 rounded-lg object-cover" />
                          {p.kind} · {fmtDateTime(p.created_at)}
                        </a>
                      ) : null;
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </section>
      )}

      {/* Summary */}
      <section className="card text-sm">
        <p className="font-semibold">{order.customer_name}</p>
        <p><a className="text-emerald-700 underline" href={`tel:${order.phone}`}>{order.phone}</a></p>
        <p className="text-slate-600">{order.address}</p>
        <p className="mt-2">
          {fmtDate(order.start_date)} – {fmtDate(order.end_date)} ({days} day{days > 1 ? "s" : ""})
        </p>
        <p className="mt-1 text-lg font-bold">{money(orderTotal(order))}</p>
        {(discount > 0 || transport > 0 || decorCharge > 0) && (
          <p className="text-xs text-slate-500">
            includes transport {money(transport)}{decorCharge > 0 && `, decoration ${money(decorCharge)}`}
            {discount > 0 && `, after discount of ${money(discount)}`}
          </p>
        )}
      </section>

      {/* Other orders from the same customer */}
      {others.length > 0 && (
        <section className="card">
          <h2 className="mb-2 font-semibold">Other orders from this customer</h2>
          <ul className="space-y-1 text-sm">
            {others.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-2">
                <Link href={`/admin/orders/${o.id}`} className="text-emerald-700 underline">#{o.order_no} · {fmtDate(o.start_date)} – {fmtDate(o.end_date)}</Link>
                <StatusBadge status={o.status} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Transport charge (separate from editing the order) */}
      {!["declined", "cancelled"].includes(order.status) && (
        <ActionForm action={setTransport} className="card space-y-2">
          <h2 className="font-semibold">Transport charge</h2>
          <input type="hidden" name="id" value={order.id} />
          <div className="flex gap-2">
            <input name="transport" type="number" min={0} step="0.01" defaultValue={transport} aria-label="Transport charge" className="input" />
            <SubmitButton className="btn-primary">Save</SubmitButton>
          </div>
          <p className="text-xs text-slate-500">Enter this last, once the distance is known. The customer sees it on their bill.</p>
        </ActionForm>
      )}

      {/* Add-on orders from the same customer, stacked under this order */}
      {addOns.length > 0 && (
        <section className="card space-y-2">
          <h2 className="font-semibold">Add-on orders ({addOns.length})</h2>
          <ul className="space-y-2">
            {addOns.map((a) => (
              <li key={a.id} className="rounded-lg border-l-4 border-indigo-200 bg-slate-50 p-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <Link href={`/admin/orders/${a.id}`} className="font-semibold text-emerald-700 underline">#{a.order_no}</Link>
                  <StatusBadge status={a.status} />
                </div>
                <p className="text-slate-600">{(a.order_items ?? []).map((l) => `${l.qty} ${l.items?.name ?? ""}`).join(", ")}</p>
                <p className="font-semibold">{money(orderTotal(a))}</p>
              </li>
            ))}
          </ul>
          <p className="text-sm font-semibold">Total with add-ons: {money(orderTotal(order) + addOns.reduce((s, a) => s + orderTotal(a), 0))}</p>
        </section>
      )}

      {/* Flower decoration */}
      {(allDecor.length > 0 || pickedDecor.size > 0) && (
        editable ? (
          <ActionForm action={setDecorations} className="card space-y-3">
            <h2 className="font-semibold">Flower decoration</h2>
            <input type="hidden" name="id" value={order.id} />
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {allDecor.map((d) => (
                <label key={d.id} className="block cursor-pointer text-center text-xs">
                  {d.photo_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={d.photo_url} alt="Decoration design" className="aspect-square w-full rounded-lg object-cover" />
                  )}
                  <span className="mt-1 flex items-center justify-center gap-1">
                    <input type="checkbox" name="decoration" value={d.id} defaultChecked={pickedDecor.has(d.id)} className="h-4 w-4" />
                  </span>
                </label>
              ))}
            </div>
            <div>
              <label className="label">Decoration charge (₹)</label>
              <input name="decoration_charge" type="number" min={0} step="0.01" defaultValue={decorCharge} className="input" />
            </div>
            <SubmitButton className="btn-secondary w-full">Save decoration</SubmitButton>
          </ActionForm>
        ) : null
      )}

      {/* Edit */}
      {editable ? (
        <ActionForm action={saveOrder} className="card space-y-4">
          <h2 className="font-semibold">Edit order</h2>
          <input type="hidden" name="id" value={order.id} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div><label className="label">Customer name</label><input name="customer_name" required defaultValue={order.customer_name} className="input" /></div>
            <div><label className="label">Phone</label><input name="phone" required defaultValue={order.phone} className="input" /></div>
          </div>
          <div><label className="label">Address</label><textarea name="address" required rows={2} defaultValue={order.address} className="input" /></div>
          <div><label className="label">Notes</label><textarea name="notes" rows={2} defaultValue={order.notes ?? ""} className="input" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Start date</label><input type="date" name="start_date" required defaultValue={order.start_date} className="input" /></div>
            <div><label className="label">End date</label><input type="date" name="end_date" required defaultValue={order.end_date} className="input" /></div>
          </div>

          <div>
            <p className="label">Items (quantity 0 removes an item)</p>
            <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {catalog.map((c) => {
                const line = lineByItem.get(c.id);
                const price = one(line?.order_item_prices)?.price_per_day ?? one(c.item_prices)?.price_per_day ?? 0;
                return (
                  <div key={c.id} className="flex items-center gap-2 p-2">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{c.name}</span>
                    <input name={`qty_${c.id}`} type="number" min={0} defaultValue={line?.qty ?? 0} aria-label={`${c.name} quantity`} className="input !w-20 text-center" />
                    <input name={`price_${c.id}`} type="number" min={0} step="0.01" defaultValue={Number(price)} aria-label={`${c.name} price per day`} className="input !w-24" />
                  </div>
                );
              })}
            </div>
            <p className="mt-1 text-xs text-slate-500">Left box: quantity. Right box: price per day (₹) for this order.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input type="hidden" name="transport" value={transport} />
            <div><label className="label">Discount (₹, total)</label><input name="discount" type="number" min={0} step="0.01" defaultValue={discount} className="input" /></div>
          </div>
          <SubmitButton className="btn-primary w-full">Save changes</SubmitButton>
        </ActionForm>
      ) : (
        <section className="card">
          <h2 className="mb-2 font-semibold">Items</h2>
          <ul className="text-sm">
            {(order.order_items ?? []).map((l) => (
              <li key={l.id}>{l.qty} × {l.items?.name} {l.damaged_qty ? `· ${l.damaged_qty} damaged` : ""} {l.missing_qty ? `· ${l.missing_qty} missing` : ""}</li>
            ))}
          </ul>
        </section>
      )}

      {/* History */}
      <section className="card">
        <h2 className="mb-2 font-semibold">History</h2>
        <ul className="space-y-2 text-sm">
          {events.map((e) => (
            <li key={e.id} className="border-l-2 border-slate-200 pl-3">
              <p>{e.summary}</p>
              <p className="text-xs text-slate-500">
                {e.actor_name}{e.actor_role ? ` (${e.actor_role})` : ""} · {fmtDateTime(e.created_at)}
              </p>
            </li>
          ))}
          {events.length === 0 && <li className="text-slate-500">No history yet.</li>}
        </ul>
      </section>
    </div>
  );
}

function StatusButton({ id, to, label, cls }: { id: string; to: OrderStatus; label: string; cls: string }) {
  return (
    <ActionForm action={changeStatus}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={to} />
      <SubmitButton className={cls}>{label}</SubmitButton>
    </ActionForm>
  );
}
