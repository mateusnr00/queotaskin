// Funções utilitárias do domínio Rifa.

import { customAlphabet } from "nanoid";

import { prisma } from "@/lib/db";
import { toSlug } from "@/lib/slug";

const shortId = customAlphabet("abcdefghijkmnpqrstuvwxyz23456789", 6);

// Garante slug único dentro do tenant: gera a partir do título; em colisão
// adiciona sufixo curto. Tenta no máximo 5 vezes — basta para evitar loop
// infinito.
export async function generateUniqueSlug(
  title: string,
  tenantId: string
): Promise<string> {
  const base = toSlug(title);
  const fallback = base || shortId();

  let candidate = fallback;
  for (let i = 0; i < 5; i++) {
    const existing = await prisma.raffle.findUnique({
      where: { tenantId_slug: { tenantId, slug: candidate } },
      select: { id: true },
    });
    if (!existing) return candidate;
    candidate = `${fallback}-${shortId()}`;
  }
  // Improvável chegar aqui; usa só o sufixo.
  return `${fallback}-${shortId()}-${shortId()}`;
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
