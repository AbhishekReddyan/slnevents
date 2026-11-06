"use client";

import { useState } from "react";

type Msg = { label: string; text: string };

/**
 * Opens WhatsApp with a ready message. The number defaults to the one the customer
 * entered while booking; the owner can type any other 10-digit number instead.
 */
export default function WhatsAppSend({ defaultPhone, messages }: { defaultPhone: string; messages: Msg[] }) {
  const customerDigits = defaultPhone.replace(/\D/g, "").slice(-10);
  const [number, setNumber] = useState(customerDigits);
  const digits = number.replace(/\D/g, "").slice(-10);
  const valid = digits.length === 10;
  const custom = digits !== customerDigits;

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium">
        Send to (mobile number)
        <div className="mt-1 flex items-center gap-2">
          <span className="text-sm text-slate-600">+91</span>
          <input
            className="input max-w-[11rem]"
            inputMode="numeric"
            maxLength={14}
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            aria-label="WhatsApp number"
          />
          {custom && (
            <button type="button" className="text-sm text-emerald-700 underline" onClick={() => setNumber(customerDigits)}>
              Use customer&apos;s number
            </button>
          )}
        </div>
      </label>
      <p className="text-xs text-slate-500">
        {custom ? "Sending to a different number." : "This is the number the customer entered while booking."}
      </p>
      {!valid && <p className="text-xs text-red-600">Enter a 10-digit mobile number.</p>}
      <div className="flex flex-wrap gap-2">
        {messages.map((m) =>
          valid ? (
            <a
              key={m.label}
              className="btn-secondary"
              target="_blank"
              rel="noreferrer"
              href={`https://wa.me/91${digits}?text=${encodeURIComponent(m.text)}`}
            >
              {m.label}
            </a>
          ) : (
            <span key={m.label} className="btn-secondary pointer-events-none opacity-50">{m.label}</span>
          )
        )}
      </div>
    </div>
  );
}
