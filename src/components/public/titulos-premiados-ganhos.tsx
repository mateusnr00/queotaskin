// O aviso de que um dos números da pessoa é um título premiado.
//
// O painel promete, na aba Títulos Premiados, que o texto de ganhador
// "aparece no comprovante quando o cliente é dono de pelo menos 1 ticket
// premiado". Ele era gravado no banco e nunca lido por ninguém: quem tirava
// um número premiado terminava a compra sem aviso nenhum e só descobria pela
// lista da campanha, se olhasse.
//
// O nome do prêmio sai na cor da raridade, a mesma leitura da página pública,
// e cada linha traz o botão que leva ao suporte com a mensagem pronta: ganhar
// e não saber o que fazer em seguida é o pior momento para deixar a pessoa
// sozinha.

import type { SkinRarity } from "@prisma/client";
import { Trophy } from "lucide-react";

import { BotaoReivindicar } from "@/components/public/botao-reivindicar";
import { RARITY_TEXT_VAR } from "@/lib/cs2";
import { separarDesgaste } from "@/lib/premio-nome";

const TEXTO_PADRAO =
  "Um dos seus números é premiado! Fale com o suporte para receber.";

export function TitulosPremiadosGanhos({
  premiados,
  telefoneDoSuporte,
  nomeDoGanhador,
  nomeDaCampanha,
  referencia,
  texto,
}: {
  premiados: {
    number: number;
    prizeDescription: string;
    skinRarity: SkinRarity | null;
  }[];
  telefoneDoSuporte: string | null;
  nomeDoGanhador: string;
  nomeDaCampanha: string;
  referencia: string;
  /** Texto configurado no painel. Vazio usa o padrão. */
  texto: string | null;
}) {
  if (premiados.length === 0) return null;

  return (
    <section className="rounded-xl border border-amber-500/40 bg-gradient-to-br from-amber-500/[0.14] to-transparent p-4">
      <h2 className="flex items-center gap-2 text-sm font-bold text-amber-600 dark:text-amber-400">
        <Trophy aria-hidden className="h-4 w-4 shrink-0" />
        {premiados.length === 1
          ? "Você tirou um título premiado!"
          : `Você tirou ${premiados.length} títulos premiados!`}
      </h2>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        {texto?.trim() || TEXTO_PADRAO}
      </p>

      <ul className="mt-3 space-y-2">
        {premiados.map((p) => {
          const { nome, desgaste } = separarDesgaste(p.prizeDescription);
          return (
            <li
              key={p.number}
              className="rounded-lg border border-border/60 bg-background/60 p-3"
            >
              <div className="flex items-start gap-3">
                <span className="mt-px shrink-0 rounded-md bg-foreground/[0.07] px-2 py-1 text-[13px] font-bold tabular-nums text-foreground/80">
                  {p.number}
                </span>
                <p className="min-w-0 flex-1 text-[13px] font-semibold leading-snug [overflow-wrap:anywhere]">
                  <span
                    style={
                      p.skinRarity
                        ? { color: RARITY_TEXT_VAR[p.skinRarity] }
                        : undefined
                    }
                  >
                    {nome}
                  </span>
                  {desgaste && (
                    <span className="whitespace-nowrap font-medium text-muted-foreground">
                      {" "}
                      {desgaste}
                    </span>
                  )}
                </p>
              </div>
              <BotaoReivindicar
                telefoneDoSuporte={telefoneDoSuporte}
                nome={nomeDoGanhador}
                premio={p.prizeDescription}
                campanha={nomeDaCampanha}
                referencia={referencia}
                className="mt-3 w-full"
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
