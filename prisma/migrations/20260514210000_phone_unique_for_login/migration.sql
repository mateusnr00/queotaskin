-- Login passa de CPF (passwordless) pra nome + celular (sem senha, mas dois
-- campos exigidos). Celular vira o identificador único; nome é verificado
-- por cima. Múltiplos NULLs continuam permitidos pelo Postgres em coluna
-- unique, então contas legadas sem celular não quebram a migration — só
-- não conseguem logar até cadastrarem o celular via admin.

CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");
