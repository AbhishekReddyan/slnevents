import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import ItemForm from "../ItemForm";

export default async function NewItemPage() {
  const sb = await createClient();
  const { data } = await sb.from("items").select("group_name").not("group_name", "is", null);
  const groups = [...new Set((data ?? []).map((r) => r.group_name as string))].sort();
  return (
    <div className="mx-auto max-w-lg space-y-4">
      <Link href="/admin/inventory" className="text-sm text-emerald-700 underline">← Inventory</Link>
      <h1 className="h1">Add item</h1>
      <ItemForm groups={groups} />
    </div>
  );
}
