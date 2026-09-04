-- Verificacao READ-ONLY da separacao de roles (P1-C §4). O operador roda ISTO
-- (como migration_role/superuser) para PROVAR o modelo antes de liberar. NENHUM
-- password e impresso.

-- 1. app_runtime NAO pode DDL (deve retornar 'DENIED').
DO $$ BEGIN
  BEGIN
    EXECUTE 'SET ROLE app_runtime';
    BEGIN EXECUTE 'CREATE TABLE _rbac_probe(x int)'; RAISE NOTICE 'DDL: ALLOWED (FALHA DE SEGURANCA)'; EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'DDL CREATE TABLE: DENIED (ok)'; END;
    RESET ROLE;
  END;
END $$;

-- 2. app_runtime NAO altera o guard nem a funcao financeira (esperado: DENIED).
--    (rode manualmente sob SET ROLE app_runtime; deve dar insufficient_privilege)
--    DROP TRIGGER prevent_payment_approval_during_financial_maintenance ON "Payment";
--    DROP FUNCTION "fin_transicao_pagamento"(text,text,boolean);
--    UPDATE "_financial_maintenance" SET enabled=true;   -- deve falhar
--    UPDATE "Payment" SET status='APPROVED' WHERE id='x'; -- deve falhar (coluna)

-- 3. audit append-only para app_runtime (esperado: UPDATE/DELETE DENIED).
--    SET ROLE app_runtime; UPDATE "AdminSecurityEvent" SET action='x'; -- falha
--    SET ROLE app_runtime; DELETE FROM "LegacyRecoveryAudit";           -- falha

-- 4. Privilegios efetivos da app_runtime em Payment (status NAO deve ter UPDATE).
SELECT privilege_type, column_name
  FROM information_schema.column_privileges
 WHERE grantee='app_runtime' AND table_name='Payment' AND column_name='status';
-- (esperado: nenhuma linha de UPDATE em 'status')

-- 5. migration_role e dona dos objetos criticos (deve listar as tabelas/funcao).
SELECT tablename, tableowner FROM pg_tables
 WHERE tablename IN ('Payment','Reservation','AdminSecurityEvent','_financial_maintenance');
SELECT proname, pg_get_userbyid(proowner) AS owner FROM pg_proc WHERE proname='fin_transicao_pagamento';

-- 6. quem a connection string atual usa (rode via cada URL; sem senha):
SELECT current_user, session_user;
-- DATABASE_URL deve devolver 'app_runtime'; DIRECT_URL deve devolver a role de migracao.
