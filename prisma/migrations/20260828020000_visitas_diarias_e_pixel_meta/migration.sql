-- Contador de visitas por dia, e a configuração de anúncio da Meta.
--
-- VISITAS
--
-- Uma linha por dia, e não por acesso. O painel precisa de "hoje", "ontem" e
-- "total"; uma tabela com uma linha por pageview chegaria a milhões de linhas
-- para responder três números.
--
-- Duas contagens porque são perguntas diferentes: `visitas` conta cada página
-- aberta, que mede movimento e compara com o gasto de anúncio; `visitantes`
-- conta pessoa distinta no dia, que não infla com recarregamento.
--
-- O dia é DATE, na meia-noite de Brasília: "visitas de hoje" tem de virar
-- quando vira o dia aqui, não no fuso do servidor.
CREATE TABLE "VisitaDiaria" (
  "id"         TEXT NOT NULL,
  "tenantId"   TEXT NOT NULL,
  "dia"        DATE NOT NULL,
  "visitas"    INTEGER NOT NULL DEFAULT 0,
  "visitantes" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "VisitaDiaria_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VisitaDiaria_tenantId_dia_key" ON "VisitaDiaria"("tenantId", "dia");
CREATE INDEX "VisitaDiaria_tenantId_dia_idx" ON "VisitaDiaria"("tenantId", "dia");

ALTER TABLE "VisitaDiaria"
  ADD CONSTRAINT "VisitaDiaria_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- PIXEL DA META
--
-- Só o id. O token de API de conversões nao entra aqui: ele é segredo de
-- servidor e mereceria a mesma criptografia das credenciais de pagamento,
-- que é assunto de outro dia. Com o id, o navegador já reporta PageView,
-- InitiateCheckout e Purchase, que é o que fecha o ciclo do anúncio.
ALTER TABLE "Tenant" ADD COLUMN "metaPixelId" TEXT;
