"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { mobileToEmail, normalizeMobile } from "@/lib/phone";
import type { FormState } from "@/lib/types";

/** Owner only. Creates a worker or another owner who logs in with mobile number + password. */
export async function createStaff(_: FormState, fd: FormData): Promise<FormState> {
  await requireRole(["owner"]); // the service-role key is only used after this check passes
  const name = String(fd.get("full_name") ?? "").trim();
  const mobile = normalizeMobile(String(fd.get("mobile") ?? ""));
  const password = String(fd.get("password") ?? "");
  const role = fd.get("role") === "owner" ? "owner" : "worker";
  if (!name) return { error: "Enter the name." };
  if (!mobile) return { error: "Enter a valid 10-digit mobile number." };
  if (password.length < 8) return { error: "Password must be at least 8 characters." };

  const admin = createAdminClient();
  const { data: taken } = await admin.from("profiles").select("id").eq("phone", mobile).maybeSingle();
  if (taken) return { error: "This mobile number is already registered." };

  const { data: created, error } = await admin.auth.admin.createUser({
    email: mobileToEmail(mobile),
    password,
    email_confirm: true,
    user_metadata: { full_name: name },
    app_metadata: { role }, // cannot be edited by the user
  });
  if (error || !created.user) return { error: error?.message ?? "Could not create the login." };
  // Set the role explicitly: the database trigger can run before app_metadata is saved, which leaves the role as "none".
  const { error: roleError } = await admin.from("profiles").update({ phone: mobile, role }).eq("id", created.user.id);
  if (roleError) {
    await admin.auth.admin.deleteUser(created.user.id); // do not leave a login without access
    return { error: "Could not set up the login: " + roleError.message };
  }
  revalidatePath("/admin/staff");
  return { ok: `${name} can now log in as ${role === "owner" ? "an owner" : "staff"} with mobile ${mobile} and the password.` };
}

/** Owner only. Sets the mobile number and/or a new password of an existing login (also older email accounts). */
export async function setStaffLogin(_: FormState, fd: FormData): Promise<FormState> {
  await requireRole(["owner"]);
  const id = String(fd.get("id") ?? "");
  const mobile = normalizeMobile(String(fd.get("mobile") ?? ""));
  const password = String(fd.get("password") ?? "");
  if (!mobile) return { error: "Enter a valid 10-digit mobile number." };
  if (password && password.length < 8) return { error: "Password must be at least 8 characters." };

  const admin = createAdminClient();
  const { data: target } = await admin.from("profiles").select("role").eq("id", id).single();
  if (target?.role !== "owner" && target?.role !== "worker") return { error: "Login not found." };
  const { data: other } = await admin.from("profiles").select("id").eq("phone", mobile).neq("id", id).maybeSingle();
  if (other) return { error: "This mobile number is already used by someone else." };

  if (password) {
    const { error } = await admin.auth.admin.updateUserById(id, { password });
    if (error) return { error: error.message };
  }
  const { error: pe } = await admin.from("profiles").update({ phone: mobile }).eq("id", id);
  if (pe) return { error: pe.message };
  await admin.rpc("staff_login_result", { p_phone: mobile, p_ok: true }); // clears any lock
  revalidatePath("/admin/staff");
  return { ok: password ? "Saved. Mobile number and password updated." : "Saved. Mobile number updated." };
}

/** Owner only. Removes a worker or another owner (never yourself). */
export async function deleteStaff(fd: FormData) {
  const me = await requireRole(["owner"]);
  const id = String(fd.get("id") ?? "");
  if (!id || id === me.id) return;
  const admin = createAdminClient();
  const { data } = await admin.from("profiles").select("role").eq("id", id).single();
  if (data?.role !== "worker" && data?.role !== "owner") return;
  await admin.auth.admin.deleteUser(id);
  revalidatePath("/admin/staff");
}
