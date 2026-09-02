-- DE ONDE VEIO O PRECO DA SKIN.
--
-- Ate agora so existia uma fonte, o Mercado da Comunidade Steam, e a coluna
-- nao fazia falta. Com a SteamAnalyst entrando como fonte de catalogo, a
-- diferenca passa a importar na tela: "media de 7 dias da SteamAnalyst,
-- convertida do dolar" e "mediana da Steam de agora" sao numeros com confianca
-- diferente na hora de decidir o preco da cota.
--
-- O padrao 'steam' cobre as linhas existentes sem precisar de backfill: tudo o
-- que estava la veio de la mesmo.
ALTER TABLE "SkinPreco" ADD COLUMN "fonte" TEXT NOT NULL DEFAULT 'steam';

-- Em dolar, quando a fonte cobra em dolar. Fica junto para dar para conferir a
-- conversao depois sem refazer a consulta.
ALTER TABLE "SkinPreco" ADD COLUMN "usd" DECIMAL(10,2);
