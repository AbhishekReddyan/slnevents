/** Owner-side select string: orders with their lines and prices. */
export const ORDER_SELECT =
  "id, order_no, customer_name, phone, address, notes, start_date, end_date, status, decline_reason, pickup_requested_at, track_token, parent_order_id, created_at, " +
  "order_items(id, order_id, item_id, qty, sourced_qty, delivered_qty, pickup_qty, loaded, returned_qty, damaged_qty, missing_qty, " +
  "items(name, name_kn, photo_url), order_item_prices(price_per_day)), order_prices(discount, transport, decoration_charge), " +
  "order_decorations(decoration_id, decorations(title, title_kn, photo_url))";

/** Worker-side select string: same, with NO price tables (workers cannot read them anyway). */
export const WORKER_ORDER_SELECT =
  "id, order_no, customer_name, phone, address, notes, start_date, end_date, status, pickup_requested_at, created_at, " +
  "order_items(id, order_id, item_id, qty, sourced_qty, delivered_qty, pickup_qty, loaded, returned_qty, damaged_qty, missing_qty, items(name, name_kn, photo_url, group_name)), " +
  "order_decorations(decoration_id, decorations(title, title_kn, photo_url))";
