-- 012: customers may choose any 4-digit PIN. Run only if you already ran 011 before this change (safe to run anyway).
create or replace function customer_register(p_name text, p_phone text, p_pin text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid;
begin
  if char_length(trim(coalesce(p_name, ''))) = 0 or char_length(p_name) > 120 then
    return json_build_object('ok', false, 'error', 'Please enter your name.');
  end if;
  if p_phone is null or p_phone !~ '^[6-9][0-9]{9}$' then
    return json_build_object('ok', false, 'error', 'Enter a valid 10-digit mobile number.');
  end if;
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then
    return json_build_object('ok', false, 'error', 'The PIN must be exactly 4 digits.');
  end if;
  if exists (select 1 from customers where phone = p_phone) then
    return json_build_object('ok', false, 'error', 'This mobile number is already registered. Please log in.');
  end if;
  insert into customers (name, phone, pin_hash)
  values (trim(p_name), p_phone, crypt(p_pin, gen_salt('bf', 8)))
  returning id into v_id;
  return json_build_object('ok', true, 'id', v_id, 'name', trim(p_name));
end $$;


revoke execute on function customer_register(text, text, text) from public, anon, authenticated;
grant  execute on function customer_register(text, text, text) to service_role;
