import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { createStaff, deleteStaff, setStaffLogin } from "./actions";

export default async function StaffPage() {
  const me = await requireRole(["owner"]);
  const sb = await createClient();
  const { data } = await sb.from("profiles").select("id, full_name, role, phone").in("role", ["owner", "worker"]).order("created_at");
  const people = data ?? [];

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <h1 className="h1">Staff logins</h1>
      <p className="text-sm text-slate-600">Everyone can log in with their mobile number (or email) and a password of at least 8 characters.</p>

      <div className="space-y-3">
        {people.map((p) => (
          <div key={p.id} className="card space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold">{p.full_name} {p.id === me.id && <span className="text-xs font-normal text-slate-500">(you)</span>}</p>
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  {p.role === "owner" ? "Owner" : "Staff"}{p.phone ? ` · ${p.phone}` : " · no mobile number yet"}
                </p>
              </div>
              {p.id !== me.id && (
                <form action={deleteStaff}>
                  <input type="hidden" name="id" value={p.id} />
                  <button className="text-sm text-red-600 underline">Remove</button>
                </form>
              )}
            </div>
            <ActionForm action={setStaffLogin} className="flex flex-wrap gap-2">
              <input type="hidden" name="id" value={p.id} />
              <input name="mobile" type="tel" inputMode="numeric" required maxLength={13} defaultValue={p.phone ?? ""} placeholder="Mobile number" aria-label="Mobile number" className="input !w-40" />
              <input name="password" type="text" minLength={8} placeholder="New password (optional)" aria-label="New password" className="input !w-48" />
              <SubmitButton className="btn-secondary">{p.phone ? "Save" : "Set mobile number"}</SubmitButton>
            </ActionForm>
          </div>
        ))}
      </div>

      <ActionForm action={createStaff} className="card space-y-3">
        <h2 className="font-semibold">Add a login</h2>
        <div>
          <label className="label">Role</label>
          <select name="role" defaultValue="worker" className="input">
            <option value="worker">Staff (worker): sees today&apos;s tasks, no prices</option>
            <option value="owner">Owner (admin): full access</option>
          </select>
        </div>
        <div>
          <label className="label">Name</label>
          <input name="full_name" required className="input" />
        </div>
        <div>
          <label className="label">Mobile number (used to log in)</label>
          <input name="mobile" type="tel" inputMode="numeric" required maxLength={13} placeholder="10-digit mobile number" className="input" />
        </div>
        <div>
          <label className="label">Password (min 8 characters)</label>
          <input name="password" type="text" minLength={8} required className="input" />
        </div>
        <SubmitButton className="btn-primary w-full">Create login</SubmitButton>
      </ActionForm>
    </div>
  );
}
