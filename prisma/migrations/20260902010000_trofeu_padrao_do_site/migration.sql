-- O troféu da tela de sorteio vira padrão do site.
--
-- Era só por campanha, e isso obrigava a reenviar a mesma imagem em cada
-- sorteio novo. Aqui fica o do site; a coluna da campanha continua valendo
-- para quem quiser variar num sorteio específico.
ALTER TABLE "Tenant" ADD COLUMN "trofeuUrl" TEXT;
