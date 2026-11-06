-- 019: business name is now "SLN Tent House and Decors". Run once, after 018.
alter table settings alter column business_name set default 'SLN Tent House and Decors';
update settings set business_name = 'SLN Tent House and Decors'
 where id = 1 and business_name in ('SLN Tent House', 'My Tent House');
