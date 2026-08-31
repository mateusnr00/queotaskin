// Minha conta → Programa de Afiliados.
//
// A página existe para uma pessoa que já topou divulgar. Ela precisa de três
// coisas, nesta ordem: o link para mandar agora, quanto falta para a próxima
// Entrada Grátis, e a prova de que o que ela fez virou alguma coisa. O resto
// (histórico, lista de indicados) é conferência, e fica embaixo.
//
// Quem não é afiliado não vê painel nenhum: vê o convite e, se tiver um
// código de quem o indicou, o campo para aplicá-lo. Mostrar métricas zeradas
// para quem não participa não convida ninguém, só ocupa tela.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ArrowRight,
  Gift,
  Link2,
  Ticket,
  TrendingUp,
  Users2,
} from "lucide-react";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getCurrentTenant } from "@/lib/tenant";
import { formatBRL } from "@/lib/format";
import { emReais, faltaParaProximaEntrada, linkDeIndicacao } from "@/lib/afiliados";
import {
  historicoDoAfiliado,
  indicadosDoAfiliado,
  painelDoAfiliado,
} from "@/server/services/afiliados";
import { BotaoDeCopiar } from "@/components/afiliados/painel";
import { FormularioDeCodigo } from "@/components/afiliados/formulario-de-codigo";
import { Etiqueta, Moldura } from "@/components/ui/moldura";
import { EmblemaDoTime } from "@/components/times/emblema-do-time";
import { listarTimesAtivos } from "@/server/services/times";

export const metadata: Metadata = { title: "Programa de Afiliados" };

const TEXTO_DO_MOVIMENTO: Record<string, string> = {
  COMPRA_DE_INDICADO: "Compra de indicado",
  ENTRADA_LIBERADA: "Entrada Grátis desbloqueada",
  ENTRADA_USADA: "Entrada Grátis utilizada",
  ENTRADA_DEVOLVIDA: "Entrada Grátis devolvida",
  ESTORNO_DE_COMPRA: "Compra estornada",
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
        name: true,
        referredByAffiliate: {
          select: { code: true, user: { select: { name: true } } },
        },
      },
    }),
  ]);

  // Ainda não é afiliado: o convite, e a chance de registrar quem o indicou.
  if (!painel || painel.status === "INACTIVE") {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6 md:py-8">
        <Cabecalho />
        <Moldura>
          <section className="space-y-3 p-5 md:p-6">
            <h2 className="text-base font-bold">
              Você ainda não faz parte do programa
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              O programa é liberado pela equipe, uma conta por vez. Fale com a
              gente pelo suporte se quiser divulgar as campanhas: a cada R$ 10
              em compras dos seus indicados, você ganha uma Entrada Grátis, que
              vale uma cota em qualquer sorteio.
            </p>
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
  const falta = faltaParaProximaEntrada(
    painel.progressoEmCentavos,
    painel.limiarEmCentavos,
  );
  const porcento = Math.min(
    100,
    Math.round((painel.progressoEmCentavos / painel.limiarEmCentavos) * 100),
  );
  const timePorId = new Map(times.map((t) => [t.id, t]));

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 px-4 py-6 md:py-8">
      <Cabecalho />

      {painel.status === "SUSPENDED" && (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
          <p className="font-semibold text-amber-700 dark:text-amber-300">
            Seu programa está suspenso
          </p>
          <p className="text-amber-700/80 dark:text-amber-300/80">
            Novas indicações não estão sendo contadas. As Entradas Grátis que
            você já tem continuam valendo. Fale com o suporte.
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

      {/* As entradas, em destaque, com o progresso logo ao lado: o saldo
          responde "o que eu tenho" e a barra responde "quando vem a próxima",
          e as duas perguntas são feitas juntas. */}
      <div className="grid gap-4 md:grid-cols-2">
        <Moldura>
          <section className="flex h-full flex-col justify-between gap-4 p-5 md:p-6">
            <div>
              <p className="flex items-center gap-2 text-[11px] font-bold tracking-[0.18em] text-muted-foreground uppercase">
                <Ticket aria-hidden className="h-3.5 w-3.5" />
                Entradas Grátis disponíveis
              </p>
              <p className="mt-2 text-5xl font-black tracking-tight text-emerald-400 tabular-nums">
                {painel.disponiveis}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                Use uma Entrada Grátis em qualquer sorteio, seja ele de R$ 1 ou
                de R$ 50. Cada campanha aceita uma.
                {painel.reservadas > 0 &&
                  ` ${painel.reservadas} ${
                    painel.reservadas === 1 ? "está presa" : "estão presas"
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

        <Moldura>
          <section className="flex h-full flex-col justify-center space-y-3 p-5 md:p-6">
            <p className="flex items-center gap-2 text-[11px] font-bold tracking-[0.18em] text-muted-foreground uppercase">
              <TrendingUp aria-hidden className="h-3.5 w-3.5" />
              Próxima entrada
            </p>
            <p className="text-2xl font-black tracking-tight tabular-nums">
              {formatBRL(emReais(painel.progressoEmCentavos))}
              <span className="text-base font-bold text-muted-foreground">
                {" "}
                / {formatBRL(emReais(painel.limiarEmCentavos))}
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
              em compras dos seus indicados para você ganhar mais uma Entrada
              Grátis.
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
          rotulo="Já compraram"
          valor={painel.indicadosAtivos}
          icone={<TrendingUp aria-hidden className="h-3.5 w-3.5" />}
        />
        <Numero
          rotulo="Entradas conquistadas"
          valor={painel.conquistadas}
          icone={<Gift aria-hidden className="h-3.5 w-3.5" />}
        />
        <Numero
          rotulo="Entradas usadas"
          valor={painel.usadas}
          icone={<Ticket aria-hidden className="h-3.5 w-3.5" />}
        />
      </div>

      {/* Os indicados. Só nome, time e desde quando: quem indica não vira dono
          dos dados de quem foi indicado. */}
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
              {indicados.map((i) => {
                const time = i.time ? timePorId.get(i.time) : null;
                return (
                  <li
                    key={i.id}
                    className="flex items-center gap-3 py-2.5 first:pt-0"
                  >
                    {time ? (
                      <EmblemaDoTime time={time} tamanho="sm" />
                    ) : (
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-[11px] font-bold text-muted-foreground">
                        {i.nome.slice(0, 1).toUpperCase()}
                      </span>
                    )}
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                      {primeiroNome(i.nome)}
                    </span>
                    <span
                      className={
                        i.comprou
                          ? "shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold tracking-wide text-emerald-400 uppercase"
                          : "shrink-0 rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-bold tracking-wide text-muted-foreground uppercase"
                      }
                    >
                      {i.comprou ? "Comprou" : "Só cadastro"}
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
              Nada por aqui ainda. Cada compra dos seus indicados, cada entrada
              desbloqueada e cada entrada usada aparece nesta lista.
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
        A cada R$ 10 em compras dos seus indicados, você ganha 1 Entrada
        Grátis. Cada Entrada Grátis vale uma cota em qualquer sorteio, e pode
        ser usada uma vez por campanha.
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

/** Nome curto: a lista é do afiliado, e não um cadastro de clientes. */
function primeiroNome(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  return partes.length > 1 ? `${partes[0]} ${partes[1]!.slice(0, 1)}.` : nome;
}
