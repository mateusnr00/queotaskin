-- Taxas do gateway, por faixa de valor, e a marca de aprovação manual.
--
-- As duas mudanças resolvem o mesmo problema por lados diferentes: o relatório
-- contava como receita dinheiro que não chegou. Um pedaço nunca chegou porque
-- o gateway descontou a taxa antes; o outro nunca existiu, porque foi um admin
-- marcando a reserva como paga no painel.

ALTER TABLE "Reservation"
  ADD COLUMN "aprovadaNoPainel" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "TaxaDeGateway" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "apartirDe" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "percentual" DECIMAL(6,3) NOT NULL DEFAULT 0,
    "fixo" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxaDeGateway_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TaxaDeGateway_tenantId_provider_apartirDe_key"
  ON "TaxaDeGateway"("tenantId", "provider", "apartirDe");

CREATE INDEX "TaxaDeGateway_tenantId_provider_idx"
  ON "TaxaDeGateway"("tenantId", "provider");

ALTER TABLE "TaxaDeGateway"
  ADD CONSTRAINT "TaxaDeGateway_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
