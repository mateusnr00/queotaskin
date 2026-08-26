-- Texto do selo na faixa inicial da venda.
--
-- Fecha a escada de mensagens automaticas: antes so metade, quase no fim e
-- esgotado eram automaticos, e a faixa inicial usava um texto digitado por
-- campanha. Isso deixava o selo mentir na direcao contraria, anunciando
-- urgencia com zero vendido.
--
-- Nulo significa usar o padrao ("Adquira ja!"), como nos outros tres.
ALTER TABLE "Tenant" ADD COLUMN "earlyText" TEXT;
