-- Os times saem do código e viram cadastro.
--
-- A lista fixa estava certa enquanto ninguém precisava mexer nela. Passou a
-- estar errada quando o pedido virou "quero enviar o escudo e adicionar times
-- novos": isso é cadastro, e cadastro não mora em deploy.
--
-- O id continua sendo o mesmo slug que User.favoriteTeamId já guarda, então
-- ninguém perde o time por causa desta migration.
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "cor" TEXT NOT NULL,
    "regiao" TEXT NOT NULL,
    "escudo" TEXT,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Team_ativo_regiao_ordem_idx" ON "Team"("ativo", "regiao", "ordem");

-- A lista que estava em código, agora como dado. ON CONFLICT porque esta
-- migration precisa poder rodar num banco que já tenha a tabela populada.
INSERT INTO "Team" ("id", "nome", "tag", "cor", "regiao", "ordem", "updatedAt")
VALUES
  ('furia', 'FURIA', 'FUR', '#111827', 'BR', 0, NOW()),
  ('mibr', 'MIBR', 'MIBR', '#1f2937', 'BR', 1, NOW()),
  ('pain', 'paiN Gaming', 'paiN', '#e11d48', 'BR', 2, NOW()),
  ('imperial', 'Imperial', 'IMP', '#a16207', 'BR', 3, NOW()),
  ('legacy', 'Legacy', 'LEG', '#7c3aed', 'BR', 4, NOW()),
  ('fluxo', 'Fluxo', 'FLX', '#0891b2', 'BR', 5, NOW()),
  ('red-canids', 'Red Canids', 'RED', '#dc2626', 'BR', 6, NOW()),
  ('sharks', 'Sharks Esports', 'SHK', '#0279b7', 'BR', 7, NOW()),
  ('oddik', 'ODDIK', 'ODK', '#16a34a', 'BR', 8, NOW()),
  ('case', 'Case Esports', 'CASE', '#0f766e', 'BR', 9, NOW()),
  ('navi', 'Natus Vincere', 'NAVI', '#facc15', 'INTER', 10, NOW()),
  ('faze', 'FaZe Clan', 'FaZe', '#dc2626', 'INTER', 11, NOW()),
  ('vitality', 'Team Vitality', 'VIT', '#eab308', 'INTER', 12, NOW()),
  ('g2', 'G2 Esports', 'G2', '#374151', 'INTER', 13, NOW()),
  ('spirit', 'Team Spirit', 'TS', '#1f2937', 'INTER', 14, NOW()),
  ('astralis', 'Astralis', 'AST', '#e11d48', 'INTER', 15, NOW()),
  ('liquid', 'Team Liquid', 'TL', '#1d4ed8', 'INTER', 16, NOW()),
  ('mouz', 'MOUZ', 'MOUZ', '#dc2626', 'INTER', 17, NOW()),
  ('heroic', 'Heroic', 'HER', '#0f766e', 'INTER', 18, NOW()),
  ('cloud9', 'Cloud9', 'C9', '#38bdf8', 'INTER', 19, NOW()),
  ('complexity', 'Complexity', 'COL', '#334155', 'INTER', 20, NOW()),
  ('falcons', 'Team Falcons', 'FLC', '#15803d', 'INTER', 21, NOW()),
  ('mongolz', 'The MongolZ', 'TMZ', '#b91c1c', 'INTER', 22, NOW()),
  ('eternal-fire', 'Eternal Fire', 'EF', '#ea580c', 'INTER', 23, NOW()),
  ('virtus-pro', 'Virtus.pro', 'VP', '#f97316', 'INTER', 24, NOW()),
  ('nip', 'Ninjas in Pyjamas', 'NIP', '#facc15', 'INTER', 25, NOW()),
  ('big', 'BIG', 'BIG', '#1e3a8a', 'INTER', 26, NOW()),
  ('ence', 'ENCE', 'ENCE', '#0d9488', 'INTER', 27, NOW()),
  ('gamerlegion', 'GamerLegion', 'GL', '#4f46e5', 'INTER', 28, NOW()),
  ('aurora', 'Aurora Gaming', 'AUR', '#7e22ce', 'INTER', 29, NOW())
ON CONFLICT ("id") DO NOTHING;
