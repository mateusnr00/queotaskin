-- Freio de tentativas de login.
--
-- O login do site é por nome + CPF, sem senha. Sem freio, quem tem uma lista
-- de CPFs vazados pode varrer o site testando combinações, e nada no caminho
-- reclamaria.
--
-- Em banco, e não em memória: cada requisição pode cair numa instância
-- diferente do servidor, e um contador em memória seria zerado a cada troca.
CREATE TABLE "LoginAttempt" (
  "chave"        TEXT NOT NULL,
  "falhas"       INTEGER NOT NULL DEFAULT 0,
  "desde"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "bloqueadoAte" TIMESTAMP(3),
  "atualizadoEm" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("chave")
);

-- Usado pela limpeza dos registros já vencidos.
CREATE INDEX "LoginAttempt_bloqueadoAte_idx" ON "LoginAttempt"("bloqueadoAte");
