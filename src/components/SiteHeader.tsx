import Link from "next/link";
import ContactMenu from "@/components/ContactMenu";
import Logo from "@/components/Logo";
import { getLogo } from "@/lib/branding";
import { getCustomer } from "@/lib/customer-session";
import { logoutCustomer } from "@/app/account-actions";

/** Top bar for customer pages: business name, Tent House / Decoration links, staff login at the top right. */
export default async function SiteHeader({ business, showStaff = false }: { business: string; showStaff?: boolean }) {
  const [logo, me] = await Promise.all([getLogo(), getCustomer()]);
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-bold text-emerald-800">
          <Logo src={logo} size={34} />
          <span className="hidden sm:inline">{business}</span>
        </Link>
        <nav className="flex items-center gap-4 text-sm font-semibold text-slate-700">
          {me && (
            <>
              <Link href="/order?tab=tent" className="hover:text-emerald-700">Tent House</Link>
              <Link href="/order?tab=decor" className="hover:text-emerald-700">Decoration</Link>
            </>
          )}
        </nav>
        <div className="flex items-center gap-3 text-sm">
          {me ? (
            <>
              <Link href="/account" className="font-semibold text-emerald-800">Hi {me.name}</Link>
              <form action={logoutCustomer}><button className="text-slate-500 underline">Log out</button></form>
            </>
          ) : (
            <Link href="/#account" className="font-semibold text-emerald-800">Log in</Link>
          )}
          {showStaff && (
            <Link href="/login" className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:border-emerald-500">
              Staff login
            </Link>
          )}
          <ContactMenu />
        </div>
      </div>
    </header>
  );
}
