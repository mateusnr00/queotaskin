"use client";

// O elo entre a transmissão e o servidor.
//
// Duas responsabilidades, e só elas: manter o relógio acertado com o do
// servidor, e ir buscar o estado nos momentos em que ele pode ter mudado.
//
// POR QUE NÃO TEM WEBSOCKET AQUI
//
// Porque não há o que empurrar. Depois que a campanha encerra, todo o
// cronograma existe: a página sabe, desde a primeira resposta, o instante em
// que a contagem começa, o em que ela zera, o em que o número aparece e o em
// que o nome aparece. Um canal aberto ficaria repetindo informação que o
// cliente já tem, e cobraria uma conexão viva por espectador em cima de uma
// plataforma serverless.
//
// O único dado que não dá para derivar do relógio é o número sorteado, e ele
// é buscado uma vez, no segundo em que passa a ser público. São três ou quatro
// requisições por espectador na transmissão inteira, contra sessenta por
// minuto de um polling ingênuo.
//
// O RELÓGIO
//
// O do navegador não serve para nada aqui: ele pode estar minutos ou horas
// fora, e duas pessoas com relógios diferentes veriam contagens diferentes do
// mesmo sorteio. Toda resposta traz o instante do servidor, e o que a página
// guarda é a DIFERENÇA entre os dois relógios. A contagem é sempre calculada
// contra o relógio do servidor reconstruído, nunca contra o local.

import { useCallback, useEffect, useRef, useState } from "react";

import { proximaVirada } from "@/lib/sorteio-ao-vivo";
import type { EstadoPublicoDoSorteio } from "@/server/services/sorteio-ao-vivo";

export type SituacaoDaConexao = "ok" | "reconectando" | "offline";

/**
 * Espalha as buscas na virada de fase.
 *
 * Milhares de abas com o mesmo cronograma pedem o resultado no mesmo
 * milissegundo. O sorteio é sincronizado, o pico de tráfego não precisa ser.
 * A rolagem continua girando até o número chegar, então esse meio segundo de
 * folga não aparece na tela de ninguém.
 */
function respiro(): number {
  return 150 + Math.random() * 600;
}

/** Enquanto falta muito, uma batida de vez em quando basta. */
const BATIDA_LONGA_MS = 120_000;

/** Espera entre tentativas quando a rede cai, dobrando até um teto. */
const ESPERA_INICIAL_MS = 1_000;
const ESPERA_MAXIMA_MS = 20_000;

export interface TransmissaoDoSorteio {
  estado: EstadoPublicoDoSorteio;
  /** O instante atual pelo relógio do SERVIDOR. */
  agora: Date;
  conexao: SituacaoDaConexao;
  /** Força uma busca agora. Usado ao voltar para a aba. */
  recarregar: () => void;
}

export function useEstadoDoSorteio(
  estadoInicial: EstadoPublicoDoSorteio,
): TransmissaoDoSorteio {
  const [estado, setEstado] = useState(estadoInicial);
  const [conexao, setConexao] = useState<SituacaoDaConexao>("ok");

  // A diferença entre o relógio do servidor e o desta máquina. Nasce zerada e
  // é medida no primeiro efeito: ler o relógio durante a renderização é
  // impuro, e o compilador do React recusa, com razão. Até a medida chegar, o
  // instante mostrado é o que veio renderizado do servidor.
  const deslocamento = useRef<number>(0);

  // O instante atual pelo relógio do SERVIDOR, guardado em estado porque é
  // ele que faz a contagem andar na tela. Quatro passos por segundo, para o
  // dígito virar no momento certo e não até meio segundo depois.
  const [agora, setAgora] = useState<Date>(
    () => new Date(Date.parse(estadoInicial.serverTime)),
  );

  const buscando = useRef(false);
  const tentativa = useRef(0);

  const buscar = useCallback(async () => {
    if (buscando.current) return;
    buscando.current = true;
    const partida = Date.now();
    try {
      const resposta = await fetch(
        `/api/sorteio/${estadoInicial.publicId}/estado`,
        { cache: "no-store" },
      );
      if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
      const novo = (await resposta.json()) as EstadoPublicoDoSorteio;

      // Metade da ida e volta é a estimativa de quanto o instante do servidor
      // envelheceu no caminho. Sem esse ajuste, a página fica atrasada pelo
      // tempo da rede, que numa conexão ruim é meio segundo.
      const meiaViagem = (Date.now() - partida) / 2;
      deslocamento.current =
        Date.parse(novo.serverTime) + meiaViagem - Date.now();

      setEstado(novo);
      setConexao("ok");
      tentativa.current = 0;
    } catch {
      // Sem alarme na primeira falha: a transmissão continua correta com o
      // que já está na mão, porque o cronograma é local. O aviso só aparece
      // se insistir em falhar.
      tentativa.current += 1;
      if (tentativa.current >= 2) {
        setConexao(navigator.onLine ? "reconectando" : "offline");
      }
    } finally {
      buscando.current = false;
    }
  }, [estadoInicial.publicId]);

  // Um relógio só para a tela. Nada aqui decide coisa alguma: o que ele faz é
  // manter a contagem andando. Continua correndo depois do fim para o
  // certificado não congelar num instante velho, mas devagar.
  useEffect(() => {
    const parado = estado.status === "FINISHED" || estado.status === "ERROR";
    const id = setInterval(
      () => setAgora(new Date(Date.now() + deslocamento.current)),
      parado ? 5_000 : 250,
    );
    return () => clearInterval(id);
  }, [estado.status]);

  // Um despertador para a virada de fase.
  //
  // O relógio da tela bate de 250 em 250 ms, e a troca de cena espera o
  // próximo tique: no pior caso, um quarto de segundo de contagem zerada antes
  // de o carretel entrar. Medido, dava entre 25 e 238 ms.
  //
  // Este efeito marca um despertador para o instante EXATO da próxima virada.
  // Não é polimento à toa: a troca acontece no clímax, com a pessoa olhando
  // para o número, e um quarto de segundo parado ali é a diferença entre
  // "virou na hora" e "travou".
  useEffect(() => {
    if (estado.status === "FINISHED" || estado.status === "ERROR") return;

    const agoraEfetivo = new Date(Date.now() + deslocamento.current);
    const virada = proximaVirada(
      {
        drawScheduledAt: new Date(estado.drawScheduledAt),
        drawStartsAt: new Date(estado.drawStartsAt),
        revealAt: new Date(estado.revealAt),
        winnerRevealAt: new Date(estado.winnerRevealAt),
        temResultado: estado.resultado != null,
      },
      agoraEfetivo,
    );
    if (!virada) return;

    // Quinze milissegundos depois da hora, e não em cima: o despertador
    // acordando um fio antes da virada mostraria a cena antiga e teria que
    // esperar o tique seguinte, que é justamente o que ele veio evitar.
    const espera = virada.getTime() - agoraEfetivo.getTime() + 15;
    if (espera <= 0 || espera > 3_600_000) return;

    const id = setTimeout(
      () => setAgora(new Date(Date.now() + deslocamento.current)),
      espera,
    );
    return () => clearTimeout(id);
  }, [estado]);

  // A agenda de buscas.
  //
  // Um laço que SEMPRE se rearma, e não um temporizador único por estado. A
  // primeira versão agendava a próxima busca a partir do estado, e por isso
  // dependia de o estado mudar para agendar de novo: uma única busca que
  // falhasse, ou que fosse ignorada por já haver outra em andamento, não
  // mudava estado nenhum e a página parava de perguntar para sempre. Foi o
  // que aconteceu no teste, com a rolagem girando sozinha depois de o
  // servidor já ter revelado o número.
  //
  // Aqui a próxima espera é decidida DEPOIS de cada tentativa, com o que se
  // sabe naquele momento, e a bandeira de cancelamento é quem encerra o laço
  // quando o estado troca ou o componente sai.
  useEffect(() => {
    if (estado.status === "FINISHED" || estado.status === "ERROR") return;

    let cancelado = false;
    let id: ReturnType<typeof setTimeout>;

    const proximaEspera = (): number => {
      if (tentativa.current > 0) {
        return Math.min(
          ESPERA_MAXIMA_MS,
          ESPERA_INICIAL_MS * 2 ** (tentativa.current - 1),
        );
      }
      // O instante é lido aqui, e não vem do estado da tela: o relógio avança
      // quatro vezes por segundo, e depender dele faria esta agenda ser
      // desmontada e remontada quatro vezes por segundo também.
      const agoraEfetivo = new Date(Date.now() + deslocamento.current);
      const virada = proximaVirada(
        {
          drawScheduledAt: new Date(estado.drawScheduledAt),
          drawStartsAt: new Date(estado.drawStartsAt),
          revealAt: new Date(estado.revealAt),
          winnerRevealAt: new Date(estado.winnerRevealAt),
          temResultado: estado.resultado != null,
        },
        agoraEfetivo,
      );
      if (!virada) return BATIDA_LONGA_MS;
      return Math.min(
        BATIDA_LONGA_MS,
        Math.max(0, virada.getTime() - agoraEfetivo.getTime()) + respiro(),
      );
    };

    const rodar = async () => {
      if (cancelado) return;
      await buscar();
      if (!cancelado) id = setTimeout(rodar, proximaEspera());
    };

    id = setTimeout(rodar, proximaEspera());
    return () => {
      cancelado = true;
      clearTimeout(id);
    };
  }, [estado, buscar]);

  // Voltar para a aba, recuperar a rede, destravar o celular: o navegador
  // congela temporizador de aba escondida, então quem volta pode estar
  // olhando uma tela parada há minutos. Perguntar de novo é o conserto.
  useEffect(() => {
    const aoVoltar = () => {
      if (document.visibilityState === "visible") void buscar();
    };
    const aoReconectar = () => void buscar();
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("online", aoReconectar);
    window.addEventListener("focus", aoVoltar);
    return () => {
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("online", aoReconectar);
      window.removeEventListener("focus", aoVoltar);
    };
  }, [buscar]);

  // Uma busca logo na abertura, para acertar o relógio com a ida e volta
  // medida. O estado que veio do servidor já é válido; o que falta é a
  // precisão do deslocamento. Num temporizador de zero, e não direto no
  // corpo do efeito: assim a busca não disputa a primeira pintura, e o
  // efeito não muda estado de forma síncrona.
  useEffect(() => {
    const id = setTimeout(buscar, 0);
    return () => clearTimeout(id);
  }, [buscar]);

  return {
    estado,
    agora,
    conexao,
    recarregar: () => void buscar(),
  };
}
