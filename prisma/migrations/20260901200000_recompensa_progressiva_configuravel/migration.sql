-- Recompensa progressiva de novo, e configurável por afiliado.
--
-- A regra passa a ser: a cada R$ 10 pagos pelos indicados (todos eles somados),
-- o afiliado ganha 1 Cupom de Entrada de R$ 5, que é 50% de recompensa. O
-- limiar e a porcentagem podem ser configurados afiliado a afiliado no painel.
--
-- Sai a regra de "um cupom por indicado na vida": as colunas que a
-- sustentavam continuam na tabela, sem leitor, porque apagar coluna não tem
-- volta e elas contam o que aconteceu naquele período.
--
-- NENHUM CUPOM É APAGADO. Os que existem mantêm o valor de face que já
-- tinham; o que muda é o padrão dos próximos.

-- A configuração de cada afiliado. Os defaults são os globais, então quem
-- não for configurado continua no padrão sem nenhuma escrita.
ALTER TABLE "Affiliate"
  ADD COLUMN "usaConfigPropria" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "limiarEmCentavos" INTEGER NOT NULL DEFAULT 1000,
  ADD COLUMN "recompensaEmBps" INTEGER NOT NULL DEFAULT 5000,
  ADD COLUMN "valorDoCupomEmCentavos" INTEGER NOT NULL DEFAULT 500;

-- A configuração que originou cada cupom, para auditar sem depender do que o
-- afiliado tem configurado hoje.
ALTER TABLE "EntradaGratis"
  ADD COLUMN "limiarNaConcessao" INTEGER NOT NULL DEFAULT 1000,
  ADD COLUMN "bpsNaConcessao" INTEGER NOT NULL DEFAULT 5000;

-- Cupom já concedido guarda o valor com que nasceu.
--
-- Os que existem hoje nasceram na regra do cupom de R$ 10 e continuam valendo
-- R$ 10: a coluna já tinha esse default, então nada a reescrever. O default
-- muda só para os próximos, que nascem com R$ 5 (50% de R$ 10). Cupom antigo
-- com valor zerado, que não deveria existir, é corrigido para R$ 10, que era
-- a regra que o originou.
ALTER TABLE "EntradaGratis" ALTER COLUMN "valorEmCentavos" SET DEFAULT 500;
UPDATE "EntradaGratis" SET "valorEmCentavos" = 1000, "bpsNaConcessao" = 10000
 WHERE "valorEmCentavos" <= 0;
-- Os cupons da regra anterior valiam o limiar inteiro: 100% de recompensa.
UPDATE "EntradaGratis" SET "bpsNaConcessao" = 10000 WHERE "valorEmCentavos" = 1000;

ALTER TYPE "EstadoDaEntradaGratis" ADD VALUE 'CANCELADA';
ALTER TYPE "TipoDeMovimentoDeAfiliado" ADD VALUE 'CONFIG_ALTERADA';

-- A campanha decide se aceita cupom. Ligada por padrão: o programa já estava
-- valendo em todas, e desligar sozinho mudaria a regra pelas costas de quem já
-- tem cupom na mão.
ALTER TABLE "Raffle"
  ADD COLUMN "aceitaCupomDeAfiliado" BOOLEAN NOT NULL DEFAULT true;
