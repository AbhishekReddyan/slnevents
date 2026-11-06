"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCustomer } from "@/lib/customer-session";
import { dictionaries, getLang } from "@/lib/i18n";
import type { FormState } from "@/lib/types";

export async function submitOrder(_: FormState, fd: FormData): Promise<FormState> {
  const t = dictionaries[await getLang()];
  // Honeypot: real people never fill this hidden field. Bots do.
  if (String(fd.get("website") ?? "") !== "") redirect("/thanks");

  // Orders need a logged-in customer. Name and phone come from the account, not the form.
  const me = await getCustomer();
  if (!me) return { error: "Please register or log in first." };

  let items: { item_id: string; qty: number }[] = [];
  try {
    items = JSON.parse(String(fd.get("items") ?? "[]"));
  } catch {
    return { error: t.failed };
  }
  items = items.filter((i) => i && typeof i.item_id === "string" && Number.isInteger(i.qty) && i.qty > 0);
  let decorations: string[] = [];
  try {
    const parsed = JSON.parse(String(fd.get("decorations") ?? "[]"));
    decorations = Array.isArray(parsed) ? parsed.filter((d) => typeof d === "string") : [];
  } catch {
    decorations = [];
  }
  if (items.length === 0 && decorations.length === 0) return { error: t.noItemsChosen };

  const { data, error } = await createAdminClient().rpc("customer_submit_order", {
    p_customer: me.id,
    p_address: String(fd.get("address") ?? ""),
    p_notes: String(fd.get("notes") ?? ""),
    p_start: String(fd.get("start") ?? ""),
    p_end: String(fd.get("end") ?? ""),
    p_items: items,
    p_decorations: decorations,
  });
  if (error) return { error: error.message || t.failed };
  const res = data as { id: string; order_no: number; merged: boolean; add_on_to: number | null };
  redirect(`/account/orders/${res.id}?new=1${res.merged ? "&merged=1" : ""}${res.add_on_to ? `&addon=${res.add_on_to}` : ""}`);
}
