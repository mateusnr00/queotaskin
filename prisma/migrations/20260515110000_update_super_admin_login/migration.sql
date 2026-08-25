-- Atualiza credenciais de login do SUPER_ADMIN (dono da tenant default
-- "mateus") para name='Mateus Nascimento' e phone='62998080613'.
--
-- Contexto: login do sistema é passwordless por nome + celular. Como
-- SUPER_ADMIN enxerga todas as tenants (inclusive a do André), atualizar
-- apenas esse user é suficiente pra Mateus administrar tudo com esse login.
--
-- Idempotente: re-rodar não muda nada se os valores já estiverem aplicados.
-- Se outro user já segurar o phone alvo (constraint UNIQUE em User.phone),
-- liberamos o phone dele antes pra não bater no índice.

DO $$
DECLARE
  target_user_id TEXT;
  target_phone   TEXT := '62998080613';
  target_name    TEXT := 'Mateus Nascimento';
BEGIN
  SELECT "ownerId" INTO target_user_id
  FROM "Tenant"
  WHERE "slug" = 'mateus'
  LIMIT 1;

  IF target_user_id IS NULL THEN
    RAISE NOTICE 'Tenant "mateus" não encontrada — pulando atualização.';
    RETURN;
  END IF;

  UPDATE "User"
  SET "phone" = NULL
  WHERE "phone" = target_phone
    AND "id" <> target_user_id;

  UPDATE "User"
  SET "name"  = target_name,
      "phone" = target_phone
  WHERE "id" = target_user_id;
END $$;
