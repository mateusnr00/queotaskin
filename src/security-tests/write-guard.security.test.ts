// §27 - a trava de escrita é BY CONSTRUCTION, não por disciplina.
// Este teste NÃO usa suiteDeIntegracao de propósito: prova que, mesmo assim,
// uma escrita é impossível quando a barreira de ambiente não foi satisfeita.
import { expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { integracaoLiberada } from "@/test/integration-setup";

it("escrita direta sem passar pelo helper é bloqueada quando a barreira não libera", async () => {
  const tentativa = prisma.paymentWebhookEvent.create({
    data: { provider: "SYNCPAY", externalId: `GUARD-${Date.now()}`, payload: {} },
  });
  if (integracaoLiberada) {
    // Com opt-in + sentinela, a escrita é permitida (e limpamos).
    const criado = await tentativa;
    await prisma.paymentWebhookEvent.delete({ where: { id: criado.id } });
  } else {
    // Sem a barreira, a própria camada db recusa a escrita.
    await expect(tentativa).rejects.toThrow(/barreira de ambiente/);
  }
});
