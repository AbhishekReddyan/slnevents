import Link from "next/link";
import ContactMenu from "@/components/ContactMenu";
import Logo from "@/components/Logo";
import { getLogo } from "@/lib/branding";
import { getCustomer } from "@/lib/customer-session";
import { logoutCustomer } from "@/app/account-actions";

/**
 * Top bar for customer pages. The bar is see-through glass, so the colourful background picture
 * continues behind it. `dark` (home page) uses white text on a dark glass bar; other pages use a light glass bar.
 */
export default async function SiteHeader({ business, showStaff = false, dark = false }: { business: string; showStaff?: boolean; dark?: boolean }) {
  const [logo, me] = await Promise.all([getLogo(), getCustomer()]);
  const bar = dark ? "border-white/20 bg-black/35 text-white" : "border-white/60 bg-white/75 text-slate-700";
  const brand = dark ? "text-white" : "text-emerald-800";
  const link = dark ? "hover:text-emerald-200" : "hover:text-emerald-700";
  const strong = dark ? "text-white" : "text-emerald-800";
  const soft = dark ? "text-white/80" : "text-slate-500";
  return (
    <header className={`sticky top-0 z-20 border-b backdrop-blur-md ${bar}`}>
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className={`flex min-w-0 items-center gap-2 font-bold ${brand}`}>
          <Logo src={logo} size={34} />
          <span className="truncate text-sm sm:text-base">{business}</span>
        </Link>
        <nav className="hidden items-center gap-4 text-sm font-semibold sm:flex">
          {me && (
            <>
              <Link href="/order?tab=tent" className={link}>Tent House</Link>
              <Link href="/order?tab=decor" className={link}>Decoration</Link>
            </>
          )}
        </nav>
        <div className="flex flex-none items-center gap-3 text-sm">
          {me ? (
            <>
              <Link href="/account" className={`font-semibold ${strong}`}>Hi {me.name}</Link>
              <form action={logoutCustomer}><button className={`underline ${soft}`}>Log out</button></form>
            </>
          ) : (
            <Link href="/#account" className={`font-semibold ${strong}`}>Log in</Link>
          )}
          {showStaff && (
            <Link href="/login" className={`rounded-lg border px-3 py-1.5 font-medium ${dark ? "border-white/60 text-white hover:bg-white/10" : "border-slate-300 text-slate-700 hover:border-emerald-500"}`}>
              Staff login
            </Link>
          )}
          <ContactMenu light={dark} />
        </div>
      </div>
    </header>
  );
}
