"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { endSession, getCustomer, startSession } from "@/lib/customer-session";
import { normalizeMobile } from "@/lib/phone";
import type { FormState } from "@/lib/types";

type Result = { ok: boolean; error?: string; id?: string; name?: string };

/** Only allow redirects to pages on this site. */
const safeNext = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "");
  return s.startsWith("/") && !s.startsWith("//") ? s : "/";
};

export async function registerCustomer(_: FormState, fd: FormData): Promise<FormState> {
  const name = String(fd.get("name") ?? "").trim();
  const mobile = normalizeMobile(String(fd.get("phone") ?? ""));
  const pin = String(fd.get("pin") ?? "");
  if (!name) return { error: "Please enter your name." };
  if (!mobile) return { error: "Enter a valid 10-digit mobile number." };
  if (!/^\d{4}$/.test(pin)) return { error: "The PIN must be exactly 4 digits." };
  if (pin !== String(fd.get("pin2") ?? "")) return { error: "The two PINs do not match." };

  const { data, error } = await createAdminClient().rpc("customer_register", { p_name: name, p_phone: mobile, p_pin: pin });
  const r = data as Result | null;
  if (error || !r) return { error: "Could not register right now. Please try again." };
  if (!r.ok || !r.id) return { error: r.error ?? "Could not register." };
  await startSession({ id: r.id, name: r.name ?? name });
  redirect(safeNext(fd.get("next")));
}

export async function loginCustomer(_: FormState, fd: FormData): Promise<FormState> {
  const mobile = normalizeMobile(String(fd.get("phone") ?? ""));
  const pin = String(fd.get("pin") ?? "");
  if (!mobile || !/^\d{4}$/.test(pin)) return { error: "Enter your 10-digit mobile number and 4-digit PIN." };

  const { data, error } = await createAdminClient().rpc("customer_login", { p_phone: mobile, p_pin: pin });
  const r = data as Result | null;
  if (error || !r) return { error: "Could not log in right now. Please try again." };
  if (!r.ok || !r.id) return { error: r.error ?? "Wrong mobile number or PIN." };
  await startSession({ id: r.id, name: r.name ?? "" });
  redirect(safeNext(fd.get("next")));
}

export async function logoutCustomer() {
  await endSession();
  redirect("/");
}

/** "Mark event as completed": tells the shop the event is over so the items can be collected. */
export async function completeEvent(fd: FormData) {
  const me = await getCustomer();
  if (!me) redirect("/");
  const id = String(fd.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) redirect("/account");
  await createAdminClient().rpc("customer_complete_event", { p_customer: me.id, p_order: id });
  redirect(`/account/orders/${id}?done=1`);
}
