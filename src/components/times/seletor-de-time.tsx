"use client";

// A escolha do time, numa linha.
//
// Era uma grade com os trinta times, cada um num botão com emblema, e ela
// ocupava três telas de celular dentro de Minha Conta. Um dado cosmético,
// escolhido uma vez e quase nunca revisto, empurrava para baixo o extrato de
// XP e os dados de acesso, que é o que a pessoa vem ver aqui.
//
// Agora é uma linha fechada. O emblema continua ao lado de cada nome dentro da
// lista, porque reconhecer o escudo é metade da escolha, mas a lista só existe
// enquanto está aberta.
//
// Salva na troca, sem botão de confirmar: é uma escolha só, e voltar atrás é
// outra troca.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { semAcento } from "@/lib/busca";
import type { TimeDeCS2 } from "@/lib/times-cs2";
import { salvarTimeDoCoracaoAction } from "@/server/actions/time-do-coracao";
import { EmblemaDoTime } from "@/components/times/emblema-do-time";

/**
 * "Não torço por ninguém" precisa de um valor, e não de string vazia: o Select
 * do Radix usa o valor vazio para dizer "nada selecionado", então uma opção com
 * valor "" seria impossível de escolher.
 */
const NENHUM = "__nenhum__";

export function SeletorDeTime({
  atual,
  times,
}: {
  atual: string | null;
  /** A lista vem do servidor: os times moram no banco desde a migration. */
  times: readonly TimeDeCS2[];
}) {
  const router = useRouter();
  const [salvando, comTransicao] = useTransition();
  // O escolhido vive no cliente para a linha mudar no ato, e não só quando o
  // servidor responder. O router.refresh depois reconcilia.
  const [escolhido, setEscolhido] = useState(atual);
  // A busca. Passou a fazer falta quando a lista cresceu: com quarenta times,
  // rolar até achar o seu no celular é trabalho, e o teclado de digitação
  // rápida do select não ajuda em tela sem teclado físico.
  const [busca, setBusca] = useState("");

  const filtrados = filtrar(times, busca);
  const br = filtrados.filter((t) => t.regiao === "BR");
  const inter = filtrados.filter((t) => t.regiao === "INTER");

  // `string | null`: este Select entrega null quando a seleção é limpa, e
  // NENHUM quando a opção "não exibir" é escolhida. Os dois querem dizer a
  // mesma coisa aqui, e viram null antes de sair daqui.
  function escolher(valor: string | null) {
    const id = valor == null || valor === NENHUM ? null : valor;
    const anterior = escolhido;
    setEscolhido(id);
    comTransicao(async () => {
      const r = await salvarTimeDoCoracaoAction(id);
      if (!r.ok) {
        // Devolve o estado anterior: deixar o time novo na linha depois de o
        // servidor recusar mostraria uma escolha que não existe no banco.
        setEscolhido(anterior);
        toast.error(r.error);
        return;
      }
      toast.success(id ? "Time salvo." : "Você não torce para ninguém agora.");
      router.refresh();
    });
  }

  const time = times.find((t) => t.id === escolhido) ?? null;

  return (
    <Select
      value={escolhido ?? NENHUM}
      onValueChange={escolher}
      disabled={salvando}
      // Fechou, esquece a busca: reabrir mostrando o filtro da vez passada
      // pareceria que metade dos times sumiu.
      onOpenChange={(aberto) => {
        if (!aberto) setBusca("");
      }}
    >
      <SelectTrigger className="h-11 w-full" aria-label="Time do coração">
        {/* SelectValue com filho próprio, e não o texto da opção: assim a
            linha fechada mostra o emblema junto do nome, do mesmo jeito que
            ele vai aparecer ao lado do seu nome nas listas públicas. */}
        <SelectValue>
          {time ? (
            <span className="flex items-center gap-2">
              <EmblemaDoTime time={time} tamanho="md" />
              <span className="truncate">{time.nome}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">Escolher time</span>
          )}
        </SelectValue>
      </SelectTrigger>

      <SelectContent>
        {/* O campo de busca dentro da lista.
            stopPropagation nas teclas porque o select tem digitação rápida
            própria: sem isso, cada letra digitada aqui saltaria a seleção para
            um time começado por aquela letra, e o texto nunca entraria. */}
        <div className="sticky top-0 z-10 bg-popover p-1">
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
            placeholder="Buscar time"
            aria-label="Buscar time"
            className="h-9"
          />
        </div>

        {busca === "" && (
          <SelectItem value={NENHUM}>Não exibir time</SelectItem>
        )}
        <Grupo titulo="Brasil" times={br} />
        <Grupo titulo="Internacionais" times={inter} />

        {filtrados.length === 0 && (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            Nenhum time com esse nome.
          </p>
        )}
      </SelectContent>
    </Select>
  );
}

/** Casa por nome ou tag, ignorando acento e caixa. */
function filtrar(times: readonly TimeDeCS2[], busca: string): TimeDeCS2[] {
  const alvo = semAcento(busca);
  if (alvo === "") return [...times];
  return times.filter(
    (t) => semAcento(t.nome).includes(alvo) || semAcento(t.tag).includes(alvo),
  );
}

function Grupo({ titulo, times }: { titulo: string; times: readonly TimeDeCS2[] }) {
  if (times.length === 0) return null;
  return (
    <SelectGroup>
      <SelectLabel>{titulo}</SelectLabel>
      {times.map((time) => (
        <SelectItem key={time.id} value={time.id}>
          <span className="flex items-center gap-2">
            <EmblemaDoTime time={time} tamanho="md" />
            <span>{time.nome}</span>
          </span>
        </SelectItem>
      ))}
    </SelectGroup>
  );
}
