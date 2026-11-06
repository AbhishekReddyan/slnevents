"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { addDays, daysBetween, money } from "@/lib/format";
import { submitOrder } from "./order-actions";
import { fill, itemName, type Dict, type Lang } from "@/lib/i18n-shared";

export type CatalogItem = {
  id: string;
  name: string;
  name_kn: string | null;
  group_name: string | null;
  group_name_kn: string | null;
  variant_label: string | null;
  variant_label_kn: string | null;
  emoji: string | null;
  photo_url: string | null;
  price_per_day: number | null;
  sort_order: number;
};

export type CatalogDecoration = { id: string; title: string; title_kn: string | null; photo_url: string | null };

type Block = { key: string; title: string; members: CatalogItem[] };

function Thumb({ item, alt }: { item: CatalogItem; alt: string }) {
  return item.photo_url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={item.photo_url} alt={alt} loading="lazy" className="h-16 w-16 flex-none rounded-lg object-cover" />
  ) : (
    <div className="flex h-16 w-16 flex-none items-center justify-center rounded-lg bg-slate-100 text-3xl">{item.emoji ?? ""}</div>
  );
}

export default function OrderForm({
  items, decorations, today, showPrices, lang, t, customer, initialTab,
}: { items: CatalogItem[]; decorations: CatalogDecoration[]; today: string; showPrices: boolean; lang: Lang; t: Dict; customer: { name: string } | null; initialTab: "tent" | "decor" }) {
  const [tab, setTab] = useState<"tent" | "decor">(initialTab);
  const kn = lang === "kn";
  const [qty, setQty] = useState<Record<string, number>>({});
  const [decor, setDecor] = useState<string[]>([]);
  const toggleDecor = (id: string) => setDecor((d) => (d.includes(id) ? d.filter((x) => x !== id) : [...d, id]));
  const [start, setStart] = useState(addDays(today, 1));
  const [end, setEnd] = useState(addDays(today, 1));

  // Items that share a group (e.g. all Annada Patre sizes) are shown together in one card.
  const blocks = useMemo(() => {
    const out: Block[] = [];
    const byGroup = new Map<string, Block>();
    items.forEach((i) => {
      if (i.group_name) {
        let b = byGroup.get(i.group_name);
        if (!b) {
          b = { key: "g:" + i.group_name, title: (kn && i.group_name_kn) || i.group_name, members: [] };
          byGroup.set(i.group_name, b);
          out.push(b);
        }
        b.members.push(i);
      } else {
        out.push({ key: i.id, title: itemName(lang, i), members: [i] });
      }
    });
    return out;
  }, [items, kn, lang]);

  const chosen = items.filter((i) => (qty[i.id] ?? 0) > 0);
  const days = end >= start ? daysBetween(start, end) : 1;
  const estimate = chosen.reduce((s, i) => s + (qty[i.id] ?? 0) * Number(i.price_per_day ?? 0) * days, 0);

  const set = (id: string, n: number) => setQty((q) => ({ ...q, [id]: Math.max(0, Math.min(100000, Math.floor(n) || 0)) }));

  const stepper = (i: CatalogItem, label: string) => (
    <div className="flex flex-none items-center gap-1">
      <button type="button" aria-label={label} onClick={() => set(i.id, (qty[i.id] ?? 0) - 1)} className="btn-secondary !min-h-[40px] !px-3">−</button>
      <input
        type="number" inputMode="numeric" min={0} value={qty[i.id] ?? 0} aria-label={label}
        onChange={(e) => set(i.id, Number(e.target.value))} className="input !min-h-[40px] w-16 text-center"
      />
      <button type="button" aria-label={label} onClick={() => set(i.id, (qty[i.id] ?? 0) + 1)} className="btn-secondary !min-h-[40px] !px-3">+</button>
    </div>
  );

  const priceText = (i: CatalogItem) =>
    showPrices && Number(i.price_per_day ?? 0) > 0 ? <p className="text-sm text-slate-500">{money(i.price_per_day)} {t.perDay}</p> : null;

  return (
    <ActionForm action={submitOrder} className="space-y-6 pb-28">
      <input type="hidden" name="items" value={JSON.stringify(chosen.map((i) => ({ item_id: i.id, qty: qty[i.id] })))} />
      <input type="hidden" name="decorations" value={JSON.stringify(decor)} />
      {/* honeypot */}
      <input name="website" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />

      <section className="card space-y-3">
        <h2 className="font-semibold">{t.step1}</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">{t.startDate}</label>
            <input
              type="date" name="start" required min={today} value={start} className="input"
              onChange={(e) => { setStart(e.target.value); if (end < e.target.value) setEnd(e.target.value); }}
            />
          </div>
          <div>
            <label className="label">{t.endDate}</label>
            <input type="date" name="end" required min={start} value={end} onChange={(e) => setEnd(e.target.value)} className="input" />
          </div>
        </div>
      </section>

      <div className="sticky top-14 z-10 grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1 text-sm font-semibold">
        {([["tent", "Tent House"], ["decor", "Decoration"]] as const).map(([k, label]) => (
          <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)}
            className={`rounded-lg px-3 py-2 ${tab === k ? "bg-white text-emerald-800 shadow-sm" : "text-slate-600"}`}>
            {label}{k === "tent" && chosen.length > 0 ? ` (${chosen.length})` : ""}{k === "decor" && decor.length > 0 ? ` (${decor.length})` : ""}
          </button>
        ))}
      </div>

      <section className={`space-y-3 ${tab === "tent" ? "" : "hidden"}`}>
        <h2 className="font-semibold">{t.step2}</h2>
        <p className="text-sm text-slate-500">Prices are per day. Transport charge will be added later.</p>
        {blocks.map((b) =>
          b.members.length === 1 && !b.members[0].group_name ? (
            <div key={b.key} className="card flex items-center gap-3">
              <Thumb item={b.members[0]} alt={b.title} />
              <div className="min-w-0 flex-1">
                <p className="font-medium leading-tight">{b.title}</p>
                {priceText(b.members[0])}
              </div>
              {stepper(b.members[0], b.title)}
            </div>
          ) : (
            <div key={b.key} className="card space-y-2">
              <div className="flex items-center gap-3">
                <Thumb item={b.members[0]} alt={b.title} />
                <p className="font-semibold leading-tight">{b.title}</p>
              </div>
              <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {b.members.map((m) => (
                  <div key={m.id} className="flex items-center justify-between gap-2 p-2">
                    <div className="min-w-0">
                      <p className="font-medium">{(kn && m.variant_label_kn) || m.variant_label || itemName(lang, m)}</p>
                      {priceText(m)}
                    </div>
                    {stepper(m, itemName(lang, m))}
                  </div>
                ))}
              </div>
            </div>
          )
        )}
        {items.length === 0 && <p className="card text-slate-600">{t.noItems}</p>}
      </section>

      {(
        <section className={`space-y-2 ${tab === "decor" ? "" : "hidden"}`}>
          <h2 className="font-semibold">{t.stepDecor}</h2>
          <p className="text-sm text-slate-600">{t.decorHelp}</p>
          {decorations.length === 0 && <p className="card text-slate-600">No designs have been added yet.</p>}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {decorations.map((d) => {
              const on = decor.includes(d.id);
              return (
                <button
                  key={d.id} type="button" onClick={() => toggleDecor(d.id)} aria-pressed={on}
                  className={`relative overflow-hidden rounded-xl border-2 bg-white text-left ${on ? "border-emerald-600 ring-2 ring-emerald-200" : "border-slate-200"}`}
                >
                  {d.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={d.photo_url} alt="Decoration design" loading="lazy" className="aspect-square w-full object-cover" />
                  ) : (
                    <div className="flex aspect-square w-full items-center justify-center bg-slate-100 text-4xl">💐</div>
                  )}
                  {on && (
                    <span className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-emerald-600 text-white">✓</span>
                  )}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Details are always in English so the owner can read them */}
      <section className="card space-y-3">
        <h2 className="font-semibold">Your details</h2>
        {customer ? (
          <p className="text-sm text-slate-700">Ordering as <b>{customer.name}</b> (details from your account).</p>
        ) : (
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            Please <Link href="/?next=/order#account" className="font-semibold underline">register or log in</Link> to send your request.
            Your selection stays on this page.
          </p>
        )}
        <div>
          <label className="label">Event address</label>
          <textarea name="address" required maxLength={500} rows={3} autoComplete="street-address" className="input" />
        </div>
        <div>
          <label className="label">Anything else we should know? (optional)</label>
          <textarea name="notes" maxLength={1000} rows={2} className="input" />
        </div>
      </section>

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <div className="text-sm">
            <p className="font-semibold">{fill(t.itemsSelected, { n: chosen.length })}</p>
            {decor.length > 0 && <p className="text-slate-500">{fill(t.decorSelected, { n: decor.length })}</p>}
            {showPrices && estimate > 0 && (
              <p className="text-slate-500">{fill(t.estimate, { d: days, amt: money(estimate) })} + transport (added later)</p>
            )}
          </div>
          <SubmitButton disabled={!customer || (chosen.length === 0 && decor.length === 0)}>{t.send}</SubmitButton>
        </div>
      </div>
    </ActionForm>
  );
}
