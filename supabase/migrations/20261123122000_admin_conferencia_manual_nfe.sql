-- 20261123122000_admin_conferencia_manual_nfe.sql
-- Plataforma: Admin · Seção: Operação → Notas na SEFAZ → "Conferir na SEFAZ" (apps/admin/js/verify.js, manualCheck)
-- Origem: auditoria B0 de 23/11/2026 — a tela chama rpc('bo_nfe_manual_check') e a função NÃO existe no banco:
--         o botão "Registrar" sempre dá erro (achado A-001, alto: funcionalidade prevista que não funciona).
-- Estado: PRONTA, NÃO APLICADA. Testar primeiro num branch do Supabase.
--
-- O que faz: cria public.bo_nfe_manual_check(p_invoice, p_status, p_note), só para a equipe (papel analyst ou
-- superior, via public._staff), que grava a conferência manual pelo mesmo caminho da consulta automática
-- (public._nfe_check_save: nfe_checks, sefaz_status da nota, alertas e bloqueio da operação) e registra no log da equipe.
-- Status aceitos (os mesmos do formulário): authorized, cancelled, not_found. Anotação obrigatória, de 3 a 500 caracteres depois de tirar espaços e quebras de linha das pontas.
--
-- Como reverter: drop function if exists public.bo_nfe_manual_check(uuid, text, text);

begin;

create or replace function public.bo_nfe_manual_check(p_invoice uuid, p_status text, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.staff_users := public._staff('analyst');
  v_note text := regexp_replace(coalesce(p_note, ''), '^[\s\u00a0]+|[\s\u00a0]+$', '', 'g');   -- tira espaço, tab, quebra de linha e espaço não separável
  v_company uuid;
  r jsonb;
begin
  if p_status is null or p_status not in ('authorized', 'cancelled', 'not_found') then
    raise exception 'invalid_status';
  end if;
  if char_length(v_note) < 3 or char_length(v_note) > 500 then
    raise exception 'manual_note_required';
  end if;
  select company_id into v_company from public.invoices where id = p_invoice;
  if not found then
    raise exception 'not_found';
  end if;
  r := public._nfe_check_save(p_invoice, jsonb_build_object(
         'status', p_status,
         'provider', 'manual:' || coalesce(nullif(trim(s.name), ''), 'equipe Lottus'),   -- a lista mostra "à mão por <nome>"
         'events', jsonb_build_array(jsonb_build_object('kind', 'manual_check', 'note', v_note, 'at', now()))));
  perform public._staff_log(s, 'nfe_manual_check', 'invoice', p_invoice::text, v_company,
                            jsonb_build_object('status', p_status, 'note', v_note));
  return coalesce(r, '{}'::jsonb);
end;
$$;

revoke all on function public.bo_nfe_manual_check(uuid, text, text) from public, anon;
grant execute on function public.bo_nfe_manual_check(uuid, text, text) to authenticated;

commit;
