// Sortear um título que ainda não tem dono.
//
// O botão de gerar da aba de títulos premiados sorteava em 1..total e só
// evitava os números que já estavam na própria lista. Ou seja, podia cair num
// título JÁ VENDIDO, e aí o prêmio nasce morto: quem comprou aquele número
// comprou antes de ele virar premiado, a marcação automática só acontece na
// hora do pagamento, e ninguém recebe nada. Numa campanha de mil cotas com
// oitocentas vendidas, quatro de cada cinco sorteios caíam nesse buraco.
//
// A consulta ao banco entra por parâmetro em vez de o módulo importar Prisma:
// o miolo aqui é a estratégia de busca, e ela merece teste sem subir banco.

/** Como descobrir quem já tem dono. Implementado com Prisma na ação. */
export type ConsultaDeTitulos = {
  /**
   * Quais destes candidatos já estão ocupados.
   *
   * Ocupado é qualquer bilhete existente: reservado, pago ou premiado. O
   * modelo é preguiçoso, linha ausente é número livre, e reserva que venceu
   * some por apagamento, não por status.
   */
  ocupadosEntre(candidatos: number[]): Promise<Set<number>>;
  /**
   * Os livres, varrendo a campanha inteira, no máximo `limite` deles.
   *
   * Só é chamado quando o sorteio ao acaso falhou seguidas vezes, o que quer
   * dizer campanha quase cheia. Aí a varredura é barata em resultado (sobrou
   * pouco) e é o único jeito de achar o que restou.
   */
  livresVarrendo(limite: number): Promise<number[]>;
};

/** Quantas rodadas de sorteio antes de desistir e varrer. */
const RODADAS = 8;
/** Candidatos por rodada, por número pedido. Sobra para compensar ocupados. */
const FOLGA = 5;
/** Teto da varredura: o bastante para escolher, sem carregar a campanha toda. */
const LIMITE_DA_VARREDURA = 10_000;

/**
 * Sorteia `quantidade` títulos livres, ou menos se não houver tanto.
 *
 * Primeiro por amostragem: joga candidatos ao acaso e pergunta ao banco quais
 * deles têm dono. É uma consulta por rodada, com os candidatos numa lista só,
 * e não uma leitura da campanha inteira, que numa rifa de milhões de cotas
 * seria carregar milhões de linhas para escolher um número.
 *
 * Se a campanha estiver cheia demais para a sorte funcionar, cai na varredura
 * e sorteia entre o que ela achou. A varredura devolve os livres em ordem, mas
 * a escolha final continua ao acaso: pegar sempre o menor faria os títulos
 * premiados de toda campanha lotada nascerem no começo da faixa.
 */
export async function sortearTitulosLivres(
  {
    total,
    quantidade,
    evitar,
    consulta,
  }: {
    total: number;
    quantidade: number;
    /** Números que não servem, mesmo livres: os que já estão na lista. */
    evitar: Set<number>;
    consulta: ConsultaDeTitulos;
  },
  aleatorio: () => number = Math.random,
): Promise<number[]> {
  const teto = Math.max(1, Math.floor(total));
  const quantos = Math.max(0, Math.floor(quantidade));
  if (quantos === 0) return [];

  const achados: number[] = [];
  // Um número testado não volta: sem isto, uma rodada azarada gastaria as
  // tentativas perguntando ao banco pelos mesmos candidatos.
  const testados = new Set(evitar);

  for (let rodada = 0; rodada < RODADAS && achados.length < quantos; rodada++) {
    const faltam = quantos - achados.length;
    const candidatos: number[] = [];
    const tentativas = faltam * FOLGA;
    for (let i = 0; i < tentativas; i++) {
      const n =
        1 + Math.floor(Math.min(Math.max(aleatorio(), 0), 0.999999) * teto);
      if (testados.has(n)) continue;
      testados.add(n);
      candidatos.push(n);
    }
    if (candidatos.length === 0) continue;
    const ocupados = await consulta.ocupadosEntre(candidatos);
    for (const c of candidatos) {
      if (achados.length >= quantos) break;
      if (!ocupados.has(c)) achados.push(c);
    }
  }

  if (achados.length >= quantos) return achados;

  const livres = (await consulta.livresVarrendo(LIMITE_DA_VARREDURA)).filter(
    (n) => !evitar.has(n) && !achados.includes(n),
  );
  while (achados.length < quantos && livres.length > 0) {
    const i = Math.floor(
      Math.min(Math.max(aleatorio(), 0), 0.999999) * livres.length,
    );
    achados.push(livres[i]!);
    livres.splice(i, 1);
  }
  return achados;
}
