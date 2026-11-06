import Link from "next/link";
import Backdrop from "@/components/Backdrop";
import { dictionaries, fill, getLang } from "@/lib/i18n";

export default async function Thanks({ searchParams }: { searchParams: Promise<{ no?: string; merged?: string }> }) {
  const { no, merged } = await searchParams;
  const t = dictionaries[await getLang()];
  const ref = no && /^\d+$/.test(no) ? no : null;
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 text-center">
      <Backdrop soft />
      <div className="card space-y-3">
        <h1 className="h1">{t.thanksTitle}</h1>
        {ref && <p className="text-lg font-semibold text-emerald-800">{t.reference} #{ref}</p>}
        {merged === "1" && ref && <p className="rounded-lg bg-emerald-50 p-2 text-sm text-emerald-800">{fill(t.mergedText, { no: ref })}</p>}
        {merged === "1" && !ref && (
          <p className="rounded-lg bg-emerald-50 p-2 text-sm text-emerald-800">You already have an order for these dates; your items will be added to it.</p>
        )}
        <p className="text-slate-600">{t.thanksText}</p>
        <Link href="/" className="btn-primary">{t.another}</Link>
      </div>
    </main>
  );
}
