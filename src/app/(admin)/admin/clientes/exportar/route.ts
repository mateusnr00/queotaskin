import type { NextRequest } from "next/server";

import { requireAdmin } from "@/lib/auth-helpers";
import { getActiveTenantIdForAdmin } from "@/lib/tenant";
import { listCustomers, type CustomerSort } from "@/server/services/customers";
import { dataParaCsv, dinheiroParaCsv, gerarCsv } from "@/lib/csv";
import { formatCpf, formatPhone } from "@/lib/cpf";

// Exportação da base de clientes em CSV.
//
// Rota e não Server Action porque o resultado é um arquivo para baixar, e
// action devolve dados para a página, não um download.
//
// Leva a base inteira, não a página aberta: quem exporta quer a lista toda
// para mandar mensagem ou cruzar em planilha, e um arquivo com 25 linhas
// seria uma armadilha silenciosa, o download funciona e vem incompleto.
//
// Os filtros da tela são respeitados, então filtrar e exportar entrega
// exatamente o que está à vista.

/** Teto de segurança para não montar um arquivo gigante em memória. */
const MAXIMO_DE_LINHAS = 50_000;

const ORDENS: CustomerSort[] = ["spent", "recent", "purchases", "name"];

const PAPEL: Record<string, string> = {
  SUPER_ADMIN: "Dono da plataforma",
  ADMIN: "Admin",
  AFFILIATE: "Afiliado",
  PARTICIPANT: "Cliente",
};

export async function GET(request: NextRequest) {
  const session = await requireAdmin();
  const tenantId = await getActiveTenantIdForAdmin(session.user);

  const q = request.nextUrl.searchParams;
  const ordemPedida = q.get("sort") as CustomerSort | null;

  const { customers, total } = await listCustomers(tenantId, {
    // A busca única entra aqui junto com os campos específicos. Sem esta
    // linha o CSV sairia com a base inteira enquanto a tela mostra o
    // resultado de uma busca, que é exatamente o contrário do que o botão
    // promete: exportar o que está à vista.
    busca: q.get("busca") ?? undefined,
    nome: q.get("nome") ?? undefined,
    cpf: q.get("cpf") ?? undefined,
    email: q.get("email") ?? undefined,
    telefone: q.get("telefone") ?? undefined,
    sort: ordemPedida && ORDENS.includes(ordemPedida) ? ordemPedida : "spent",
    page: 1,
    pageSize: MAXIMO_DE_LINHAS,
  });

  const csv = gerarCsv(
    [
      "Nome",
      "CPF",
      "Celular",
      "E-mail",
      "Papel",
      "Total gasto (R$)",
      "Compras",
      "Numeros",
      "XP",
      "Ultima compra",
      "Cadastro",
    ],
    customers.map((c) => [
      c.name,
      c.cpf ? formatCpf(c.cpf) : "",
      c.phone ? formatPhone(c.phone) : "",
      c.email ?? "",
      PAPEL[c.role] ?? c.role,
      dinheiroParaCsv(c.spent),
      c.purchases,
      c.tickets,
      c.xp,
      dataParaCsv(c.lastPurchaseAt),
      dataParaCsv(c.createdAt),
    ]),
  );

  // Data no nome do arquivo: quem exporta duas vezes na mesma pasta fica com
  // "clientes (1).csv" e depois não sabe qual é o mais novo.
  const hoje = new Date().toISOString().slice(0, 10);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="clientes-${hoje}.csv"`,
      // Base de clientes não pode ficar em cache de proxy nenhum.
      "Cache-Control": "no-store, private",
      "X-Total-Exportado": String(Math.min(total, MAXIMO_DE_LINHAS)),
    },
  });
}
