-- Vincula ao tenant os clientes que se cadastraram antes de o cadastro
-- passar a gravar essa informação.
--
-- Sem isso eles continuam invisíveis na lista de Clientes até a primeira
-- compra: a lista acha o cliente por vínculo com o tenant ou por reserva, e
-- quem só criou conta não tem nenhum dos dois.
--
-- Só age quando existe exatamente um tenant. Com mais de um não há como
-- saber em qual porta cada pessoa entrou, e chutar colocaria cliente de um
-- na lista do outro, que é pior do que a linha continuar ausente. Hoje o
-- QuéOta Skin tem um tenant só; a guarda é para o dia em que não tiver.
UPDATE "User"
SET "tenantId" = (SELECT id FROM "Tenant" LIMIT 1)
WHERE "role" = 'PARTICIPANT'
  AND "tenantId" IS NULL
  AND (SELECT COUNT(*) FROM "Tenant") = 1;
