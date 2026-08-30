import type { Metadata } from "next";

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
  const entregas = await listDeliveries(tenantId);

  return <TabelaDeEntregas entregas={entregas} />;
}
