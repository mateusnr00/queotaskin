// Funções utilitárias do domínio Rifa.

import { customAlphabet } from "nanoid";

import { prisma } from "@/lib/db";
import { toSlug } from "@/lib/slug";

const shortId = customAlphabet("abcdefghijkmnpqrstuvwxyz23456789", 6);

/**
 * Primeiro slug livre a partir de `base`, dentro do tenant.
 *
 * Em colisão numera em sequência: `ak-47-redline`, depois `ak-47-redline1`,
 * `ak-47-redline2`. A versão anterior colava um sufixo aleatório de seis
 * letras, o que resolvia a unicidade e produzia URL impronunciável, do tipo
 * `ak-47-redline-q7x2mk`, justamente no link que vai para o WhatsApp.
 *
 * Busca os ocupados de uma vez em lugar de bater no banco a cada tentativa:
 * com uma skin que já teve dez campanhas, seriam dez idas ao banco só para
 * descobrir o número da vez.
 */
export async function garantirSlugLivre(
  base: string,
  tenantId: string
): Promise<string> {
  const raiz = base || shortId();

  const tomados = new Set(
    (
      await prisma.raffle.findMany({
        where: { tenantId, slug: { startsWith: raiz } },
        select: { slug: true },
      })
    ).map((r) => r.slug)
  );

  if (!tomados.has(raiz)) return raiz;

  // Existem no máximo `tomados.size` slugs ocupados com essa raiz, então
  // entre raiz1 e raiz(size+1) sobra pelo menos um livre. O laço termina.
  for (let n = 1; n <= tomados.size + 1; n++) {
    const candidato = `${raiz}${n}`;
    if (!tomados.has(candidato)) return candidato;
  }

  // Inalcançável pela contagem acima, mas devolver algo único é melhor do
  // que devolver undefined se a conta um dia mudar.
  return `${raiz}-${shortId()}`;
}

/** Slug livre a partir do título da campanha. */
export async function generateUniqueSlug(
  title: string,
  tenantId: string
): Promise<string> {
  return garantirSlugLivre(toSlug(title), tenantId);
}

// Sorteia N números aleatórios disponíveis em uma rifa.
// Estratégia: busca o conjunto de números já tomados (geralmente pequeno
// se a rifa é nova) e amostra randomicamente o complemento.
//
// Por que NÃO usamos `ORDER BY random()`: numa rifa de 1M de números, gerar
// 1M de randoms no DB e ordenar é caro. Como o conjunto de tomados costuma ser
// pequeno em rifas novas, é mais rápido carregar essa lista e amostrar em JS.
export async function pickAvailableNumbers(
  raffleId: string,
  count: number,
  totalNumbers: number
): Promise<number[]> {
  const taken = await prisma.ticket.findMany({
    where: { raffleId },
    select: { number: true },
  });
  const takenSet = new Set(taken.map((t) => t.number));

  const availableCount = totalNumbers - takenSet.size;
  if (availableCount < count) {
    throw new Error(
      `Apenas ${availableCount} número(s) disponível(eis), mas foram solicitados ${count}.`
    );
  }

  const picked: number[] = [];
  const pickedSet = new Set<number>();
  const maxTries = count * 20;
  let tries = 0;

  while (picked.length < count && tries < maxTries) {
    tries++;
    const candidate = Math.floor(Math.random() * totalNumbers) + 1;
    if (pickedSet.has(candidate) || takenSet.has(candidate)) continue;
    pickedSet.add(candidate);
    picked.push(candidate);
  }

  // Fallback: se aleatório falhou (rifa quase cheia), varre sequencialmente.
  if (picked.length < count) {
    for (let n = 1; n <= totalNumbers && picked.length < count; n++) {
      if (!pickedSet.has(n) && !takenSet.has(n)) {
        pickedSet.add(n);
        picked.push(n);
      }
    }
  }

  return picked.sort((a, b) => a - b);
}

// Pega os N próximos números sequenciais disponíveis (modo SEQUENTIAL).
export async function pickSequentialNumbers(
  raffleId: string,
  count: number,
  totalNumbers: number
): Promise<number[]> {
  const taken = await prisma.ticket.findMany({
    where: { raffleId },
    select: { number: true },
  });
  const takenSet = new Set(taken.map((t) => t.number));

  const picked: number[] = [];
  for (let n = 1; n <= totalNumbers && picked.length < count; n++) {
    if (!takenSet.has(n)) picked.push(n);
  }

  if (picked.length < count) {
    throw new Error(
      `Apenas ${picked.length} número(s) sequencial(is) disponível(eis).`
    );
  }
  return picked;
}
