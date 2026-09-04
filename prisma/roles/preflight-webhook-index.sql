-- Preflight READ-ONLY do unique index de PaymentWebhookEvent (P1-C §11). O
-- operador roda no banco alvo (DIRECT_URL). NAO escreve nada.
SELECT count(*) AS total_eventos FROM "PaymentWebhookEvent";
-- 0 = sem lock relevante; <100k normal; 100k-1M janela baixa; >1M CONCURRENTLY.
SELECT provider, "providerEventId", count(*) AS dup
  FROM "PaymentWebhookEvent" WHERE "providerEventId" IS NOT NULL
  GROUP BY 1,2 HAVING count(*) > 1;                 -- esperado: 0 linhas
SELECT indexname FROM pg_indexes
  WHERE tablename='PaymentWebhookEvent' AND indexname LIKE '%providerEventId%'; -- ja existe?
