import { cookies } from "next/headers";
import type { Lang } from "./i18n-shared";

export * from "./i18n-shared";

/** Customers and workers see Kannada by default; they can switch to English. Owner pages stay English. */
export async function getLang(): Promise<Lang> {
  const c = (await cookies()).get("lang")?.value;
  return c === "en" ? "en" : "kn";
}
