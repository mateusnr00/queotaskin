-- RECUPERACAO PERSISTENTE E INTERVALO NO BANCO.
--
-- Duas colunas, e as duas existem pelo mesmo motivo: nada que o cronograma
-- precisa lembrar pode viver na memoria de um processo. Servidor cai, deploy
-- troca a instancia no meio da contagem, autoscale mata a maquina que estava
-- segurando o intervalo: em todos esses casos a fila tem de continuar sozinha
-- quando o proximo minuto de cron chegar.

-- 1. A MARCA DE "ESTE FIM JA FOI PROCESSADO".
--
-- Sorteio FINISHED com esta coluna nula e trabalho pendente para o
-- reconciliador. Sem ela, a unica forma de saber se o gancho chegou a rodar
-- seria adivinhar pelo estado da fila, e adivinhacao em cima de dinheiro
-- vira sorteio publicado duas vezes ou nenhuma.
ALTER TABLE "Draw" ADD COLUMN "cronogramaProcessadoEm" TIMESTAMP(3);

-- OS SORTEIOS ANTIGOS JA NASCEM PROCESSADOS.
--
-- Esta linha e a mais importante da migration. Sem ela, no primeiro minuto
-- depois do deploy o reconciliador encontraria todo sorteio ja finalizado do
-- historico como "pendente" e tentaria puxar a fila por causa de um sorteio de
-- semanas atras. Marcar tudo como processado no momento da migration e o que
-- faz o recurso comecar do zero, olhando so para o que acontecer daqui para
-- frente.
UPDATE "Draw" SET "cronogramaProcessadoEm" = now() WHERE "status" = 'FINISHED';

-- O indice do reconciliador: ele procura exatamente esta condicao, de minuto
-- em minuto, e ela e quase sempre vazia. Parcial para o indice ter o tamanho
-- do trabalho pendente, e nao o tamanho do historico.
CREATE INDEX "Draw_fim_pendente_do_cronograma"
  ON "Draw"("finishedAt")
  WHERE "status" = 'FINISHED' AND "cronogramaProcessadoEm" IS NULL;

-- 2. A HORA DE LIBERACAO DO PROXIMO.
--
-- Calculada uma vez, quando o ciclo anterior termina, e gravada. O
-- reconciliador so pergunta se ja passou. Nula quer dizer que nao ha ativacao
-- pendente.
ALTER TABLE "DrawSchedule" ADD COLUMN "ativarApos" TIMESTAMP(3);
