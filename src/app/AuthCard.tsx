"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { loginCustomer, registerCustomer } from "./account-actions";

const pinProps = { type: "password", inputMode: "numeric" as const, pattern: "[0-9]{4}", maxLength: 4, required: true, autoComplete: "off" };

/** Register / log in with a mobile number and a 4-digit PIN chosen by the customer. */
export default function AuthCard({ next = "/" }: { next?: string }) {
  const [tab, setTab] = useState<"register" | "login">("register");
  return (
    <section id="account" className="card space-y-4">
      <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1 text-sm font-semibold">
        {(["register", "login"] as const).map((k) => (
          <button
            key={k} type="button" onClick={() => setTab(k)} aria-pressed={tab === k}
            className={`rounded-lg px-3 py-2 ${tab === k ? "bg-white text-emerald-800 shadow-sm" : "text-slate-600"}`}
          >
            {k === "register" ? "Register" : "Log in"}
          </button>
        ))}
      </div>

      {tab === "register" ? (
        <ActionForm action={registerCustomer} className="space-y-3">
          <input type="hidden" name="next" value={next} />
          <div><label className="label">Your name</label><input name="name" required maxLength={120} autoComplete="name" className="input" /></div>
          <div><label className="label">Mobile number</label><input name="phone" type="tel" inputMode="tel" required maxLength={15} autoComplete="tel" className="input" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Choose a 4-digit PIN</label><input name="pin" {...pinProps} className="input" /></div>
            <div><label className="label">Repeat PIN</label><input name="pin2" {...pinProps} className="input" /></div>
          </div>
          <p className="text-xs text-slate-500">Remember your PIN. Do not share it with anyone: it protects your orders and photos.</p>
          <SubmitButton className="btn-primary w-full">Create my account</SubmitButton>
        </ActionForm>
      ) : (
        <ActionForm action={loginCustomer} className="space-y-3">
          <input type="hidden" name="next" value={next} />
          <div><label className="label">Mobile number</label><input name="phone" type="tel" inputMode="tel" required maxLength={15} autoComplete="tel" className="input" /></div>
          <div><label className="label">4-digit PIN</label><input name="pin" {...pinProps} className="input" /></div>
          <SubmitButton className="btn-primary w-full">Log in</SubmitButton>
          <p className="text-xs text-slate-500">Forgot your PIN? Call us and we will reset it.</p>
        </ActionForm>
      )}
    </section>
  );
}
