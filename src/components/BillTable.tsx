import { fmtDate, money } from "@/lib/format";

export type BillData = {
  order_no: number; customer_name: string; phone: string; address: string; start_date: string; end_date: string; days: number;
  lines: { name: string; qty: number; price_per_day: number }[];
  decoration_count?: number; decoration_charge: number; transport: number; discount: number;
};

/** Itemised bill or approximate bill: items x price per day x days, discount, decoration, transport, total. */
export default function BillTable({ b, estimate = false, showHeader = true }: { b: BillData; estimate?: boolean; showHeader?: boolean }) {
  const rows = b.lines.map((l) => ({ ...l, amount: l.qty * Number(l.price_per_day) * b.days }));
  const itemsTotal = rows.reduce((s, r) => s + r.amount, 0);
  const discount = Number(b.discount);
  const total = Math.max(0, itemsTotal - discount) + Number(b.transport) + Number(b.decoration_charge);
  const pricesMissing = rows.length > 0 && itemsTotal === 0;
  const decorPending = (b.decoration_count ?? 0) > 0 && Number(b.decoration_charge) === 0;

  return (
    <div className="space-y-3">
      {showHeader && (
        <div>
          <p className="text-sm text-slate-600">{b.customer_name} · {b.phone}</p>
          <p className="text-sm text-slate-600">{b.address}</p>
          <p className="text-sm text-slate-600">{fmtDate(b.start_date)} to {fmtDate(b.end_date)} ({b.days} day{b.days > 1 ? "s" : ""})</p>
        </div>
      )}
      <div className="overflow-x-auto">
      <table className="w-full min-w-[20rem] text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
            <th className="py-1">Item</th><th className="py-1 text-right">Qty</th><th className="py-1 text-right">Per day</th><th className="py-1 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-slate-100">
              <td className="py-1.5">{r.name}</td>
              <td className="py-1.5 text-right">{r.qty}</td>
              <td className="py-1.5 text-right">{Number(r.price_per_day) > 0 ? money(r.price_per_day) : "-"}</td>
              <td className="py-1.5 text-right">{Number(r.price_per_day) > 0 ? money(r.amount) : "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      <div className="space-y-1 text-sm">
        <Line label="Items" value={money(itemsTotal)} />
        {discount > 0 && <Line label="Discount" value={`− ${money(discount)}`} />}
        {(b.decoration_count ?? 0) > 0 || Number(b.decoration_charge) > 0 ? (
          <Line label="Flower decoration" value={Number(b.decoration_charge) > 0 ? money(b.decoration_charge) : "Price confirmed by phone"} />
        ) : null}
        <Line label="Transport" value={Number(b.transport) > 0 ? money(b.transport) : "Will be added later"} />
        <div className="flex justify-between border-t border-slate-300 pt-2 text-lg font-bold">
          <span>{estimate ? "Approximate total" : "Total"}</span><span>{money(total)}</span>
        </div>
      </div>
      {pricesMissing && <p className="text-xs text-amber-700">Prices for these items have not been set yet, so the total shows ₹0.</p>}
      {estimate ? (
        <p className="text-xs text-slate-500">
          This is an approximate bill based on what you ordered. Transport{decorPending ? ", decoration" : ""} and any change to your order are added later.
          The final bill is confirmed by the shop.
        </p>
      ) : (
        <p className="text-xs text-slate-500">Prices are confirmed by the shop. Anything not yet added, such as transport, is included once we enter it.</p>
      )}
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between"><span className="text-slate-600">{label}</span><span>{value}</span></div>;
}
