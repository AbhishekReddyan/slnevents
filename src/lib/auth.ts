import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile, Role } from "@/lib/types";

export const getProfile = cache(async (): Promise<Profile | null> => {
  const sb = await createClient();
  // No network call here: the middleware already verified the login for /admin and /worker, and the database
  // checks the token again on the profile query below (a forged cookie gets no row back).
  const {
    data: { session },
  } = await sb.auth.getSession();
  const user = session?.user;
  if (!user) return null;
  const { data } = await sb.from("profiles").select("id, full_name, role").eq("id", user.id).single();
  return (data as Profile) ?? null;
});

export function homeFor(role: Role) {
  return role === "owner" ? "/admin" : role === "worker" ? "/worker" : "/login?error=noaccess";
}

/** Page-level guard. (The database enforces the same rules independently.) */
export async function requireRole(roles: Role[]): Promise<Profile> {
  const p = await getProfile();
  if (!p) redirect("/login");
  if (!roles.includes(p.role)) redirect(homeFor(p.role));
  return p;
}

export const getSettings = cache(async () => {
  const sb = await createClient();
  const { data } = await sb.from("settings").select("*").eq("id", 1).single();
  return (data as { business_name: string; buffer_days: number; show_prices: boolean; timezone: string; photo_retention_days: number }) ?? {
    business_name: "My Tent House",
    buffer_days: 0,
    show_prices: true,
    timezone: "Asia/Kolkata",
    photo_retention_days: 2,
  };
});
