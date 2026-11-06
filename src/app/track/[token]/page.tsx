import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fmtDate } from "@/lib/format";
import { getLang } from "@/lib/i18n";
import { siteOrigin } from "@/lib/site";
import LangSwitch from "@/components/LangSwitch";
import Backdrop from "@/components/Backdrop";
import Logo from "@/components/Logo";
import { BRAND } from "@/lib/brand";
import { getLogo } from "@/lib/branding";
import { requestPickup } from "../actions";

export const dynamic = "force-dynamic";

type PublicOrder = {
  order_no: number; customer_name: string; status: string; start_date: string; end_date: string;
  pickup_requested: boolean;
  items: { name: string; name_kn: string | null; qty: number; delivered: number; pickup: number | null }[];
  decorations: { title: string; title_kn: string | null }[];
};

const STEPS = ["Request received", "Confirmed", "Delivered", "Picked up", "Closed"];
const STEP_OF: Record<string, number> = {
  pending_approval: 0, confirmed: 1, loaded: 1, delivered: 2, picked_up: 3, returned: 3, closed: 4,
};

export default async function TrackPage({
  params, searchParams,
}: { params: Promise<{ token: string }>; searchParams: Promise<{ new?: string; merged?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(token)) notFound();
  const lang = await getLang();
  const kn = lang === "kn";
  const sb = await createClient();
  const { data } = await sb.rpc("public_order", { p_token: token });
  if (!data) notFound();
  const o = data as PublicOrder;

  const closedOut = o.status === "declined" || o.status === "cancelled";
  const step = STEP_OF[o.status] ?? 0;
  const nm = (i: { name: string; name_kn: string | null }) => (kn && i.name_kn ? i.name_kn : i.name);
  const origin = await siteOrigin();
  const url = `${origin}/track/${token}`;
  const summary =
    `${BRAND}, order #${o.order_no} (${fmtDate(o.start_date)} to ${fmtDate(o.end_date)})\n` +
    o.items.map((i) => `${i.qty} × ${nm(i)}`).join("\n") + `\n${url}`;
  const showedDelivered = step >= 2;

  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 py-6">
      <Backdrop soft />
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="mb-2"><Logo src={await getLogo()} size={40} /></div>
          <h1 className="h1">Order #{o.order_no}</h1>
          <p className="text-sm text-slate-600">{fmtDate(o.start_date)} to {fmtDate(o.end_date)}</p>
        </div>
        <LangSwitch lang={lang} />
      </div>

      {sp.new === "1" && (
        <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
          {sp.merged === "1"
            ? `We added your items to your existing request #${o.order_no} for the same dates.`
            : "Request received. It is pending approval. We will call you to confirm the items and the price."}
        </p>
      )}

      {closedOut ? (
        <p className="card text-slate-700">This order is {o.status}. Please call us if you have questions.</p>
      ) : (
        <section className="card">
          {STEPS.map((label, i) => {
            const done = i < step || (i === step && o.status === "closed");
            const now = i === step && o.status !== "closed";
            return (
              <div key={label} className="flex items-center gap-3 py-1.5 text-sm">
                <span className={`flex h-6 w-6 flex-none items-center justify-center rounded-full text-xs ${done ? "bg-emerald-600 text-white" : now ? "border-2 border-emerald-600 text-emerald-700" : "border border-slate-300 text-slate-400"}`}>
                  {done ? "✓" : i + 1}
                </span>
                <span className={now ? "font-semibold" : done ? "text-slate-700" : "text-slate-400"}>{label}</span>
              </div>
            );
          })}
        </section>
      )}

      <section className="card">
        <h2 className="mb-2 font-semibold">Your items</h2>
        <ul className="divide-y divide-slate-100 text-sm">
          {o.items.map((i) => (
            <li key={i.name} className="flex items-center justify-between gap-3 py-2">
              <span>{nm(i)}</span>
              <span className="text-right">
                <b>{i.qty}</b>
                {showedDelivered && (
                  <span className="block text-xs text-slate-500">
                    delivered {i.delivered}
                    {i.qty > i.delivered && <b className="text-amber-700"> · {i.qty - i.delivered} pending</b>}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
        {o.decorations.length > 0 && (
          <p className="mt-2 text-sm text-slate-600">
            Flower decoration: {o.decorations.length} design(s) selected
          </p>
        )}
      </section>

      {o.status === "delivered" && (
        <section className="card space-y-2">
          <h2 className="font-semibold">Is your event over?</h2>
          {o.pickup_requested ? (
            <p className="text-sm text-emerald-800">Thank you. We have been told and will contact you to collect the items.</p>
          ) : (
            <>
              <p className="text-sm text-slate-600">Tap the button and we will come to collect the items. You can also just call us.</p>
              <form action={requestPickup}>
                <input type="hidden" name="token" value={token} />
                <button className="btn-primary w-full">Event is over, please pick up</button>
              </form>
            </>
          )}
        </section>
      )}

      <div className="grid grid-cols-2 gap-3">
        <a href={`https://wa.me/?text=${encodeURIComponent(summary)}`} target="_blank" rel="noreferrer" className="btn-secondary">
          Share on WhatsApp
        </a>
        {!closedOut && o.status !== "closed" && <Link href="/order" className="btn-secondary">Add more items</Link>}
      </div>
      <p className="text-xs text-slate-500">
        To add items to this order, use the order page with the same phone number and the same dates.
      </p>
    </div>
  );
}
