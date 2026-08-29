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
import { timePorId, timesPorRegiao, type TimeDeCS2 } from "@/lib/times-cs2";
import { salvarTimeDoCoracaoAction } from "@/server/actions/time-do-coracao";
import { EmblemaDoTime } from "@/components/times/emblema-do-time";

/**
 * "Não torço por ninguém" precisa de um valor, e não de string vazia: o Select
 * do Radix usa o valor vazio para dizer "nada selecionado", então uma opção com
 * valor "" seria impossível de escolher.
 */
const NENHUM = "__nenhum__";

export function SeletorDeTime({ atual }: { atual: string | null }) {
  const router = useRouter();
  const [salvando, comTransicao] = useTransition();
  // O escolhido vive no cliente para a linha mudar no ato, e não só quando o
  // servidor responder. O router.refresh depois reconcilia.
  const [escolhido, setEscolhido] = useState(atual);
  const { br, inter } = timesPorRegiao();

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

  const time = timePorId(escolhido);

  return (
    <Select
      value={escolhido ?? NENHUM}
      onValueChange={escolher}
      disabled={salvando}
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
        <SelectItem value={NENHUM}>Não exibir time</SelectItem>
        <Grupo titulo="Brasil" times={br} />
        <Grupo titulo="Internacionais" times={inter} />
      </SelectContent>
    </Select>
  );
}

function Grupo({ titulo, times }: { titulo: string; times: readonly TimeDeCS2[] }) {
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
