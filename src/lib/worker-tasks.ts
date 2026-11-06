/** Worker task logic for the dashboard. Pure functions, no prices or money anywhere. */

export type DashOrder = {
  id: string;
  order_no: number;
  customer_name: string;
  phone: string;
  address: string;
  start_date: string; // YYYY-MM-DD
  end_date: string;
  parent_no?: number | null;
  status: "confirmed" | "loaded" | "delivered" | "picked_up" | "returned" | "closed";
};

export type TaskKind = "delivery" | "pickup" | "return";

export type Task = {
  kind: TaskKind;
  order: DashOrder;
  due: string;   // date the task belongs to
  done: boolean;
  late: boolean; // not done and due before today
};

export const TASK_ORDER: TaskKind[] = ["delivery", "pickup", "return"];
export const TASK_LABEL: Record<TaskKind, string> = {
  delivery: "Delivery",
  pickup: "Pickup",
  return: "Return check-in",
};

const AFTER_DELIVERY = ["delivered", "picked_up", "returned", "closed"];
const AFTER_PICKUP = ["picked_up", "returned", "closed"];
const AFTER_RETURN = ["returned", "closed"];

/** All tasks that are due today, plus open tasks from earlier days (late). */
export function buildTasks(orders: DashOrder[], today: string): Task[] {
  const out: Task[] = [];
  for (const o of orders) {
    // Delivery: Confirmed/Loaded and start date is today (or earlier = late)
    if (["confirmed", "loaded"].includes(o.status) && o.start_date <= today) {
      out.push({ kind: "delivery", order: o, due: o.start_date, done: false, late: o.start_date < today });
    } else if (AFTER_DELIVERY.includes(o.status) && o.start_date === today) {
      out.push({ kind: "delivery", order: o, due: today, done: true, late: false });
    }

    // Pickup: Delivered and end date is today or earlier
    if (o.status === "delivered" && o.end_date <= today) {
      out.push({ kind: "pickup", order: o, due: o.end_date, done: false, late: o.end_date < today });
    } else if (AFTER_PICKUP.includes(o.status) && o.end_date === today) {
      out.push({ kind: "pickup", order: o, due: today, done: true, late: false });
    }

    // Return check-in: Picked up and not yet Returned. Due on the end date; if the items
    // were picked up early the check-in is due today.
    if (o.status === "picked_up") {
      const due = o.end_date < today ? o.end_date : today;
      out.push({ kind: "return", order: o, due, done: false, late: due < today });
    } else if (AFTER_RETURN.includes(o.status) && o.end_date === today) {
      out.push({ kind: "return", order: o, due: today, done: true, late: false });
    }
  }
  return out;
}

export function summarise(tasks: Task[], orders: DashOrder[], today: string) {
  const todays = tasks.filter((t) => !t.late);
  const late = tasks.filter((t) => t.late);
  const by = (k: TaskKind) => {
    const list = todays.filter((t) => t.kind === k);
    return { total: list.length, done: list.filter((t) => t.done).length };
  };
  const total = todays.length;
  const done = todays.filter((t) => t.done).length;
  const functions = orders.filter((o) => o.start_date <= today && today <= o.end_date).length;
  return { functions, delivery: by("delivery"), pickup: by("pickup"), return: by("return"), total, done, left: total - done, todays, late };
}
