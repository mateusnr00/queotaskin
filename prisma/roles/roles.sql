-- Separação de privilégios (P1-C). Aplicar como a role DONA do schema
-- (migration_role). Idempotente onde possível. Ajuste os nomes/senhas ao seu
-- provedor (Supabase gerencia a role dona; crie a app_runtime abaixo).
--
-- NAO cria senha aqui: defina por ALTER ROLE ... PASSWORD fora do versionado.

-- 1. Role de runtime da aplicacao (sem DDL, sem ownership).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
    CREATE ROLE app_runtime NOLOGIN; -- LOGIN e senha definidos pelo operador
  END IF;
END $$;

-- 2. Conexao e uso do schema, mas NAO criar objetos nele.
GRANT USAGE ON SCHEMA public TO app_runtime;
REVOKE CREATE ON SCHEMA public FROM app_runtime; -- sem CREATE TABLE/FUNCTION

-- 3. DML nas tabelas de negocio (default: tudo). Ownership continua na
--    migration_role, entao ALTER/DROP/DROP TRIGGER ja sao negados por nao-dono.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_runtime;

-- 4. AUDIT APPEND-ONLY para o runtime: pode inserir e ler, nunca alterar/apagar.
REVOKE UPDATE, DELETE ON "AdminSecurityEvent" FROM app_runtime;
REVOKE UPDATE, DELETE ON "LegacyRecoveryAudit" FROM app_runtime;

-- 5. FINANCIAL MAINTENANCE GUARD: o runtime NAO liga/desliga a flag nem mexe na
--    tabela de controle (so o operador via migration_role). O trigger/funcao ja
--    sao imexiveis por nao-dono; aqui tiramos ate a escrita da flag.
REVOKE INSERT, UPDATE, DELETE ON "_financial_maintenance" FROM app_runtime;
REVOKE INSERT, UPDATE, DELETE ON "_financial_maintenance_audit" FROM app_runtime;
-- Leitura da flag e inocua (o trigger a le internamente de qualquer modo).
GRANT SELECT ON "_financial_maintenance" TO app_runtime;
