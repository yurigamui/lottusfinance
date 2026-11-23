-- Troca o envio real de e-mail por uma caixa de saída local (nada sai da máquina).
create or replace function public._send_email(p_to text, p_subject text, p_html text, p_text text, p_kind text, p_meta jsonb default '{}'::jsonb, p_from text default null, p_track boolean default false)
returns uuid language sql security definer set search_path = '' as $$
  insert into public.email_outbox (to_addr, subject, html, kind, meta) values (p_to, p_subject, p_html, p_kind, p_meta) returning id $$;
-- Gatilho que o Supabase tem: novo usuário em auth.users cria profiles.
create or replace function public._local_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin insert into public.profiles (id, email, full_name) values (new.id, new.email, new.raw_user_meta_data->>'name') on conflict do nothing; return new; end $$;
create trigger local_new_user after insert on auth.users for each row execute function public._local_new_user();
