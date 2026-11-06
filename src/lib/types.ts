export type Role = "owner" | "worker" | "none";

export type OrderStatus =
  | "pending_approval"
  | "confirmed"
  | "loaded"
  | "delivered"
  | "picked_up"
  | "returned"
  | "closed"
  | "declined"
  | "cancelled";

export const STATUS_LABEL: Record<OrderStatus, string> = {
  pending_approval: "Pending approval",
  confirmed: "Confirmed",
  loaded: "Loaded",
  delivered: "Delivered",
  picked_up: "Picked up",
  returned: "Returned",
  closed: "Closed",
  declined: "Declined",
  cancelled: "Cancelled",
};

export const STATUS_STYLE: Record<OrderStatus, string> = {
  pending_approval: "bg-amber-100 text-amber-800",
  confirmed: "bg-blue-100 text-blue-800",
  loaded: "bg-indigo-100 text-indigo-800",
  delivered: "bg-teal-100 text-teal-800",
  picked_up: "bg-purple-100 text-purple-800",
  returned: "bg-green-100 text-green-800",
  closed: "bg-slate-200 text-slate-700",
  declined: "bg-red-100 text-red-800",
  cancelled: "bg-slate-200 text-slate-600",
};

export type Profile = { id: string; full_name: string; role: Role };

export type Item = {
  id: string;
  name: string;
  category_id: string | null;
  photo_url: string | null;
  total_qty: number;
  unavailable_qty: number;
  active: boolean;
  group_name: string | null;
  variant_label: string | null;
  emoji: string | null;
  sort_order: number;
  item_prices?: { price_per_day: number } | { price_per_day: number }[] | null;
};

export type OrderLine = {
  id: string;
  order_id: string;
  item_id: string;
  qty: number;
  sourced_qty: number;
  delivered_qty: number;
  pickup_qty: number | null;
  loaded: boolean;
  returned_qty: number | null;
  damaged_qty: number | null;
  missing_qty: number | null;
  items?: { name: string; name_kn?: string | null; photo_url?: string | null; group_name?: string | null } | null;
  order_item_prices?: { price_per_day: number } | { price_per_day: number }[] | null;
};

export type OrderPrices = { discount: number; transport: number; decoration_charge: number; extra_amount?: number; extra_note?: string | null };
export type OrderDecoration = {
  decoration_id: string;
  decorations: { title: string; title_kn: string | null; photo_url: string | null } | null;
};

export type Order = {
  id: string;
  order_no: number;
  customer_name: string;
  phone: string;
  address: string;
  notes: string | null;
  start_date: string;
  end_date: string;
  status: OrderStatus;
  decline_reason: string | null;
  pickup_requested_at: string | null;
  track_token: string;
  parent_order_id?: string | null;
  created_at: string;
  order_items?: OrderLine[];
  order_prices?: OrderPrices | OrderPrices[] | null;
  order_decorations?: OrderDecoration[];
};

export type Alert = {
  id: string;
  type: string;
  order_id: string | null;
  message: string;
  created_at: string;
  read_at: string | null;
};

export type FormState = { error?: string; ok?: string } | null;
