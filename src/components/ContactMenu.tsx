import { CONTACTS } from "@/lib/contacts";

/** "Contact" drop-down: tapping a name opens the phone's dial pad with that number ready. */
export default function ContactMenu() {
  const people = CONTACTS.map((c) => ({ ...c, digits: c.phone.replace(/\D/g, "").slice(-10) })).filter((c) => c.digits.length === 10);
  if (people.length === 0) return null;
  return (
    <details className="group relative">
      <summary className="cursor-pointer list-none text-sm font-semibold text-slate-700 hover:text-emerald-700 [&::-webkit-details-marker]:hidden">
        Contact
      </summary>
      <div className="absolute right-0 z-30 mt-2 w-64 space-y-1 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
        {people.map((c) => (
          <a key={c.name} href={`tel:+91${c.digits}`} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 hover:bg-emerald-50">
            <span>
              <span className="block text-sm font-semibold text-slate-900">{c.name}</span>
              <span className="block text-xs text-slate-500">{c.role}</span>
            </span>
            <span className="text-sm font-semibold text-emerald-700">📞 Call</span>
          </a>
        ))}
      </div>
    </details>
  );
}
