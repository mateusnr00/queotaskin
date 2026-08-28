-- Raridade da skin no título premiado e no prêmio de caixa surpresa.
--
-- Opcional de propósito: prêmio continua sendo texto livre, porque nem todo
-- título premiado é skin. Preenchida só quando o prêmio foi escolhido do
-- catálogo, e serve para a lista pública pintar o nome com a cor da raridade.
ALTER TABLE "AwardedTicket" ADD COLUMN "skinRarity" "SkinRarity";
ALTER TABLE "SurpriseBoxPrize" ADD COLUMN "skinRarity" "SkinRarity";

-- Preenche o que já está cadastrado, para os sorteios no ar não ficarem sem
-- cor até alguém reeditar cada título. O nome é comparado sem o desgaste do
-- fim e sem diferença de caixa, contra o catálogo do próprio tenant.
--
-- Tirar o parêntese final é seguro aqui porque o casamento é com o nome exato
-- de uma skin cadastrada: para "Faca (2 unidades)" virar skin, teria de
-- existir uma skin chamada "Faca", e aí seria mesmo ela.
UPDATE "AwardedTicket" a
SET "skinRarity" = s."skinRarity"
FROM "Raffle" r, "SkinTemplate" s
WHERE a."raffleId" = r."id"
  AND s."tenantId" = r."tenantId"
  AND lower(btrim(regexp_replace(a."prizeDescription", '\s*\([^()]+\)\s*$', ''))) = lower(btrim(s."name"))
  AND a."skinRarity" IS NULL;

UPDATE "SurpriseBoxPrize" p
SET "skinRarity" = s."skinRarity"
FROM "Raffle" r, "SkinTemplate" s
WHERE p."raffleId" = r."id"
  AND s."tenantId" = r."tenantId"
  AND lower(btrim(regexp_replace(p."prize", '\s*\([^()]+\)\s*$', ''))) = lower(btrim(s."name"))
  AND p."skinRarity" IS NULL;
