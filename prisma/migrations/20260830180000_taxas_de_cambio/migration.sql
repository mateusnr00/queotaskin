-- Câmbio para converter o custo da entrega.
--
-- A skin é comprada do fornecedor em YUAN, e é isso que fica gravado em
-- Raffle.deliveryCost. Real e dólar são leituras desse valor.
--
-- As taxas são digitadas no painel, e não buscadas de uma API: número de
-- câmbio inventado por padrão vira relatório financeiro errado com cara de
-- certo. Nulo é "ainda não cadastrada", e nesse caso a tela mostra só yuan.
--
-- Decimal(12,6) porque taxa de câmbio tem casas: 1 CNY vale algo como
-- 0,76 BRL, e arredondar para duas casas erra centavos em cada conversão.
ALTER TABLE "Tenant" ADD COLUMN "cnyToBrl" DECIMAL(12,6);
ALTER TABLE "Tenant" ADD COLUMN "usdToBrl" DECIMAL(12,6);
