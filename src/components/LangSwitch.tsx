import { setLang } from "@/app/lang-actions";
import type { Lang } from "@/lib/i18n";

/** Small English / ಕನ್ನಡ toggle. */
export default function LangSwitch({ lang }: { lang: Lang }) {
  return (
    <form action={setLang}>
      <input type="hidden" name="lang" value={lang === "kn" ? "en" : "kn"} />
      <button className="rounded-full border border-slate-300 bg-white px-3 py-1 text-sm font-medium text-slate-700">
        {lang === "kn" ? "English" : "ಕನ್ನಡ"}
      </button>
    </form>
  );
}
