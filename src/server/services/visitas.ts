// Contagem de visitas do site.
//
// O que se conta e por quê:
//
//   visitas     cada página aberta. É o número que mede movimento e o que se
//               compara com o gasto de anúncio.
//   visitantes  pessoa distinta no dia. Não infla quando alguém recarrega, e
//               é o denominador honesto de "quantos viram e quantos
//               compraram".
//
// Uma linha por dia, e não por acesso. O painel precisa de três números,
// hoje, ontem e total; guardar um registro por pageview daria milhões de
// linhas para respondê-los.

import { prisma } from "@/lib/db";

/** O fuso do negócio. "Hoje" tem de virar quando vira o dia aqui. */
export const TZ = "America/Sao_Paulo";

/**
 * A meia-noite de um dia em Brasília, como Date.
 *
 * Feito por formatação e não por subtração de horas: com offset fixo, o
 * horário de verão (se voltar) erraria o dia inteiro por uma hora.
 */
export function diaEmBrasilia(quando: Date = new Date()): Date {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(quando);
  // en-CA entrega AAAA-MM-DD, que é o que o Date entende como UTC puro.
  return new Date(`${partes}T00:00:00.000Z`);
}

/**
 * Registra um acesso.
 *
 * `visitanteNovoNoDia` vem de quem chama, que é quem enxerga os cookies do
 * navegador. O serviço não adivinha: aqui só entra a decisão já tomada.
 */
export async function registrarVisita(
  tenantId: string,
  visitanteNovoNoDia: boolean,
  quando: Date = new Date(),
): Promise<void> {
  const dia = diaEmBrasilia(quando);
  // upsert com increment: dois acessos no mesmo instante somam os dois, em
  // vez de um ler 10 e o outro gravar 11 por cima.
  await prisma.visitaDiaria.upsert({
    where: { tenantId_dia: { tenantId, dia } },
    create: { tenantId, dia, visitas: 1, visitantes: visitanteNovoNoDia ? 1 : 0 },
    update: {
      visitas: { increment: 1 },
      ...(visitanteNovoNoDia ? { visitantes: { increment: 1 } } : {}),
    },
  });
}

export interface ResumoDeVisitas {
  hoje: number;
  ontem: number;
  total: number;
  visitantesHoje: number;
}

/** Os três números do painel, numa consulta só por linha do tempo. */
export async function resumoDeVisitas(
  tenantId: string,
  quando: Date = new Date(),
): Promise<ResumoDeVisitas> {
  const hoje = diaEmBrasilia(quando);
  const ontem = new Date(hoje.getTime() - 24 * 60 * 60 * 1000);

  const [porDia, total] = await Promise.all([
    prisma.visitaDiaria.findMany({
      where: { tenantId, dia: { in: [hoje, ontem] } },
      select: { dia: true, visitas: true, visitantes: true },
    }),
    prisma.visitaDiaria.aggregate({
      where: { tenantId },
      _sum: { visitas: true },
    }),
  ]);

  const doDia = (d: Date) =>
    porDia.find((x) => x.dia.getTime() === d.getTime());

  return {
    hoje: doDia(hoje)?.visitas ?? 0,
    ontem: doDia(ontem)?.visitas ?? 0,
    total: total._sum.visitas ?? 0,
    visitantesHoje: doDia(hoje)?.visitantes ?? 0,
  };
}
