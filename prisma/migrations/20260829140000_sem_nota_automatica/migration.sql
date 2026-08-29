-- Apaga a nota automática que o sorteio ao vivo gravava no card de ganhador.
--
-- O texto era gerado por nós, sempre no mesmo formato, e repetia em jargão o
-- que a página do sorteio já mostra em tabela com link clicável. Embaixo do
-- nome de quem levou a skin, virava ruído.
--
-- O LIKE é estreito de propósito: casa só o texto que este sistema escreveu.
-- Recado escrito à mão pelo admin não começa com "Sorteio automático DRW-",
-- então nenhum sobrevive por acidente, e nenhum é perdido.
UPDATE "Raffle"
SET "winnerNote" = NULL
WHERE "winnerNote" LIKE 'Sorteio automático DRW-%';
