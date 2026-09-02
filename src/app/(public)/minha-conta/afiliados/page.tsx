// Minha conta → Programa de Afiliados.
//
// A regra é uma frase, e a página inteira serve para ela ser entendida sem
// perguntar: a cada R$ 10 pagos pelas pessoas que você indicar, você recebe 1
// Cupom de Entrada de R$ 5.
//
// Três coisas precisam ficar impossíveis de não ver:
//
//   quanto falta       a barra do próximo cupom, com o valor que falta em
//                      reais. É ela que faz a pessoa mandar o link de novo.
//   quanto vale        os cupons aparecem UM A UM, com o valor de cada. Uma
//                      alteração administrativa faz cupom antigo e novo
//                      valerem diferente, e "saldo de R$ 17" seria mentira:
//                      não existe saldo, existem três cupons.
//   o que se perde     cupom de R$ 5 numa cota de R$ 2 abate R$ 2 e os R$ 3
//                      somem. Dito antes, não na hora da surpresa.
//
// Quem ainda não é afiliado vê o convite e entra na hora, num clique.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowRight, Gift, Link2, Ticket, TrendingUp, Users2 } from "lucide-react";

import { auth } from "@/auth";
import { ContainerPublico } from "@/components/public/container";
import { prisma } from "@/lib/db";
import { getCurrentTenant } from "@/lib/tenant";
import { formatBRL } from "@/lib/format";
import {
  emReais,
  linkDeIndicacao,
  porcentagemDosBps,
  HORAS_PARA_USAR_O_CUPOM,
} from "@/lib/afiliados";
import {
  historicoDoAfiliado,
  indicadosDoAfiliado,
  painelDoAfiliado,
} from "@/server/services/afiliados";
import { BotaoDeCopiar } from "@/components/afiliados/painel";
import { ContagemDoCupom } from "@/components/afiliados/contagem-do-cupom";
import { BotaoDeAtivacao } from "@/components/afiliados/botao-de-ativacao";
import { FormularioDeCodigo } from "@/components/afiliados/formulario-de-codigo";
import { Etiqueta, Moldura } from "@/components/ui/moldura";
import { EmblemaDoTime } from "@/components/times/emblema-do-time";
import { listarTimesAtivos } from "@/server/services/times";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Programa de Afiliados" };

const TEXTO_DO_MOVIMENTO: Record<string, string> = {
  COMPRA_DE_INDICADO: "Compra de indicado",
  ENTRADA_LIBERADA: "Cupom de Entrada liberado",
  CONFIG_ALTERADA: "Recompensa alterada pelo suporte",
  ENTRADA_USADA: "Cupom de Entrada utilizado",
  ENTRADA_DEVOLVIDA: "Cupom de Entrada devolvido",
  ESTORNO_DE_COMPRA: "Compra estornada",
  QUALIFICACAO_REVERTIDA: "Qualificação revertida",
  AJUSTE: "Ajuste do suporte",
};

export default async function PaginaDeAfiliados() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login?redirect=/minha-conta/afiliados");
  }
  const tenant = await getCurrentTenant();
  if (!tenant) notFound();

  const [painel, usuario] = await Promise.all([
    painelDoAfiliado(session.user.id),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        referredByAffiliate: {
          select: { code: true, user: { select: { name: true } } },
        },
      },
    }),
  ]);

  // Ainda não é afiliado: o convite, o botão que resolve num clique, e a
  // chance de registrar quem o indicou.
  if (!painel || painel.status === "INACTIVE") {
    return (
      <ContainerPublico className="space-y-5">
        <Cabecalho />
        <Moldura>
          <section className="space-y-4 p-5 md:p-6">
            <h2 className="text-base font-bold">
              Indique amigos e ganhe Cupons de Entrada
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              A cada{" "}
              <b className="font-semibold text-foreground">R$ 10,00</b> pagos
              pelas pessoas que você indicar, você recebe 1 Cupom de Entrada de{" "}
              <b className="font-semibold text-foreground">R$ 5,00</b>. Todas as
              suas indicações somam no mesmo progresso.
            </p>
            <BotaoDeAtivacao />
          </section>
        </Moldura>

        {usuario?.referredByAffiliate ? (
          <Moldura>
            <section className="p-5 md:p-6">
              <p className="text-sm">
                Você foi indicado por{" "}
                <b className="font-semibold">
                  {usuario.referredByAffiliate.user.name.split(" ")[0]}
                </b>{" "}
                <span className="font-mono text-xs text-muted-foreground">
                  ({usuario.referredByAffiliate.code})
                </span>
                .
              </p>
            </section>
          </Moldura>
        ) : (
          <FormularioDeCodigo />
        )}
      </ContainerPublico>
    );
  }

  const [historico, indicados, times] = await Promise.all([
    historicoDoAfiliado(session.user.id),
    indicadosDoAfiliado(session.user.id),
    listarTimesAtivos(),
  ]);

  const origem = `https://${tenant.host}`;
  const link = linkDeIndicacao(origem, painel.codigo);
  const timePorId = new Map(times.map((t) => [t.id, t]));

  const valorDoCupom = formatBRL(emReais(painel.config.valorDoCupomEmCentavos));
  const limiar = formatBRL(emReais(painel.config.limiarEmCentavos));
  const porcentagem = porcentagemDosBps(painel.config.recompensaEmBps);
  // Dívida de estorno não vira barra negativa na tela de quem divulga: o
  // progresso mostrado é zero, e o número real fica no painel administrativo.
  const progresso = Math.max(0, painel.progressoEmCentavos);
  const falta = Math.max(0, painel.config.limiarEmCentavos - progresso);
  const porcento = Math.min(
    100,
    Math.round((progresso / painel.config.limiarEmCentavos) * 100),
  );

  return (
    <ContainerPublico className="space-y-5">
      <Cabecalho />

      {painel.status === "SUSPENDED" && (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
          <p className="font-semibold text-amber-700 dark:text-amber-300">
            Seu programa está suspenso
          </p>
          <p className="text-amber-700/80 dark:text-amber-300/80">
            Novas indicações não estão sendo contadas. Os cupons que você já tem
            continuam valendo. Fale com o suporte.
          </p>
        </div>
      )}

      {/* A REGRA, ANTES DE QUALQUER NÚMERO. */}
      <Moldura>
        <section className="space-y-1.5 p-5 md:p-6">
          <h2 className="text-base font-bold">Seu programa de indicação</h2>
          <p className="text-sm leading-relaxed">
            A cada <b className="font-semibold">{limiar}</b> pagos pelas pessoas
            que você indicar, você recebe{" "}
            <b className="font-semibold">1 Cupom de Entrada de {valorDoCupom}</b>
            .
          </p>
          <p className="text-xs text-muted-foreground">
            Isso equivale a {porcentagem.toLocaleString("pt-BR")}% de
            recompensa.
          </p>
        </section>
      </Moldura>

      {/* O LINK. É o que a pessoa veio buscar. */}
      <Moldura>
        <section className="space-y-4 p-5 md:p-6">
          <div>
            <p className="text-[11px] font-bold tracking-[0.18em] text-muted-foreground uppercase">
              Seu link de indicação
            </p>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
              <p className="min-w-0 flex-1 truncate rounded-xl border border-border bg-muted/40 px-3 py-2.5 font-mono text-sm">
                {link}
              </p>
              <BotaoDeCopiar valor={link} rotulo="Copiar link" />
            </div>
          </div>

          <div>
            <p className="text-[11px] font-bold tracking-[0.18em] text-muted-foreground uppercase">
              Seu código
            </p>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
              <p className="min-w-0 flex-1 rounded-xl border border-primary/30 bg-primary/[0.07] px-3 py-2.5 font-mono text-lg font-extrabold tracking-widest text-primary">
                {painel.codigo}
              </p>
              <BotaoDeCopiar valor={painel.codigo} />
            </div>
          </div>
        </section>
      </Moldura>

      <div className="grid gap-4 md:grid-cols-2">
        {/* OS CUPONS, UM A UM. */}
        <Moldura>
          <section className="flex h-full flex-col justify-between gap-4 p-5 md:p-6">
            <div>
              <p className="flex items-center gap-2 text-[11px] font-bold tracking-[0.18em] text-muted-foreground uppercase">
                <Ticket aria-hidden className="h-3.5 w-3.5" />
                {painel.cupons.length === 1
                  ? "Você tem 1 Cupom de Entrada disponível"
                  : `Você tem ${painel.cupons.length} Cupons de Entrada disponíveis`}
              </p>

              {painel.cupons.length === 0 ? (
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Assim que as compras dos seus indicados somarem {limiar}, o
                  primeiro cupom aparece aqui.
                </p>
              ) : (
                <ul className="mt-3 flex flex-wrap gap-2">
                  {painel.cupons.map((c) => (
                    <li
                      key={c.id}
                      className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.08] px-3 py-2"
                    >
                      <span className="block text-sm font-black text-emerald-400 tabular-nums">
                        {formatBRL(emReais(c.valorEmCentavos))}
                      </span>
                      {/* A contagem embaixo do valor, e não ao lado: é a
                          segunda informação do cartão, não a primeira. */}
                      <ContagemDoCupom
                        expiraEm={c.expiraEm ? c.expiraEm.toISOString() : null}
                        className="mt-0.5"
                      />
                    </li>
                  ))}
                </ul>
              )}

              {/* A EXPLICAÇÃO OBRIGATÓRIA. Nada aqui é surpresa depois. */}
              <div className="mt-3 space-y-1.5 text-[11px] leading-relaxed text-muted-foreground">
                <p className="font-semibold text-foreground/80">
                  O cupom vale {HORAS_PARA_USAR_O_CUPOM} horas depois de
                  liberado. Passou do prazo, ele some.
                </p>
                <p>
                  O cupom é utilizado por completo em uma única cota e não deixa
                  saldo ou troco. Se você usar um cupom de {valorDoCupom} numa
                  cota de R$ 2,00, a cota fica de graça, mas o restante é
                  perdido.
                </p>
                <p>
                  Se a cota custar mais que o cupom, você paga só a diferença:
                  numa cota de R$ 12,00 com cupom de R$ 5,00, você paga R$ 7,00.
                </p>
                <p>Vale um cupom por sorteio.</p>
              </div>
            </div>

            <Link
              href="/sorteios"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-95"
            >
              Ver sorteios
              <ArrowRight aria-hidden className="h-4 w-4" />
            </Link>
          </section>
        </Moldura>

        {/* O PRÓXIMO CUPOM. */}
        <Moldura>
          <section className="flex h-full flex-col justify-center gap-3 p-5 md:p-6">
            <p className="flex items-center gap-2 text-[11px] font-bold tracking-[0.18em] text-muted-foreground uppercase">
              <TrendingUp aria-hidden className="h-3.5 w-3.5" />
              Próximo Cupom de Entrada
            </p>
            <p className="text-2xl font-black tracking-tight tabular-nums">
              {formatBRL(emReais(progresso))}
              <span className="text-base font-bold text-muted-foreground">
                {" "}
                de {limiar} acumulados
              </span>
            </p>
            <div
              className="h-2.5 w-full overflow-hidden rounded-full bg-white/[0.06]"
              role="progressbar"
              aria-valuenow={porcento}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-[width] duration-500"
                style={{ width: `${porcento}%` }}
              />
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Faltam{" "}
              <b className="font-semibold text-foreground">
                {formatBRL(emReais(falta))}
              </b>{" "}
              em compras confirmadas dos seus indicados.
            </p>
          </section>
        </Moldura>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Numero
          rotulo="Indicados"
          valor={String(painel.indicados)}
          icone={<Users2 aria-hidden className="h-3.5 w-3.5" />}
        />
        {/* O que ELE ganhou, e não o que os outros gastaram. O total em
            reais das compras dos indicados saiu daqui pelo mesmo motivo que
            saiu da lista: com um indicado só, o total é o extrato dele. */}
        <Numero
          rotulo="Cupons conquistados"
          valor={String(painel.conquistados)}
          icone={<TrendingUp aria-hidden className="h-3.5 w-3.5" />}
        />
        <Numero
          rotulo="Cupons reservados"
          valor={String(painel.reservados)}
          icone={<Ticket aria-hidden className="h-3.5 w-3.5" />}
        />
        <Numero
          rotulo="Cupons utilizados"
          valor={String(painel.usados)}
          icone={<Gift aria-hidden className="h-3.5 w-3.5" />}
        />
      </div>

      {/* Os indicados, sem dado pessoal e sem valor: nome mascarado e a
          barra de quanto falta para fechar o próximo cupom. */}
      <Moldura>
        <section className="p-5 md:p-6">
          <h2 className="text-base font-bold">Seus indicados</h2>
          {indicados.length === 0 ? (
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Ninguém entrou pelo seu link ainda. Mande para quem joga: a conta
              fica vinculada a você assim que a pessoa se cadastrar.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-white/[0.06]">
              {indicados.map((i, indice) => {
                const time = i.time ? timePorId.get(i.time) : null;
                return (
                  <li key={i.id} className="flex items-center gap-3 py-2.5">
                    {time ? (
                      <EmblemaDoTime time={time} tamanho="sm" />
                    ) : (
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-[11px] font-bold text-muted-foreground">
                        {indice + 1}
                      </span>
                    )}
                    {/* O quanto falta, e nunca o quanto a pessoa gastou. A
                        barra responde "falta muito?" sem entregar a vida
                        financeira de quem foi indicado, que não é de quem
                        mandou o link. */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="truncate text-sm font-semibold">
                          {i.nome}
                        </p>
                        <p
                          className={cn(
                            "shrink-0 text-[11px] font-semibold tabular-nums",
                            i.progresso.jaRendeu
                              ? "text-emerald-400"
                              : "text-muted-foreground",
                          )}
                        >
                          {i.progresso.jaRendeu ? 100 : i.progresso.percentual}%
                          {i.progresso.bpsAtual != null && (
                            <>
                              <span aria-hidden> · </span>
                              rende{" "}
                              {porcentagemDosBps(
                                i.progresso.bpsAtual,
                              ).toLocaleString("pt-BR")}
                              %
                            </>
                          )}
                        </p>
                      </div>
                      {/* Quem já rendeu fica com a barra CHEIA e VERDE, e não
                          volta a zero. A barra conta a história daquela
                          indicação ("deu certo"), e não o ciclo de compras
                          dela: zerar de novo pareceria que a pessoa desandou
                          justamente quando ela deu o que tinha para dar. */}
                      <div
                        role="progressbar"
                        aria-valuenow={i.progresso.jaRendeu ? 100 : i.progresso.percentual}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`Progresso de ${i.nome} até o Cupom de Entrada`}
                        className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.06]"
                      >
                        <div
                          className={cn(
                            "h-full rounded-full transition-[width] duration-500",
                            i.progresso.jaRendeu ? "bg-emerald-500" : "bg-primary",
                          )}
                          style={{
                            width: `${i.progresso.jaRendeu ? 100 : i.progresso.percentual}%`,
                          }}
                        />
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {/* Sem contar quantas vezes fechou: o número de ciclos
                            é o valor gasto escrito de outro jeito. */}
                        {i.progresso.jaRendeu
                          ? "Já rendeu Cupom de Entrada para você"
                          : i.progresso.percentual === 0
                            ? "Ainda não comprou"
                            : `A caminho dos ${formatBRL(emReais(painel.config.limiarEmCentavos))}`}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </Moldura>

      <Moldura>
        <section className="p-5 md:p-6">
          <h2 className="text-base font-bold">Atividade</h2>
          {historico.length === 0 ? (
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Nada por aqui ainda. Cada Cupom de Entrada liberado por um
              indicado que fechou {limiar} aparece nesta lista.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-white/[0.06]">
              {historico.map((m) => (
                <li key={m.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {m.descricao ?? TEXTO_DO_MOVIMENTO[m.tipo] ?? m.tipo}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {m.quando.toLocaleDateString("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                  <p
                    className={
                      m.entradas !== 0
                        ? m.entradas > 0
                          ? "shrink-0 text-sm font-bold text-emerald-400 tabular-nums"
                          : "shrink-0 text-sm font-bold text-muted-foreground tabular-nums"
                        : m.centavos > 0
                          ? "shrink-0 text-sm font-bold tabular-nums"
                          : m.centavos < 0
                            ? "shrink-0 text-sm font-bold text-red-400 tabular-nums"
                            : "shrink-0"
                    }
                  >
                    {m.entradas !== 0
                      ? `${m.entradas > 0 ? "+" : ""}${m.entradas} 🎟️`
                      : m.centavos !== 0
                        ? `${m.centavos >= 0 ? "+" : "-"}${formatBRL(
                            Math.abs(emReais(m.centavos)),
                          )}`
                        : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </Moldura>
    </ContainerPublico>
  );
}

function Cabecalho() {
  return (
    <header>
      <Etiqueta icone={<Link2 aria-hidden className="h-3 w-3" />}>
        Programa de Afiliados
      </Etiqueta>
      <h1 className="mt-2 text-2xl font-black tracking-tight md:text-3xl">
        Indique. Eles jogam. Você ganha.
      </h1>
      {/* Sem números aqui: a configuração é por afiliado, e o cartão logo
          abaixo diz a dele. Repetir o padrão neste ponto faria a página se
          contradizer para quem tem recompensa personalizada. */}
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
        Cada compra confirmada de quem você indicar vira progresso, e o
        progresso vira Cupom de Entrada.
      </p>
    </header>
  );
}

function Numero({
  rotulo,
  valor,
  icone,
}: {
  rotulo: string;
  valor: string;
  icone: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3.5">
      <p className="flex items-center gap-1.5 text-[10px] font-bold tracking-[0.14em] text-muted-foreground uppercase">
        {icone}
        {rotulo}
      </p>
      <p className="mt-1.5 text-2xl font-black tracking-tight tabular-nums">
        {valor}
      </p>
    </div>
  );
}
