"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

export async function setLang(fd: FormData) {
  const lang = String(fd.get("lang")) === "en" ? "en" : "kn";
  (await cookies()).set("lang", lang, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  revalidatePath("/", "layout");
}
