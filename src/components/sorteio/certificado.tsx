"use client";

// O comprovante do sorteio.
//
// É o bloco que responde "como sei que isso não foi combinado". E a resposta
// deixou de ser "confie na gente": ele publica os quatro valores com que
// qualquer pessoa refaz o sorteio, e leva para a página onde o próprio
// navegador dela faz a conta.
//
// O QUE ESTÁ AQUI, E POR QUÊ
//
// - CHAVE TRAVADA (serverSeedHash): publicada quando a campanha foi criada,
//   antes da primeira venda. É o compromisso.
// - CHAVE PUBLICADA (serverSeed): a chave em si, só depois do resultado. O
//   SHA-256 dela tem que dar o hash de cima, e é isso que impede trocar a
//   chave depois de ver quem ganharia.
// - LISTA DE TÍTULOS (clientSeed): o SHA-256 dos títulos que disputaram. Muda
//   se um único título entrar ou sair.
// - CÁLCULO (hmacHex) e POSIÇÃO (winnerIndex): o resultado da conta.
//
// Aparece só depois da revelação. Antes disso metade destes valores não
// existe publicamente, e mostrar a outra metade seria enfeite.

import Link from "next/link";
import { ShieldCheck } from "lucide-react";

import { numeroDoTitulo } from "@/lib/titulo";
import type { EstadoPublicoDoSorteio } from "@/server/services/sorteio-ao-vivo";

function dataCompleta(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(iso));
}

export function CertificadoDoSorteio({
  estado,
}: {
  estado: EstadoPublicoDoSorteio;
}) {
  if (!estado.resultado || !estado.drawExecutedAt) return null;

  const linhas: { rotulo: string; valor: string; mono?: boolean }[] = [
    { rotulo: "Sorteio", valor: estado.publicId, mono: true },
    { rotulo: "Campanha", valor: estado.campanha.titulo },
    { rotulo: "Realizado em", valor: dataCompleta(estado.drawExecutedAt) },
    {
      rotulo: "Número sorteado",
      valor: numeroDoTitulo(
        estado.resultado.numero,
        estado.campanha.totalNumbers,
      ),
      mono: true,
    },
    {
      rotulo: "Títulos elegíveis",
      valor: estado.eligibleTicketCount.toLocaleString("pt-BR"),
    },
    ...(estado.prova.winnerIndex != null
      ? [
          {
            rotulo: "Posição sorteada",
            valor: `${(estado.prova.winnerIndex + 1).toLocaleString("pt-BR")} de ${estado.eligibleTicketCount.toLocaleString("pt-BR")}`,
            mono: true,
          },
        ]
      : []),
    { rotulo: "Método", valor: estado.rngMethod, mono: true },
    { rotulo: "Versão do sorteio", valor: String(estado.drawVersion) },
  ];

  const chaves: { rotulo: string; valor: string | null; nota: string }[] = [
    {
      rotulo: "Chave travada antes das vendas (SHA-256)",
      valor: estado.prova.serverSeedHash,
      nota: "Publicada quando a campanha foi criada.",
    },
    {
      rotulo: "Chave publicada agora",
      valor: estado.prova.serverSeed,
      nota: "O SHA-256 dela tem que dar exatamente o hash acima.",
    },
    {
      rotulo: "Lista de títulos que disputaram (SHA-256)",
      valor: estado.prova.clientSeed,
      nota: "Muda se um único título entrar ou sair da lista.",
    },
    {
      rotulo: "Cálculo do sorteio (HMAC-SHA256)",
      valor: estado.prova.hmacHex,
      nota: "Chave publicada aplicada à lista. É daqui que sai a posição.",
    },
  ];

  return (
    <section className="mt-5 rounded-2xl border border-white/10 bg-black/25 p-5">
      <div className="flex items-center gap-2">
        <ShieldCheck aria-hidden className="h-4 w-4 text-emerald-400" />
        <h2 className="text-[11px] font-bold tracking-[0.16em] text-white/60 uppercase">
          Certificado do sorteio
        </h2>
      </div>

      <dl className="mt-4 divide-y divide-white/5">
        {linhas.map((linha) => (
          <div
            key={linha.rotulo}
            className="flex items-baseline justify-between gap-4 py-2"
          >
            <dt className="shrink-0 text-xs text-white/55">{linha.rotulo}</dt>
            <dd
              className={
                linha.mono
                  ? "truncate font-mono text-xs font-semibold text-white/90"
                  : "truncate text-xs font-semibold text-white/90"
              }
            >
              {linha.valor}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-4 space-y-2">
        {chaves.map(
          (chave) =>
            chave.valor && (
              <div
                key={chave.rotulo}
                className="rounded-xl border border-white/10 bg-black/30 p-3"
              >
                <p className="text-[10px] font-bold tracking-[0.12em] text-white/55 uppercase">
                  {chave.rotulo}
                </p>
                {/* Quebra em qualquer caractere: são sessenta e quatro
                    hexadecimais sem espaço nenhum, e sem isto eles esticariam
                    a página inteira no celular. */}
                <p className="mt-1 font-mono text-[10px] leading-relaxed break-all text-white/70">
                  {chave.valor}
                </p>
                <p className="mt-1 text-[10px] leading-relaxed text-white/55">
                  {chave.nota}
                </p>
              </div>
            ),
        )}
      </div>

      <Link
        href={`/sorteio/${estado.publicId}/verificar`}
        className="mt-4 flex h-11 items-center justify-center gap-2 rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-4 text-sm font-bold text-emerald-200 transition-colors hover:bg-emerald-500/15"
      >
        <ShieldCheck aria-hidden className="h-4 w-4" />
        Conferir este sorteio
      </Link>

      <p className="mt-3 text-[11px] leading-relaxed text-white/55">
        A conferência roda no seu próprio navegador, com os dados desta página.
        O número foi escolhido antes de qualquer animação e não pode ser
        alterado.
      </p>
    </section>
  );
}
