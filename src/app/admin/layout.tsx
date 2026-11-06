import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/app/login/actions";
import RealtimeRefresh from "@/components/RealtimeRefresh";
import Backdrop from "@/components/Backdrop";
import Logo from "@/components/Logo";
import { BRAND } from "@/lib/brand";
import { getLogo } from "@/lib/branding";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireRole(["owner"]);
  const sb = await createClient();
  const [{ count }, logo] = await Promise.all([
    sb.from("alerts").select("id", { count: "exact", head: true }).is("read_at", null),
    getLogo(),
  ]);
  const unread = count ?? 0;

  const links = [
    { href: "/admin", label: "Dashboard" },
    { href: "/admin/orders", label: "Orders" },
    { href: "/admin/availability", label: "Availability" },
    { href: "/admin/inventory", label: "Inventory" },
    { href: "/admin/decorations", label: "Decorations" },
    { href: "/admin/outstanding", label: "Not returned" },
    { href: "/admin/alerts", label: "Alerts" },
    { href: "/admin/customers", label: "Customers" },
    { href: "/admin/staff", label: "Staff" },
    { href: "/admin/settings", label: "Settings" },
  ];

  return (
    <div>
      <Backdrop soft />
      <RealtimeRefresh tables={["alerts"]} />
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-2">
          <span className="flex items-center gap-2 font-bold text-emerald-800">
            <Logo src={logo} size={32} />
            {BRAND} · Owner
          </span>
          <form action={logout} className="flex items-center gap-3 text-sm">
            <span className="hidden text-slate-500 sm:inline">{profile.full_name}</span>
            <button className="text-slate-600 underline">Log out</button>
          </form>
        </div>
        <nav className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-3 pb-2 text-sm">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="relative whitespace-nowrap rounded-lg px-3 py-2 font-medium text-slate-700 hover:bg-slate-100"
            >
              {l.label}
              {l.label === "Alerts" && unread > 0 && (
                <span className="ml-1 rounded-full bg-red-600 px-1.5 py-0.5 text-xs font-bold text-white">{unread}</span>
              )}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-5">{children}</main>
    </div>
  );
}
