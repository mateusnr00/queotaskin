-- ============================================================================
-- VERIFY RUNTIME RLS (GATE-5.5)  -- regression check, fail-closed
-- ----------------------------------------------------------------------------
-- Roda READ-ONLY. RAISE EXCEPTION (aborta) se QUALQUER invariante do modelo de
-- runtime/RLS estiver violada. Rodar:
--   * depois de aplicar runtime-rls.sql (antes do cutover para app_runtime);
--   * como gate pos-deploy recorrente (impede regressao silenciosa do estado
--     "RLS habilitada + zero policy + runtime sem acesso").
-- Nao altera nada. Nao imprime segredo.
-- ============================================================================
DO $$
DECLARE
  v_ar_bypass boolean;
  v_anon_bypass boolean;
  v_auth_bypass boolean;
  v_ar_can_status boolean;
  v_ar_can_ddl boolean;
  v_rls_off int;
BEGIN
  -- 1. app_runtime existe e IGNORA RLS (senao o app quebra ao rodar como ela)
  SELECT rolbypassrls INTO v_ar_bypass FROM pg_roles WHERE rolname='app_runtime';
  IF v_ar_bypass IS NULL THEN
    RAISE EXCEPTION 'RUNTIME_RLS: role app_runtime nao existe';
  END IF;
  IF v_ar_bypass IS NOT TRUE THEN
    RAISE EXCEPTION 'RUNTIME_RLS: app_runtime SEM BYPASSRLS -> seria bloqueada pela RLS (aplicar runtime-rls.sql)';
  END IF;

  -- 2. anon/authenticated NAO podem ter BYPASSRLS (RLS e a protecao da Data API)
  SELECT rolbypassrls INTO v_anon_bypass FROM pg_roles WHERE rolname='anon';
  SELECT rolbypassrls INTO v_auth_bypass FROM pg_roles WHERE rolname='authenticated';
  IF COALESCE(v_anon_bypass,false) OR COALESCE(v_auth_bypass,false) THEN
    RAISE EXCEPTION 'RUNTIME_RLS: anon/authenticated com BYPASSRLS -> exposicao da Data API';
  END IF;

  -- 3. RLS continua habilitada nas tabelas sensiveis (protege a Data API).
  --    Se alguem DESABILITOU RLS, anon/authenticated (com grants) leriam tudo.
  SELECT count(*) INTO v_rls_off
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relkind='r'
     AND c.oid IN ('public."User"'::regclass,'public."Payment"'::regclass,'public."AdminSecurityEvent"'::regclass)
     AND c.relrowsecurity = false;
  IF v_rls_off > 0 THEN
    RAISE EXCEPTION 'RUNTIME_RLS: RLS desabilitada em % tabela(s) sensivel(is) -> risco de exposicao pela Data API', v_rls_off;
  END IF;

  -- 4. Financial column lockdown intacto: app_runtime NAO pode UPDATE Payment.status
  SELECT has_column_privilege('app_runtime','"Payment"','status','UPDATE') INTO v_ar_can_status;
  IF v_ar_can_status IS NOT FALSE THEN
    RAISE EXCEPTION 'RUNTIME_RLS: app_runtime recuperou UPDATE(Payment.status) -> lockdown financeiro quebrado';
  END IF;

  -- 5. app_runtime continua sem DDL (menor privilegio)
  SELECT has_schema_privilege('app_runtime','public','CREATE') INTO v_ar_can_ddl;
  IF v_ar_can_ddl IS NOT FALSE THEN
    RAISE EXCEPTION 'RUNTIME_RLS: app_runtime ganhou CREATE no schema public -> DDL indevido';
  END IF;

  RAISE NOTICE 'RUNTIME_RLS OK: app_runtime bypassa RLS, RLS ativa p/ Data API, lockdown de Payment.status intacto, sem DDL.';
END $$;
