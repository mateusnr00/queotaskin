// Minha conta → Programa de Afiliados.
//
// A regra é uma frase: cada pessoa que você indicar pode liberar UM Cupom de
// Entrada de R$ 10, quando ela acumular R$ 10 em pagamentos confirmados. Não
// é progressivo, e a página não pode sugerir que seja.
//
// Por isso não existe mais uma barra de "progresso do afiliado". Aquele número
// somava o dinheiro de todo mundo e prometia a próxima entrada logo ali;
// agora o progresso é de cada indicado, e aparece na lista deles, discreto.
// Em cima ficam as três contagens que respondem "como estou indo": indicados,
// em progresso, qualificados.
//
// Quem ainda não é afiliado vê o convite e entra na hora, num clique.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowRight, Gift, Link2, Ticket, Users2 } from "lucide-react";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getCurrentTenant } from "@/lib/tenant";
import { formatBRL } from "@/lib/format";
import { emReais, linkDeIndicacao } from "@/lib/afiliados";
import {
  historicoDoAfiliado,
  indicadosDoAfiliado,
  painelDoAfiliado,
} from "@/server/services/afiliados";
import { BotaoDeCopiar } from "@/components/afiliados/painel";
import { BotaoDeAtivacao } from "@/components/afiliados/botao-de-ativacao";
import { FormularioDeCodigo } from "@/components/afiliados/formulario-de-codigo";
import { Etiqueta, Moldura } from "@/components/ui/moldura";
import { EmblemaDoTime } from "@/components/times/emblema-do-time";
import { listarTimesAtivos } from "@/server/services/times";

export const metadata: Metadata = { title: "Programa de Afiliados" };

const TEXTO_DO_MOVIMENTO: Record<string, string> = {
  COMPRA_DE_INDICADO: "Compra de indicado",
  ENTRADA_LIBERADA: "Cupom de Entrada liberado",
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
      <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6 md:py-8">
        <Cabecalho />
        <Moldura>
          <section className="space-y-4 p-5 md:p-6">
            <h2 className="text-base font-bold">
              Indique amigos e ganhe Cupons de Entrada
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Quando uma pessoa indicada acumular{" "}
              <b className="font-semibold text-foreground">R$ 10,00</b> em
              pagamentos confirmados, você recebe 1 Cupom de Entrada de R$
              10,00. Cada pessoa indicada pode liberar somente um cupom.
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
      </div>
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
  const valorDoCupom = formatBRL(emReais(painel.valorDoCupomEmCentavos));
  const limiar = formatBRL(emReais(painel.limiarEmCentavos));

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 px-4 py-6 md:py-8">
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

      {/* O LINK PRIMEIRO. É o que a pessoa veio buscar; tudo o mais é
          consequência dele. */}
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
        <Moldura>
          <section className="flex h-full flex-col justify-between gap-4 p-5 md:p-6">
            <div>
              <p className="flex items-center gap-2 text-[11px] font-bold tracking-[0.18em] text-muted-foreground uppercase">
                <Ticket aria-hidden className="h-3.5 w-3.5" />
                Cupons de Entrada disponíveis
              </p>
              <p className="mt-2 text-5xl font-black tracking-tight text-emerald-400 tabular-nums">
                {painel.disponiveis}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                Cada cupom vale {valorDoCupom} e cobre uma cota de até{" "}
                {valorDoCupom}, em qualquer campanha. É consumido por inteiro e
                não deixa troco. Cada campanha aceita um.
                {painel.reservadas > 0 &&
                  ` ${painel.reservadas} ${
                    painel.reservadas === 1 ? "está preso" : "estão presos"
                  } a compras aguardando pagamento.`}
              </p>
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

        {/* O RESUMO DAS INDICAÇÕES, no lugar da antiga barra de progresso.
            Duas contagens, e a explicação da regra embaixo: é o que responde
            "de onde vem o próximo cupom" sem inventar um progresso somado. */}
        <Moldura>
          <section className="flex h-full flex-col justify-center gap-3 p-5 md:p-6">
            <p className="flex items-center gap-2 text-[11px] font-bold tracking-[0.18em] text-muted-foreground uppercase">
              <Users2 aria-hidden className="h-3.5 w-3.5" />
              Suas indicações
            </p>
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
              <p className="text-2xl font-black tracking-tight tabular-nums">
                {painel.indicadosEmProgresso}
                <span className="ml-1.5 text-xs font-semibold text-muted-foreground">
                  em progresso
                </span>
              </p>
              <p className="text-2xl font-black tracking-tight text-emerald-400 tabular-nums">
                {painel.indicadosQualificados}
                <span className="ml-1.5 text-xs font-semibold text-muted-foreground">
                  qualificados
                </span>
              </p>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Quando uma pessoa indicada acumular {limiar} em pagamentos
              confirmados, você recebe um Cupom de Entrada de {valorDoCupom}.
              Cada pessoa indicada pode liberar somente um cupom.
            </p>
          </section>
        </Moldura>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Numero
          rotulo="Indicados"
          valor={painel.indicados}
          icone={<Users2 aria-hidden className="h-3.5 w-3.5" />}
        />
        <Numero
          rotulo="Cupons conquistados"
          valor={painel.conquistadas}
          icone={<Gift aria-hidden className="h-3.5 w-3.5" />}
        />
        <Numero
          rotulo="Reservados"
          valor={painel.reservadas}
          icone={<Ticket aria-hidden className="h-3.5 w-3.5" />}
        />
        <Numero
          rotulo="Utilizados"
          valor={painel.usadas}
          icone={<Ticket aria-hidden className="h-3.5 w-3.5" />}
        />
      </div>

      {/* Os indicados, com o progresso de cada um. Nome mascarado e nada mais:
          quem indica não vira dono dos dados de quem foi indicado. */}
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
                const porcento = Math.min(
                  100,
                  Math.round((i.pagoEmCentavos / i.limiarEmCentavos) * 100),
                );
                return (
                  <li key={i.id} className="flex items-center gap-3 py-2.5">
                    {time ? (
                      <EmblemaDoTime time={time} tamanho="sm" />
                    ) : (
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-[11px] font-bold text-muted-foreground">
                        {indice + 1}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{i.nome}</p>
                      {!i.qualificado && (
                        <div className="mt-1 flex items-center gap-2">
                          <span
                            className="h-1.5 w-20 overflow-hidden rounded-full bg-white/[0.08]"
                            role="progressbar"
                            aria-valuenow={porcento}
                            aria-valuemin={0}
                            aria-valuemax={100}
                          >
                            <span
                              className="block h-full rounded-full bg-emerald-500/70"
                              style={{ width: `${porcento}%` }}
                            />
                          </span>
                          <span className="text-[11px] text-muted-foreground tabular-nums">
                            {formatBRL(emReais(i.pagoEmCentavos))} de{" "}
                            {formatBRL(emReais(i.limiarEmCentavos))}
                          </span>
                        </div>
                      )}
                    </div>
                    <span
                      className={
                        i.qualificado
                          ? "shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold tracking-wide text-emerald-400 uppercase"
                          : "shrink-0 rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-bold tracking-wide text-muted-foreground uppercase"
                      }
                    >
                      {i.qualificado ? "Qualificado" : "Em progresso"}
                    </span>
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
              Nada por aqui ainda. Cada compra dos seus indicados, cada cupom
              liberado e cada cupom usado aparece nesta lista.
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
                      {m.campanha ? ` · ${m.campanha}` : ""}
                    </p>
                  </div>
                  <p
                    className={
                      m.entradas !== 0
                        ? m.entradas > 0
                          ? "shrink-0 text-sm font-bold text-emerald-400 tabular-nums"
                          : "shrink-0 text-sm font-bold text-muted-foreground tabular-nums"
                        : m.centavos >= 0
                          ? "shrink-0 text-sm font-bold tabular-nums"
                          : "shrink-0 text-sm font-bold text-red-400 tabular-nums"
                    }
                  >
                    {m.entradas !== 0
                      ? `${m.entradas > 0 ? "+" : ""}${m.entradas} 🎟️`
                      : `${m.centavos >= 0 ? "+" : "-"}${formatBRL(
                          Math.abs(emReais(m.centavos)),
                        )}`}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </Moldura>
    </div>
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
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
        Cada pessoa que você indicar pode liberar 1 Cupom de Entrada de R$
        10,00.
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
  valor: number;
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
