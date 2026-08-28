-- A campanha principal do site e a ordem manual da vitrine.
--
-- `principal` é o card grande no topo. Antes ele era só o primeiro da
-- ordenação, ou seja, a campanha mais recente com showOnHome ligado: não
-- havia como dizer qual é A principal, só torcer para a ordem coincidir.
--
-- `ordem` resolve o outro lado: a vitrine ordenava por data de criação, e
-- subir uma campanha antiga exigia recriá-la.
ALTER TABLE "Raffle" ADD COLUMN "principal" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Raffle" ADD COLUMN "ordem" INTEGER NOT NULL DEFAULT 0;

-- Uma principal por tenant, cobrado pelo banco.
--
-- Índice parcial, e não unique comum: unique em (tenantId, principal)
-- impediria duas campanhas NÃO principais no mesmo tenant, que é o caso
-- normal. Aqui só as linhas com principal = true entram no índice.
CREATE UNIQUE INDEX "Raffle_principal_por_tenant"
  ON "Raffle" ("tenantId") WHERE "principal";

-- A ordem inicial preserva o que a vitrine já mostrava: mais recente primeiro.
-- Sem isto toda campanha nasceria com ordem 0 e a lista viraria outra da noite
-- para o dia.
WITH numeradas AS (
  SELECT id, row_number() OVER (
    PARTITION BY "tenantId" ORDER BY "showOnHome" DESC, "createdAt" DESC
  ) AS posicao
  FROM "Raffle"
)
UPDATE "Raffle" r SET "ordem" = n.posicao FROM numeradas n WHERE n.id = r.id;
