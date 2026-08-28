// O nome do ganhador como ele aparece nas listas públicas.
//
// O cadastro guarda o nome completo, e a lista mostrava tudo: "Joao Vitor de
// Alencar" ocupava a linha inteira ao lado de gente chamada "Ana". Além de
// desalinhar a coluna, expor o nome completo de quem ganhou não serve a
// ninguém, a lista existe para provar que alguém levou, e não para
// identificar a pessoa.
//
// Regra: primeiro nome, e o segundo só quando ele é mesmo um nome. Partícula
// solta não conta, porque "Maria da Silva" viraria "Maria da", que não é jeito
// de chamar ninguém.

const PARTICULAS = new Set(["de", "da", "do", "das", "dos", "e", "del", "di"]);

export function nomeCurto(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length <= 1) return partes[0] ?? "";
  const segundo = partes[1];
  if (PARTICULAS.has(segundo.toLowerCase())) return partes[0];
  return `${partes[0]} ${segundo}`;
}
