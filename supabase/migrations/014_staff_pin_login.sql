-- 014: staff (workers and owners) log in with mobile number + PIN. This adds the wrong-PIN lock.
-- Run once, after 013. Callable by the server (service role) only.
create table if not exists staff_attempts (
  phone        text primary key,
  failed       int  not null default 0,
  locked_until timestamptz
);
alter table staff_attempts enable row level security;   -- no policies: service role only

create or replace function staff_login_gate(p_phone text) returns json
language plpgsql stable security definer set search_path = public as $$
declare a staff_attempts%rowtype;
begin
  select * into a from staff_attempts where phone = p_phone;
  if found and a.locked_until is not null and a.locked_until > now() then
    return json_build_object('locked', true,
      'minutes', greatest(1, ceil(extract(epoch from (a.locked_until - now())) / 60)::int));
  end if;
  return json_build_object('locked', false, 'minutes', 0);
end $$;

-- 5 wrong PINs = 15 minute lock, 10 = 24 hours. A correct login clears the counter.
create or replace function staff_login_result(p_phone text, p_ok boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v_fail int;
begin
  if p_ok then
    delete from staff_attempts where phone = p_phone;
    return;
  end if;
  insert into staff_attempts (phone, failed) values (p_phone, 1)
  on conflict (phone) do update set failed = staff_attempts.failed + 1
  returning failed into v_fail;
  update staff_attempts
     set locked_until = case when v_fail >= 10 then now() + interval '24 hours'
                             when v_fail % 5 = 0 then now() + interval '15 minutes' else locked_until end
   where phone = p_phone;
end $$;

revoke execute on function staff_login_gate(text)          from public, anon, authenticated;
revoke execute on function staff_login_result(text, boolean) from public, anon, authenticated;
grant  execute on function staff_login_gate(text)          to service_role;
grant  execute on function staff_login_result(text, boolean) to service_role;
