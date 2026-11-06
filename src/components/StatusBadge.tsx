import { STATUS_LABEL, STATUS_STYLE, type OrderStatus } from "@/lib/types";

/** `label` lets customer/worker pages pass the Kannada text; owner pages use the English label. */
export default function StatusBadge({ status, label }: { status: OrderStatus; label?: string }) {
  return <span className={`badge ${STATUS_STYLE[status]}`}>{label ?? STATUS_LABEL[status]}</span>;
}

export function SourcingBadge({ short }: { short: number }) {
  if (!short) return null;
  return <span className="badge bg-red-600 text-white">Needs sourcing · short {short}</span>;
}
