-- Selo inicial do card por campanha (o "Adquira já!" que pisca). Opcional:
-- vazio segue mostrando "Adquira já!". Só a faixa inicial; as faixas de venda
-- (metade, últimos, esgotado) continuam automáticas.
ALTER TABLE "Raffle" ADD COLUMN "seloInicialTexto" TEXT;
