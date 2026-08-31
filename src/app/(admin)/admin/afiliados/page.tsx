// Painel → Afiliados.
//
// Uma tela só, com a lista de quem já é afiliado e a busca para transformar
// alguém em afiliado. Não existe autoinscrição: o programa dá benefício que
// vale dinheiro em cota, e quem entra é decisão de quem opera.

import type { Metadata } from "next";
import { Link2 } from "lucide-react";

import { requireAdmin } from "@/lib/auth-helpers";
import { getActiveTenantIdForAdmin } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import {
  AFILIADOS_POR_PAGINA,
  listarAfiliados,
} from "@/server/services/afiliados";
import { LIMIAR_DA_ENTRADA_EM_CENTAVOS } from "@/lib/afiliados";
import { CabecalhoDeAdmin } from "@/components/admin/cabecalho";
import { GerenciadorDeAfiliados } from "@/components/admin/gerenciador-de-afiliados";

export const metadata: Metadata = { title: "Afiliados" };

export default async function AdminAfiliadosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await requireAdmin();
  const tenantId = await getActiveTenantIdForAdmin(session.user);
  const { q } = await searchParams;
  const busca = (q ?? "").trim();

  const [afiliados, totalDeAfiliados] = await Promise.all([
    listarAfiliados(busca),
    prisma.affiliate.count(),
  ]);

  // Candidatos: contas do tenant que ainda não são afiliadas. Só busca por
  // nome ou telefone, e só quando alguém digitou algo: uma lista de todos os
  // clientes aqui não ajudaria a achar ninguém.
  const candidatos =
    busca.length >= 2
      ? await prisma.user.findMany({
          where: {
            affiliate: null,
            OR: [
              { name: { contains: busca, mode: "insensitive" } },
              { phone: { contains: busca.replace(/\D/g, "") || "@" } },
            ],
          },
          orderBy: { createdAt: "desc" },
          take: 8,
          select: { id: true, name: true, phone: true },
        })
      : [];

  return (
    <div className="max-w-6xl space-y-5">
      <CabecalhoDeAdmin
        etiqueta="Programa"
        icone={<Link2 aria-hidden className="h-3 w-3" />}
        titulo="Afiliados"
        migalha={[{ rotulo: "Admin", href: "/admin" }, { rotulo: "Afiliados" }]}
      />

      <GerenciadorDeAfiliados
        afiliados={afiliados.map((a) => ({
          ...a,
          desde: a.desde.toISOString(),
        }))}
        candidatos={candidatos}
        busca={busca}
        total={totalDeAfiliados}
        porPagina={AFILIADOS_POR_PAGINA}
        limiarEmCentavos={LIMIAR_DA_ENTRADA_EM_CENTAVOS}
        tenantId={tenantId}
      />
    </div>
  );
}
