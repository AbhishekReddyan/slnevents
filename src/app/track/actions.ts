"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function requestPickup(fd: FormData) {
  const token = String(fd.get("token") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(token)) return;
  const sb = await createClient();
  await sb.rpc("request_pickup", { p_token: token });
  revalidatePath(`/track/${token}`);
}
