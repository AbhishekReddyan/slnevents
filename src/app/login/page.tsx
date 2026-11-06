import Link from "next/link";
import { redirect } from "next/navigation";
import LoginForm from "./LoginForm";
import { getProfile, homeFor } from "@/lib/auth";
import Backdrop from "@/components/Backdrop";
import Logo from "@/components/Logo";
import { getLogo } from "@/lib/branding";

export const dynamic = "force-dynamic";

// English only.
export default async function LoginPage() {
  const profile = await getProfile();
  if (profile && profile.role !== "none") redirect(homeFor(profile.role));

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <Backdrop />
      <div className="mb-3"><Logo src={await getLogo()} size={64} /></div>
      <h1 className="h1 mb-1 !text-white">Staff login</h1>
      <p className="mb-6 text-sm text-white/90">
        For the owner and workers. Customers do not need to log in.
      </p>
      <LoginForm />
      <Link href="/" className="mt-6 text-center text-sm text-white underline">
        Customer ordering page
      </Link>
    </main>
  );
}
