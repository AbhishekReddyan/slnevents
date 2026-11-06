import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { dictionaries, getLang } from "@/lib/i18n";
import { logout } from "@/app/login/actions";
import LangSwitch from "@/components/LangSwitch";
import Backdrop from "@/components/Backdrop";
import Logo from "@/components/Logo";
import { getLogo } from "@/lib/branding";

export const dynamic = "force-dynamic";

/** Same look as the owner pages: title bar, tab row, white cards. */
export default async function WorkerLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireRole(["worker", "owner"]);
  const lang = await getLang();
  const t = dictionaries[lang];
  const logo = await getLogo();
  return (
    <div>
      <Backdrop soft />
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-2">
          <span className="flex items-center gap-2 font-bold text-emerald-800">
            <Logo src={logo} size={32} />
            SLN Tent House · Worker
          </span>
          <div className="flex items-center gap-3 text-sm">
            <LangSwitch lang={lang} />
            <span className="hidden text-slate-500 sm:inline">{profile.full_name}</span>
            {profile.role === "owner" && <Link href="/admin" className="text-emerald-700 underline">{t.admin}</Link>}
            <form action={logout}><button className="text-slate-600 underline">{t.logout}</button></form>
          </div>
        </div>
        <nav className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-3 pb-2 text-sm">
          <Link href="/worker" className="whitespace-nowrap rounded-lg px-3 py-2 font-medium text-slate-700 hover:bg-slate-100">Today</Link>
          <Link href="/worker#coming-up" className="whitespace-nowrap rounded-lg px-3 py-2 font-medium text-slate-700 hover:bg-slate-100">Coming up</Link>
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-5">{children}</main>
    </div>
  );
}
