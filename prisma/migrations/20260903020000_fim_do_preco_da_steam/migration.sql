-- O cache de preço da Steam sai.
--
-- A tabela existia para guardar o resultado de uma consulta ao Mercado da
-- Comunidade Steam e não precisar perguntar de novo. A consulta foi removida
-- do projeto: a rota não é oficial, limita por IP e, de um servidor, responde
-- 429 ou "não tenho anúncio" com frequência demais para o painel depender
-- dela. Sem quem escreva, o cache é peso morto.
--
-- A tabela está vazia em produção, então nada é perdido aqui. O valor da skin
-- continua vivo em SkinTemplate.skinValueBrl, que é digitado no catálogo e
-- não depende de ninguém estar no ar.

DROP TABLE IF EXISTS "SkinPreco";
