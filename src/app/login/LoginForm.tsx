"use client";

import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { login } from "./actions";

export default function LoginForm() {
  return (
    <ActionForm action={login} className="card space-y-4">
      <div>
        <label className="label" htmlFor="login">Email or mobile number</label>
        <input id="login" name="login" type="text" inputMode="email" autoComplete="username" autoCapitalize="none" required className="input" />
      </div>
      <div>
        <label className="label" htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className="input" />
      </div>
      <SubmitButton className="btn-primary w-full">Log in</SubmitButton>
    </ActionForm>
  );
}
