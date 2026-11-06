import { revalidatePath } from "next/cache";
import { getSettings } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import type { FormState } from "@/lib/types";
import { getLogo } from "@/lib/branding";
import LogoUpload from "./LogoUpload";

async function saveSettings(_: FormState, fd: FormData): Promise<FormState> {
  "use server";
  const sb = await createClient();
  const buffer = Math.floor(Number(fd.get("buffer_days")));
  if (!(buffer >= 0 && buffer <= 14)) return { error: "Buffer days must be between 0 and 14." };
  const retention = Math.floor(Number(fd.get("photo_retention_days")));
  if (!(retention >= 0 && retention <= 365)) return { error: "Photo retention must be between 0 and 365 days." };
  const { error } = await sb
    .from("settings")
    .update({
      business_name: String(fd.get("business_name") ?? "").trim() || "SLN Tent House",
      buffer_days: buffer,
      show_prices: fd.get("show_prices") === "on",
      timezone: String(fd.get("timezone") ?? "").trim() || "Asia/Kolkata",
      photo_retention_days: retention,
    })
    .eq("id", 1);
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: "Settings saved." };
}

export default async function SettingsPage() {
  const s = await getSettings();
  return (
    <div className="mx-auto max-w-lg space-y-4">
      <h1 className="h1">Settings</h1>
      <LogoUpload current={await getLogo()} />
      <ActionForm action={saveSettings} className="card space-y-4">
        <div>
          <label className="label">Business name</label>
          <input name="business_name" defaultValue={s.business_name} className="input" />
        </div>
        <div>
          <label className="label">Buffer days after each event</label>
          <input name="buffer_days" type="number" min={0} max={14} defaultValue={s.buffer_days} className="input" />
          <p className="mt-1 text-xs text-slate-500">
            Extra days stock stays blocked after the event end date (for cleaning or late returns). 0 = off.
          </p>
        </div>
        <div>
          <label className="label">Time zone</label>
          <input name="timezone" defaultValue={s.timezone} className="input" />
          <p className="mt-1 text-xs text-slate-500">Used to decide what &quot;today&quot; means, e.g. Asia/Kolkata.</p>
        </div>
        <div>
          <label className="label">Keep delivery and pickup photos for (days)</label>
          <input name="photo_retention_days" type="number" min={0} max={365} defaultValue={s.photo_retention_days} className="input" />
          <p className="mt-1 text-xs text-slate-500">
            Photos are deleted automatically this many days after the event ends (or after the last not-returned item is resolved). Default 2.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="show_prices" defaultChecked={s.show_prices} className="h-5 w-5" />
          Show prices to customers on the ordering page
        </label>
        <SubmitButton className="btn-primary w-full">Save settings</SubmitButton>
      </ActionForm>
    </div>
  );
}
