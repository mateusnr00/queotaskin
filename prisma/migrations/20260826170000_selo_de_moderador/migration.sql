-- Selo de moderador, ligado por pessoa.
--
-- Começa desligado para todo mundo, inclusive para quem já é admin: mostrar
-- cargo no site é decisão de quem administra, não consequência do papel, e
-- ligar sozinho exporia contas de painel que hoje passam por cliente comum
-- na área pública.
ALTER TABLE "User" ADD COLUMN "showModBadge" BOOLEAN NOT NULL DEFAULT false;
