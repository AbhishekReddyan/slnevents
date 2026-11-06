import type { OrderStatus } from "@/lib/types";

const STEPS = ["Request received", "Confirmed", "Delivered", "Picked up", "Closed"];
const STEP_OF: Partial<Record<OrderStatus, number>> = {
  pending_approval: 0, confirmed: 1, loaded: 1, delivered: 2, picked_up: 3, returned: 3, closed: 4,
};

/** Step-by-step tracker for an order. `compact` shows a single bar with the current step name. */
export default function OrderProgress({ status, compact = false }: { status: OrderStatus; compact?: boolean }) {
  if (status === "declined" || status === "cancelled") {
    return <p className="text-sm font-medium text-slate-600">This order is {status}. Please call us if you have questions.</p>;
  }
  const step = STEP_OF[status] ?? 0;
  if (compact) {
    return (
      <div>
        <div className="flex gap-1">
          {STEPS.map((s, i) => <span key={s} className={`h-2 flex-1 rounded-full ${i <= step ? "bg-emerald-600" : "bg-slate-200"}`} />)}
        </div>
        <p className="mt-1 text-xs font-medium text-emerald-800">{STEPS[step]}</p>
      </div>
    );
  }
  return (
    <div>
      {STEPS.map((label, i) => {
        const done = i < step || (i === step && status === "closed");
        const now = i === step && status !== "closed";
        return (
          <div key={label} className="flex items-center gap-3 py-1.5 text-sm">
            <span className={`flex h-6 w-6 flex-none items-center justify-center rounded-full text-xs ${done ? "bg-emerald-600 text-white" : now ? "border-2 border-emerald-600 text-emerald-700" : "border border-slate-300 text-slate-400"}`}>
              {done ? "✓" : i + 1}
            </span>
            <span className={now ? "font-semibold" : done ? "text-slate-700" : "text-slate-400"}>{label}</span>
          </div>
        );
      })}
    </div>
  );
}
