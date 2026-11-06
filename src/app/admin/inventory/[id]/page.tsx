import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { one } from "@/lib/format";
import type { Item } from "@/lib/types";
import ItemForm from "../ItemForm";

export default async function EditItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await createClient();
  const [{ data }, { data: grp }] = await Promise.all([
    sb.from("items").select("*, item_prices(price_per_day)").eq("id", id).single(),
    sb.from("items").select("group_name").not("group_name", "is", null),
  ]);
  if (!data) notFound();
  const it = data as Item;
  const groups = [...new Set((grp ?? []).map((r) => r.group_name as string))].sort();

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <Link href="/admin/inventory" className="text-sm text-emerald-700 underline">← Inventory</Link>
      <h1 className="h1">Edit {it.name}</h1>
      <ItemForm
        groups={groups}
        item={{
          id: it.id,
          name: it.name,
          group_name: it.group_name ?? "",
          variant_label: it.variant_label ?? "",
          emoji: it.emoji ?? "",
          photo_url: it.photo_url,
          price_per_day: Number(one(it.item_prices)?.price_per_day ?? 0),
          total_qty: it.total_qty,
          unavailable_qty: it.unavailable_qty,
        }}
      />
    </div>
  );
}
