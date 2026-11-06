/** Workers log in with a mobile number. Supabase Auth needs an email, so each worker
 *  gets a hidden internal address built from the number. Nobody ever receives mail there. */
export function normalizeMobile(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  const ten = digits.length >= 10 ? digits.slice(-10) : "";
  return /^[6-9]\d{9}$/.test(ten) ? ten : null;
}

export const mobileToEmail = (mobile: string) => `${mobile}@worker.sln-tenthouse.in`;

/** True when the text typed on the login page is a mobile number rather than an email. */
export const looksLikeMobile = (v: string) => !v.includes("@") && /^[+\d][\d\s-]{8,}$/.test(v.trim());
