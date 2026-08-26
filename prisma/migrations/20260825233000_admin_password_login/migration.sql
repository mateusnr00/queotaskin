-- Login do painel por e-mail e senha.
--
-- O site inteiro autenticava por nome + celular, sem senha, inclusive o
-- admin. Isso serve ao participante (fricção zero na compra), mas não a quem
-- opera a plataforma: nome e celular do dono circulam publicamente, e com
-- eles se entrava no painel que vê CPF, telefone e pagamento de todo mundo.
--
-- passwordHash já existia na tabela, marcado como legado e sempre NULL.
-- Passa a ser usado, e só para contas ADMIN/SUPER_ADMIN.
ALTER TABLE "User"
  ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
