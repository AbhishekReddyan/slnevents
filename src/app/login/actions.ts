"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { homeFor } from "@/lib/auth";
import { looksLikeMobile, normalizeMobile } from "@/lib/phone";
import type { FormState, Role } from "@/lib/types";

const NO_ACCESS = "This account has no access. Ask the owner to enable it.";

/** Staff and owners: email or mobile number, plus password. */
export async function login(_: FormState, fd: FormData): Promise<FormState> {
  const typed = String(fd.get("login") ?? "").trim();
  const password = String(fd.get("password") ?? "");
  if (!typed || !password) return { error: "Enter your email or mobile number and password." };

  const admin = createAdminClient();
  let email = typed;
  let mobile: string | null = null;

  if (looksLikeMobile(typed)) {
    mobile = normalizeMobile(typed);
    if (!mobile) return { error: "Enter a valid 10-digit mobile number." };
    // 5 wrong passwords = 15 minute lock, 10 = 24 hours (per mobile number). Both lookups run together.
    const [{ data: gate }, { data: prof }] = await Promise.all([
      admin.rpc("staff_login_gate", { p_phone: mobile }),
      admin.from("profiles").select("id").eq("phone", mobile).maybeSingle(),
    ]);
    const g = gate as { locked: boolean; minutes: number } | null;
    if (g?.locked) return { error: `Too many wrong attempts. Try again in ${g.minutes} minute(s).` };

    const { data: u } = prof ? await admin.auth.admin.getUserById(prof.id) : { data: null };
    if (!u?.user?.email) {
      await admin.rpc("staff_login_result", { p_phone: mobile, p_ok: false });
      return { error: "Wrong login or password." };
    }
    email = u.user.email;
  }

  const sb = await createClient();
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    if (mobile) await admin.rpc("staff_login_result", { p_phone: mobile, p_ok: false });
    return { error: "Wrong login or password." };
  }
  if (mobile) after(async () => { await admin.rpc("staff_login_result", { p_phone: mobile!, p_ok: true }); }); // not needed to show the next page

  const { data: profile } = await sb.from("profiles").select("role").eq("id", data.user.id).single();
  const role = (profile?.role ?? "none") as Role;
  if (role === "none") {
    await sb.auth.signOut();
    return { error: NO_ACCESS };
  }
  redirect(homeFor(role));
}

export async function logout() {
  const sb = await createClient();
  await sb.auth.signOut();
  redirect("/login");
}
