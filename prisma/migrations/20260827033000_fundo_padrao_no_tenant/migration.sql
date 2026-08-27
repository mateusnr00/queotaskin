-- Os sites que já existem ficam com a arte que estava embutida no código.
--
-- Sem isto a tela de conta perderia o fundo no deploy e só voltaria quando
-- alguém subisse a imagem no painel. E o código não teria como escolher
-- entre "arte embutida" e "sem arte", porque o arquivo do repositório existe
-- sempre: o caminho no banco é o que torna as duas situações distinguíveis.
UPDATE "Tenant" SET "authBackgroundUrl" = '/auth-fundo.webp'
WHERE "authBackgroundUrl" IS NULL;
