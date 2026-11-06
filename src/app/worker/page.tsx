import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { addDays, fmtDate } from "@/lib/format";
import { STATUS_LABEL } from "@/lib/types";
import StatusBadge from "@/components/StatusBadge";
import RealtimeRefresh from "@/components/RealtimeRefresh";
import { TASK_LABEL, TASK_ORDER, buildTasks, summarise, type DashOrder, type Task, type TaskKind } from "@/lib/worker-tasks";

export const dynamic = "force-dynamic";

const TITLE: Record<TaskKind, string> = { delivery: "Deliveries", pickup: "Pickups", return: "Return check-ins" };
const BAR: Record<TaskKind, string> = { delivery: "bg-blue-600", pickup: "bg-amber-500", return: "bg-purple-600" };

/** Worker home, styled like the owner dashboard. "Today" is the shop date from the database (shop_today()). */
export default async function WorkerHome() {
  const sb = await createClient();
  const { data: dash, error } = await sb.rpc("worker_dashboard");
  if (error || !dash) {
    return <p className="card text-red-700">Could not load today&apos;s work: {error?.message ?? "no data"}. Has migration 010 been run?</p>;
  }
  const { today, orders } = dash as { today: string; orders: DashOrder[] };
  const s = summarise(buildTasks(orders, today), orders, today);
  const upcoming = orders.filter((o) => ["confirmed", "loaded"].includes(o.status) && o.start_date > today);

  return (
    <div className="space-y-6">
      <RealtimeRefresh tables={["orders", "order_items"]} />
      <div>
        <h1 className="h1">Today</h1>
        <p className="text-sm text-slate-600">{fmtDate(today)}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Functions today" value={s.functions} tone="text-blue-700" />
        <Stat label="Tasks done" value={s.done} tone="text-emerald-700" />
        <Stat label="Tasks left" value={s.left} tone="text-amber-700" />
        <Stat label="Late" value={s.late.length} tone="text-red-600" />
      </div>

      <section className="card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">{s.done} of {s.total} tasks complete</h2>
          <span className="text-sm text-slate-500">{s.total === 0 ? 0 : Math.round((s.done / s.total) * 100)}%</span>
        </div>
        <Bar done={s.done} total={s.total} cls="bg-emerald-600" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {TASK_ORDER.map((k) => (
            <div key={k}>
              <div className="mb-1 flex justify-between text-sm"><span>{TITLE[k]}</span><span className="font-semibold">{s[k].done} / {s[k].total}</span></div>
              <Bar done={s[k].done} total={s[k].total} cls={BAR[k]} />
            </div>
          ))}
        </div>
      </section>

      {s.late.length > 0 && (
        <Section title="Late: not done from earlier days" tone="text-red-700">
          {s.late.map((k) => <TaskCard key={k.kind + k.order.id} task={k} />)}
        </Section>
      )}

      {TASK_ORDER.map((kind) => {
        const list = s.todays.filter((k) => k.kind === kind).sort((a, b) => Number(a.done) - Number(b.done));
        return (
          <Section key={kind} title={`${TITLE[kind]} (${list.filter((k) => k.done).length}/${list.length})`}>
            {list.map((k) => <TaskCard key={k.kind + k.order.id} task={k} />)}
            {list.length === 0 && <p className="text-sm text-slate-500">Nothing today.</p>}
          </Section>
        );
      })}

      <div id="coming-up">
        <Section title={`Coming up (${upcoming.length})`}>
          {upcoming.map((o) => (
            <Link key={o.id} href={`/worker/orders/${o.id}`} className="card block hover:border-emerald-400">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">
                  #{o.order_no} · {o.customer_name}
                  {o.parent_no != null && <span className="ml-2 rounded bg-indigo-100 px-1.5 py-0.5 text-xs font-semibold text-indigo-800">Add-on to #{o.parent_no}</span>}
                </p>
                <StatusBadge status={o.status} label={STATUS_LABEL[o.status]} />
              </div>
              <p className="mt-1 text-sm text-slate-600">{o.start_date === addDays(today, 1) ? "Tomorrow" : fmtDate(o.start_date)} · {o.address}</p>
            </Link>
          ))}
          {upcoming.length === 0 && <p className="text-sm text-slate-500">Nothing in the next 7 days.</p>}
        </Section>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="card">
      <p className={`text-3xl font-bold ${tone}`}>{value}</p>
      <p className="text-xs text-slate-600">{label}</p>
    </div>
  );
}

function Bar({ done, total, cls }: { done: number; total: number; cls: string }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-full rounded-full ${cls}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function Section({ title, tone = "", children }: { title: string; tone?: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className={`mb-2 font-semibold ${tone}`}>{title}</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function TaskCard({ task }: { task: Task }) {
  const o = task.order;
  return (
    <div className={`card ${task.late ? "!border-red-300" : ""} ${task.done ? "opacity-60" : ""}`}>
      <Link href={`/worker/orders/${o.id}`} className="block">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-semibold">
            #{o.order_no} · {o.customer_name}
            {o.parent_no != null && <span className="ml-2 rounded bg-indigo-100 px-1.5 py-0.5 text-xs font-semibold text-indigo-800">Add-on to #{o.parent_no}</span>}
          </p>
          <StatusBadge status={o.status} label={STATUS_LABEL[o.status]} />
        </div>
        <p className="mt-1 text-sm font-medium text-emerald-800">{task.done ? "✓ " : ""}{TASK_LABEL[task.kind]}{task.done ? " · done" : ""}</p>
        {o.pickup_requested && !task.done && task.kind === "pickup" && <p className="text-xs font-semibold text-emerald-700">Customer marked the event as completed</p>}
        {task.late && <p className="text-xs font-semibold text-red-600">Was due {fmtDate(task.due)}</p>}
        <p className="mt-1 text-sm text-slate-600">{o.address}</p>
      </Link>
      <a href={`tel:${o.phone}`} className="mt-2 inline-block text-sm font-medium text-emerald-700 underline">{o.phone}</a>
    </div>
  );
}
