import { fmtDate } from "./format";

export type MsgLine = { name: string; name_kn?: string | null; qty: number };

/** wa.me link that opens WhatsApp with the text ready to send to the customer (10-digit Indian number). */
export function waLink(phone: string, text: string) {
  const digits = phone.replace(/\D/g, "").slice(-10);
  return `https://wa.me/91${digits}?text=${encodeURIComponent(text)}`;
}

const list = (lines: MsgLine[], kn: boolean) =>
  lines.map((l) => `• ${l.qty} × ${kn && l.name_kn ? l.name_kn : l.name}`).join("\n");

type Ctx = { business: string; orderNo: number; start: string; end: string; trackUrl: string; items: MsgLine[] };

/** Order confirmed: English and Kannada in one message. */
export function confirmedMessage(c: Ctx) {
  return (
    `${c.business}\nYour order #${c.orderNo} is confirmed for ${fmtDate(c.start)} to ${fmtDate(c.end)}.\n${list(c.items, false)}\n` +
    `Track your order: ${c.trackUrl}\n\n` +
    `${c.business}\nನಿಮ್ಮ ಆರ್ಡರ್ #${c.orderNo} ದೃಢೀಕರಿಸಲಾಗಿದೆ (${fmtDate(c.start)} ರಿಂದ ${fmtDate(c.end)}).\n${list(c.items, true)}\n` +
    `ನಿಮ್ಮ ಆರ್ಡರ್ ಟ್ರ್ಯಾಕ್ ಮಾಡಿ: ${c.trackUrl}`
  );
}

/** After delivery: what was delivered and what is still pending. */
export function deliveryMessage(c: Ctx & { pending: MsgLine[] }) {
  const done = c.pending.length === 0;
  return (
    `${c.business}\nOrder #${c.orderNo}: ${done ? "everything has been delivered." : "your items have been delivered."}\n${list(c.items, false)}\n` +
    (done ? "" : `Still pending:\n${list(c.pending, false)}\n`) +
    `Track: ${c.trackUrl}\n\n` +
    `${c.business}\nಆರ್ಡರ್ #${c.orderNo}: ${done ? "ಎಲ್ಲಾ ವಸ್ತುಗಳನ್ನು ತಲುಪಿಸಲಾಗಿದೆ." : "ನಿಮ್ಮ ವಸ್ತುಗಳನ್ನು ತಲುಪಿಸಲಾಗಿದೆ."}\n${list(c.items, true)}\n` +
    (done ? "" : `ಇನ್ನೂ ಬಾಕಿ ಇರುವುದು:\n${list(c.pending, true)}\n`) +
    `ವಿವರ: ${c.trackUrl}`
  );
}

/** Event over: ask the customer to get the items ready for pickup. */
export function pickupMessage(c: Ctx) {
  return (
    `${c.business}\nOrder #${c.orderNo}: is your event over? We will collect the items. Please keep them ready, or tap here to confirm: ${c.trackUrl}\n\n` +
    `${c.business}\nಆರ್ಡರ್ #${c.orderNo}: ನಿಮ್ಮ ಕಾರ್ಯಕ್ರಮ ಮುಗಿಯಿತೇ? ವಸ್ತುಗಳನ್ನು ವಾಪಸ್ ತೆಗೆದುಕೊಂಡು ಹೋಗುತ್ತೇವೆ. ದಯವಿಟ್ಟು ಸಿದ್ಧವಾಗಿಡಿ ಅಥವಾ ಇಲ್ಲಿ ದೃಢೀಕರಿಸಿ: ${c.trackUrl}`
  );
}

/** Reminder when items have not come back yet. */
export function outstandingMessage(c: { business: string; orderNo: number; lines: MsgLine[] }) {
  return (
    `${c.business}\nOrder #${c.orderNo}: these items have not been returned yet. Please return them soon:\n${list(c.lines, false)}\n\n` +
    `${c.business}\nಆರ್ಡರ್ #${c.orderNo}: ಈ ವಸ್ತುಗಳು ಇನ್ನೂ ವಾಪಸ್ ಬಂದಿಲ್ಲ. ದಯವಿಟ್ಟು ಬೇಗ ಹಿಂತಿರುಗಿಸಿ:\n${list(c.lines, true)}`
  );
}
