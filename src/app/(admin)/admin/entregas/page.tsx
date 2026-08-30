import type { Metadata } from "next";

import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-helpers";
import { getActiveTenantIdForAdmin } from "@/lib/tenant";
import { listDeliveries } from "@/server/services/deliveries";
import { TabelaDeEntregas } from "@/components/admin/tabela-de-entregas";

export const metadata: Metadata = { title: "Entregas" };

// Fila operacional pós-sorteio: quem ganhou, o que ganhou e para onde enviar.
// É a tela que se abre com a Steam do lado, então ela é uma tabela: varrer uma
// lista, e não ler cinco fichas.
export default async function AdminDeliveriesPage() {
  const session = await requireAdmin();
  const tenantId = await getActiveTenantIdForAdmin(session.user);
  const [entregas, tenant] = await Promise.all([
    listDeliveries(tenantId),
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { cnyToBrl: true, usdToBrl: true },
    }),
  ]);

  return (
    <TabelaDeEntregas
      entregas={entregas}
      // Decimal do Prisma não atravessa a fronteira servidor/cliente.
      taxas={{
        cnyToBrl: tenant?.cnyToBrl != null ? Number(tenant.cnyToBrl) : null,
        usdToBrl: tenant?.usdToBrl != null ? Number(tenant.usdToBrl) : null,
      }}
    />
  );
}
