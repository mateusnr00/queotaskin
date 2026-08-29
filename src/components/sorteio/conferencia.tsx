"use client";

// A página onde o participante confere o sorteio sozinho.
//
// A conta roda NO NAVEGADOR DELE, com o mesmo código que o servidor usou para
// sortear. É a diferença entre um site que afirma que foi honesto e um site
// que entrega os números para a pessoa conferir. Se este componente
// discordasse do servidor, quem ganha a discussão é ele: o resultado que vale
// é o que a conta reproduz.
//
// O texto é escrito para quem não sabe o que é hash. Cada checagem diz o que
// significa em português, e a linguagem técnica fica embaixo, para quem quiser.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, Loader2, ShieldAlert, ShieldCheck, X } from "lucide-react";

import {
  conferirProva,
  ROTULO_DA_CHECAGEM,
  type Conferencia,
  type ProvaDoSorteio,
} from "@/lib/sorteio-justo";
import { cn } from "@/lib/utils";
import type { EstadoPublicoDoSorteio } from "@/server/services/sorteio-ao-vivo";

type Situacao =
  | { fase: "conferindo" }
  | { fase: "pronto"; ok: boolean; checagens: Conferencia }
  | { fase: "falha"; motivo: string };

export function ConferenciaDoSorteio({
  estado,
}: {
  estado: EstadoPublicoDoSorteio;
}) {
  // Nasce conferindo: a página só existe para dar esta resposta, e um estado
  // "parado" seria um quadro a mais antes de começar o que a pessoa veio ver.
  const [situacao, setSituacao] = useState<Situacao>({ fase: "conferindo" });

  const prova: ProvaDoSorteio | null = useMemo(
    () =>
      estado.resultado &&
    estado.prova.serverSeedHash &&
    estado.prova.clientSeed &&
    estado.prova.hmacHex &&
    estado.prova.winnerIndex != null
        ? {
            serverSeedHash: estado.prova.serverSeedHash,
            serverSeed: estado.prova.serverSeed,
            clientSeed: estado.prova.clientSeed,
            nonce: estado.prova.nonce,
            ticketCount: estado.eligibleTicketCount,
            winnerIndex: estado.prova.winnerIndex,
            winningNumber: estado.resultado.numero,
            hmacHex: estado.prova.hmacHex,
          }
        : null,
    [estado],
  );

  const conferir = useCallback(async () => {
    if (!prova) return;
    setSituacao({ fase: "conferindo" });

    // O navegador só entrega a caixa de criptografia em contexto seguro:
    // HTTPS, ou localhost. Fora disso `crypto.subtle` simplesmente não existe,
    // e a conta morreria com um "Cannot read properties of undefined" em
    // inglês na cara de quem veio conferir. O site roda em HTTPS, então isto
    // é para o caso de alguém abrir por um endereço sem cadeado.
    if (typeof crypto === "undefined" || !crypto.subtle) {
      setSituacao({
        fase: "falha",
        motivo:
          "Este navegador só faz a conta em endereços com cadeado (https). Abra esta página pelo endereço seguro do site.",
      });
      return;
    }

    try {
      // O manifesto vem do servidor, mas o HASH dele é calculado aqui. É o
      // que impede a conferência de ser teatro: se a lista entregue não for a
      // que disputou, o hash local não bate com o publicado e a checagem
      // reprova.
      const resposta = await fetch(
        `/api/sorteio/${estado.publicId}/manifesto`,
        { cache: "no-store" },
      );
      if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
      const { numeros } = (await resposta.json()) as { numeros: number[] };

      const { ok, checagens } = await conferirProva(prova, numeros);
      setSituacao({ fase: "pronto", ok, checagens });
    } catch (err) {
      setSituacao({
        fase: "falha",
        // A mensagem técnica vai junto, mas depois da frase em português: o
        // "HTTP 500" sozinho não diz nada para quem está do outro lado.
        motivo: `Não foi possível carregar a lista de títulos.${
          err instanceof Error ? ` (${err.message})` : ""
        }`,
      });
    }
  }, [estado.publicId, prova]);

  // Confere sozinho ao abrir. Um botão "conferir" que espera o clique deixa a
  // resposta escondida atrás de uma ação que a maioria não vai fazer, e a
  // pessoa que chegou aqui já disse o que queria abrindo a página.
  //
  // Num temporizador de zero, e não direto no corpo do efeito: `conferir` muda
  // estado na primeira linha, e mudar estado de forma síncrona dentro de um
  // efeito dispara renderização em cascata.
  useEffect(() => {
    if (!prova) return;
    const id = setTimeout(conferir, 0);
    return () => clearTimeout(id);
  }, [conferir, prova]);

  if (!prova) {
    return (
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center">
        <p className="text-sm text-white/70">
          O sorteio ainda não foi realizado.
        </p>
        <p className="mt-2 text-sm text-white/55">
          Quando terminar, publicamos aqui todos os números para você conferir
          o resultado com calma.
        </p>
        <Link
          href={`/sorteio/${estado.publicId}`}
          className="mt-4 inline-flex h-11 items-center rounded-xl border border-white/15 px-5 text-sm font-bold text-white"
        >
          Ver a transmissão
        </Link>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <Veredito situacao={situacao} aoRepetir={conferir} />

      {situacao.fase === "pronto" && (
        <ol className="space-y-2">
          {(Object.keys(situacao.checagens) as (keyof Conferencia)[]).map(
            (chave) => (
              <li
                key={chave}
                className={cn(
                  "flex items-start gap-3 rounded-xl border p-3",
                  situacao.checagens[chave]
                    ? "border-emerald-500/25 bg-emerald-500/[0.06]"
                    : "border-red-500/30 bg-red-500/[0.08]",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
                    situacao.checagens[chave]
                      ? "bg-emerald-500/20 text-emerald-300"
                      : "bg-red-500/20 text-red-300",
                  )}
                >
                  {situacao.checagens[chave] ? (
                    <Check className="h-3 w-3" />
                  ) : (
                    <X className="h-3 w-3" />
                  )}
                </span>
                <span className="text-sm leading-snug text-white/85">
                  {ROTULO_DA_CHECAGEM[chave]}
                </span>
              </li>
            ),
          )}
        </ol>
      )}

      <section className="rounded-2xl border border-white/10 bg-black/25 p-5">
        <h2 className="text-[11px] font-bold tracking-[0.16em] text-white/60 uppercase">
          O que foi conferido
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-white/70">
          O sorteio não usa sorteador: ele é uma conta. A chave secreta foi
          travada quando a campanha nasceu, e só o resumo dela ficou visível.
          No fim das vendas, a lista de títulos virou o segundo ingrediente. A
          conta entre os dois dá o título vencedor, e ela dá sempre o mesmo
          resultado, para qualquer pessoa que a refaça.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-white/70">
          Foi o seu navegador que refez essa conta agora, com a lista de{" "}
          {estado.eligibleTicketCount.toLocaleString("pt-BR")} títulos baixada
          desta página. Nada do que está acima veio pronto do nosso servidor.
        </p>

        <dl className="mt-4 space-y-2">
          <Valor rotulo="Sorteio" valor={estado.publicId} />
          <Valor
            rotulo="Chave travada antes das vendas"
            valor={prova.serverSeedHash}
          />
          <Valor rotulo="Chave publicada no fim" valor={prova.serverSeed} />
          <Valor rotulo="Lista de títulos (SHA-256)" valor={prova.clientSeed} />
          <Valor rotulo="Cálculo (HMAC-SHA256)" valor={prova.hmacHex} />
          <Valor
            rotulo="Posição sorteada"
            valor={`${prova.winnerIndex} (título ${prova.winningNumber})`}
          />
        </dl>
      </section>
    </div>
  );
}

function Veredito({
  situacao,
  aoRepetir,
}: {
  situacao: Situacao;
  aoRepetir: () => void;
}) {
  if (situacao.fase === "conferindo") {
    return (
      <section className="flex items-center justify-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
        <Loader2 aria-hidden className="h-5 w-5 animate-spin text-white/60" />
        <p role="status" className="text-sm text-white/70">
          Refazendo o sorteio no seu navegador...
        </p>
      </section>
    );
  }

  if (situacao.fase === "falha") {
    return (
      <section className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-center">
        <p className="text-sm font-bold text-red-200">
          Não deu para conferir agora.
        </p>
        <p className="mt-1 text-xs text-red-200/80">{situacao.motivo}</p>
        <button
          type="button"
          onClick={aoRepetir}
          className="mt-3 h-11 rounded-xl border border-red-400/40 px-5 text-sm font-bold text-red-100"
        >
          Tentar de novo
        </button>
      </section>
    );
  }

  return (
    <section
      role="status"
      className={cn(
        "rounded-2xl border p-6 text-center",
        situacao.ok
          ? "border-emerald-400/40 bg-emerald-500/[0.08]"
          : "border-red-500/40 bg-red-500/10",
      )}
    >
      {situacao.ok ? (
        <ShieldCheck
          aria-hidden
          className="mx-auto h-10 w-10 text-emerald-400"
        />
      ) : (
        <ShieldAlert aria-hidden className="mx-auto h-10 w-10 text-red-400" />
      )}
      <p
        className={cn(
          "mt-3 text-xl font-extrabold tracking-tight",
          situacao.ok ? "text-emerald-200" : "text-red-200",
        )}
      >
        {situacao.ok ? "Sorteio confere" : "A conferência não bateu"}
      </p>
      <p className="mt-1 text-sm text-white/70">
        {situacao.ok
          ? "A conta refeita aqui chegou exatamente ao número anunciado."
          : "Alguma parte da prova não bate. Veja abaixo qual delas e nos procure."}
      </p>
    </section>
  );
}

function Valor({
  rotulo,
  valor,
}: {
  rotulo: string;
  valor: string | null;
}) {
  if (!valor) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-black/30 p-3">
      <dt className="text-[10px] font-bold tracking-[0.12em] text-white/55 uppercase">
        {rotulo}
      </dt>
      <dd className="mt-1 font-mono text-[10px] leading-relaxed break-all text-white/70">
        {valor}
      </dd>
    </div>
  );
}
