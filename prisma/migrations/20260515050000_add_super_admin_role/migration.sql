-- Adiciona valor SUPER_ADMIN no enum Role.
-- Precisa estar numa migration separada porque o Postgres não permite usar
-- um valor de enum recém-adicionado na mesma transação em que foi criado.

ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'SUPER_ADMIN' BEFORE 'ADMIN';
