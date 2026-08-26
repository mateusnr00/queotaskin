-- Sub-toggles do modal Caixas Surpresas que aparecem só quando o feature
-- está ativo. Sem efeito concreto até o schema de SurpriseBox (instância
-- de caixa) entrar, por ora a UI persiste os flags.

ALTER TABLE "Raffle"
  ADD COLUMN "surpriseBoxAbrirTodas"       BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN "surpriseBoxExibirGanhadores" BOOLEAN NOT NULL DEFAULT FALSE;
