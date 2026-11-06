import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/** Public URL of the logo the owner uploaded in Settings, or null. Safe for anonymous visitors. */
export const getLogo = cache(async (): Promise<string | null> => {
  const sb = await createClient();
  const { data } = await sb.rpc("public_logo");
  return typeof data === "string" && data ? data : null;
});
