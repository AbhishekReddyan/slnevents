import { createClient } from "@/lib/supabase/server";
import { todayIn } from "@/lib/format";
import { dictionaries, getLang } from "@/lib/i18n";
import { getCustomer } from "@/lib/customer-session";
import LangSwitch from "@/components/LangSwitch";
import SiteHeader from "@/components/SiteHeader";
import Backdrop from "@/components/Backdrop";
import OrderForm, { type CatalogDecoration, type CatalogItem } from "../OrderForm";

export const dynamic = "force-dynamic"; // always show the latest catalogue

/** Tent House items (with prices and a running estimate) and Decoration designs, on one request form. */
export default async function OrderPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const sp = await searchParams;
  const lang = await getLang();
  const t = dictionaries[lang];
  const sb = await createClient();
  const [{ data: catalog, error: catalogError }, { data: info }, { data: decor }, me] = await Promise.all([
    sb.rpc("public_catalog"),
    sb.rpc("public_info"),
    sb.rpc("public_decorations"),
    getCustomer(),
  ]);
  const meta = (info as { business_name: string; show_prices: boolean; today: string }[] | null)?.[0];

  return (
    <div>
      <Backdrop soft />
      <SiteHeader business={meta?.business_name ?? "SLN Tent House"} />
      <div className="mx-auto max-w-2xl px-4 py-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <p className="text-sm text-slate-600">{t.intro}</p>
          <LangSwitch lang={lang} />
        </div>
        {catalogError && (
          <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            Setup problem (only the owner needs to read this): {catalogError.message}
          </p>
        )}
        <OrderForm
          items={(catalog ?? []) as CatalogItem[]}
          decorations={(decor ?? []) as CatalogDecoration[]}
          today={meta?.today ?? todayIn("Asia/Kolkata")}
          showPrices={meta?.show_prices ?? true}
          lang={lang}
          t={t}
          customer={me ? { name: me.name } : null}
          initialTab={sp.tab === "decor" ? "decor" : "tent"}
        />
      </div>
    </div>
  );
}
