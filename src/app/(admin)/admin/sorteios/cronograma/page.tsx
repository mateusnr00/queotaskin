import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, CalendarClock } from "lucide-react";

import { CabecalhoDeAdmin } from "@/components/admin/cabecalho";
import { CronogramaPainel } from "@/components/admin/cronograma-painel";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-helpers";
import { getActiveTenantIdForAdmin } from "@/lib/tenant";
import { carregarCronograma } from "@/server/services/cronograma";
import { contarVendidosPorRifa } from "@/server/services/vendidos";
import { validarParaFila } from "@/lib/cronograma";

export const metadata: Metadata = { title: "Cronograma de sorteios" };

/** Quantas linhas do histórico a tela mostra. */
const LINHAS_DO_HISTORICO = 20;

/** As ações do log que contam a história desta fila. */
const ACOES_DO_HISTORICO = [
  "cronograma.enfileirado",
  "cronograma.removido",
  "cronograma.pulado",
  "cronograma.reordenado",
  "cronograma.pausado",
  "cronograma.retomado",
  "cronograma.atraso_alterado",
  "cronograma.ativado_auto",
  "cronograma.ativado_manual",
  "cronograma.ciclo_concluido",
  "cronograma.falhou",
  // O fim do sorteio não é ação do cronograma, e entra aqui de propósito: é o
  // evento que explica por que a próxima campanha subiu naquele minuto.
  "sorteio.finalizado",
];

export default async function CronogramaPage() {
  const session = await requireAdmin();
  const tenantId = await getActiveTenantIdForAdmin(session.user);

  const { cronograma, itens } = await carregarCronograma(tenantId);

  // Candidatas: rascunhos do painel que ainda não estão na fila. A validação
  // roda aqui, no servidor, para a tela já dizer o que falta em cada uma antes
  // de alguém tentar enfileirar e tomar um erro.
  const rascunhos = await prisma.raffle.findMany({
    where: { tenantId, status: "DRAFT", itemDoCronograma: { is: null } },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      title: true,
      status: true,
      totalNumbers: true,
      pricePerNumber: true,
      isFree: true,
      privacy: true,
      _count: { select: { prizes: true } },
      images: { where: { isCover: true }, take: 1, select: { url: true } },
    },
  });

  const candidatas = rascunhos.map((r) => {
    const validacao = validarParaFila({
      status: r.status,
      title: r.title,
      totalNumbers: r.totalNumbers,
      pricePerNumber: Number(r.pricePerNumber),
      isFree: r.isFree,
      premios: r._count.prizes,
      temCapa: r.images.length > 0,
      privacy: r.privacy,
    });
    return {
      id: r.id,
      title: r.title,
      capa: r.images[0]?.url ?? null,
      totalNumbers: r.totalNumbers,
      erros: validacao.erros,
      avisos: validacao.avisos,
    };
  });

  // Campanhas no ar que a fila ainda não conhece. É o caso do primeiro dia:
  // sem poder adotar a que já está rodando, o cronograma só começaria a valer
  // depois de um ciclo inteiro acontecer por fora dele.
  const ativasForaDaFila = await prisma.raffle.findMany({
    where: { tenantId, status: "ACTIVE", itemDoCronograma: { is: null } },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { id: true, title: true },
  });

  const vendidos = await contarVendidosPorRifa(itens.map((i) => i.raffleId));

  const historico = await prisma.activityLog.findMany({
    where: { tenantId, acao: { in: ACOES_DO_HISTORICO } },
    orderBy: { criadoEm: "desc" },
    take: LINHAS_DO_HISTORICO,
    select: {
      id: true,
      acao: true,
      actorName: true,
      alvoRotulo: true,
      criadoEm: true,
    },
  });

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Link
          href="/admin/sorteios"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Voltar para sorteios
        </Link>

        <CabecalhoDeAdmin
          etiqueta="Campanhas"
          icone={<CalendarClock aria-hidden className="h-3 w-3" />}
          titulo="Cronograma de sorteios"
          descricao="Organize os próximos sorteios. Quando o sorteio atual for finalizado, o próximo da fila é ativado automaticamente. Nada disso aparece para quem visita o site."
          migalha={[
            { rotulo: "Admin", href: "/admin" },
            { rotulo: "Sorteios", href: "/admin/sorteios" },
            { rotulo: "Cronograma" },
          ]}
        />
      </div>

      <CronogramaPainel
        automacaoAtiva={cronograma.automacaoAtiva}
        atrasoEmSegundos={cronograma.atrasoEmSegundos}
        ultimoErro={cronograma.ultimoErro}
        ultimoErroEm={cronograma.ultimoErroEm?.toISOString() ?? null}
        itens={itens.map((i) => ({
          id: i.id,
          raffleId: i.raffleId,
          status: i.status,
          posicao: i.posicao,
          dia: i.dia ? i.dia.toISOString().slice(0, 10) : null,
          ativadoEm: i.ativadoEm?.toISOString() ?? null,
          ativadoPor: i.ativadoPor,
          concluidoEm: i.concluidoEm?.toISOString() ?? null,
          erro: i.erro,
          titulo: i.raffle.title,
          slug: i.raffle.slug,
          capa: i.raffle.capa,
          statusDaCampanha: i.raffle.status,
          totalNumbers: i.raffle.totalNumbers,
          vendidos: vendidos.get(i.raffleId) ?? 0,
        }))}
        candidatas={candidatas}
        ativasForaDaFila={ativasForaDaFila}
        historico={historico.map((h) => ({
          id: h.id,
          acao: h.acao,
          quem: h.actorName,
          alvo: h.alvoRotulo,
          quando: h.criadoEm.toISOString(),
        }))}
      />
    </div>
  );
}
