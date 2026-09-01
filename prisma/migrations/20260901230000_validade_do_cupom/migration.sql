-- O Cupom de Entrada passa a ter prazo: 72 horas a partir da concessão.
--
-- A coluna nasce NULA, e nulo quer dizer "sem validade". Os cupons que já
-- estão na mão de alguém não ganham prazo retroativo: prometer sem prazo e
-- cobrar prazo depois é tirar da pessoa o que ela já tinha.
ALTER TABLE "EntradaGratis" ADD COLUMN "expiraEm" TIMESTAMP(3);

-- O índice acompanha a consulta que passou a existir: cupons de um afiliado,
-- disponíveis, ainda dentro do prazo.
CREATE INDEX "EntradaGratis_affiliateId_estado_expiraEm_idx"
    ON "EntradaGratis"("affiliateId", "estado", "expiraEm");
