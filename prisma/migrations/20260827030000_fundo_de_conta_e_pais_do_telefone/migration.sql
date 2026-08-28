-- Arte de fundo das telas de conta, por site.
ALTER TABLE "Tenant" ADD COLUMN "authBackgroundUrl" TEXT;

-- País do telefone. Default BR porque todo cadastro existente é brasileiro:
-- o formulário só aceitava DDD mais 8 ou 9 dígitos até agora, então marcar
-- as linhas antigas de outro jeito seria inventar dado.
ALTER TABLE "User" ADD COLUMN "phoneCountry" TEXT NOT NULL DEFAULT 'BR';
