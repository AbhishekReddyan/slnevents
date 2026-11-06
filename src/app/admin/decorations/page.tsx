import { createClient } from "@/lib/supabase/server";
import DecorationForm from "./DecorationForm";
import { removeDecoration } from "./actions";

type Decoration = { id: string; title: string; title_kn: string | null; photo_url: string | null };

export default async function DecorationsPage() {
  const sb = await createClient();
  const { data, error } = await sb
    .from("decorations")
    .select("id, title, title_kn, photo_url")
    .eq("active", true)
    .order("sort_order");
  const list = (data ?? []) as Decoration[];

  return (
    <div className="space-y-4">
      <h1 className="h1">Flower decoration designs</h1>
      <p className="text-sm text-slate-600">
        Customers see these photos and tap the ones they like. There is no price here, because decoration prices change
        with the season. You enter the decoration charge on each order.
      </p>
      {error && <p className="card text-red-700">{error.message}</p>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {list.map((d) => (
          <div key={d.id} className="card !p-2">
            {d.photo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={d.photo_url} alt="Decoration design" className="aspect-square w-full rounded-lg object-cover" />
            )}
            <form action={removeDecoration} className="mt-1">
              <input type="hidden" name="id" value={d.id} />
              <button className="text-sm text-red-600 underline">Remove</button>
            </form>
          </div>
        ))}
      </div>
      {list.length === 0 && <p className="card text-slate-600">No designs yet. Add your first one below.</p>}

      <div className="mx-auto max-w-lg">
        <DecorationForm />
      </div>
    </div>
  );
}
