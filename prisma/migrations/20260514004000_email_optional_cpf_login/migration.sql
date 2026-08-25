-- Torna User.email opcional. O login passa a ser por CPF (passwordless),
-- e o e-mail vira apenas um dado de contato opcional. O unique se mantém:
-- Postgres permite múltiplos NULLs em colunas unique.

ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;
