// O DESTINO DO SORTEIO depois de salvo.
//
// Vive aqui, e não junto da action, por uma regra do Next: arquivo com
// "use server" só pode exportar função assíncrona, e um schema é um objeto.
// Exportá-lo de lá derruba a página inteira em produção com "A 'use server'
// file can only export async functions".
//
// "RASCUNHO" é o comportamento de sempre e continua sendo o padrão: sem
// escolha explícita, nada muda. Os outros dois passam pelos MESMOS caminhos
// que já existiam (o serviço de status e o serviço da fila).

import { z } from "zod";

export const destinoSchema = z.object({
  tipo: z.enum(["RASCUNHO", "PUBLICAR", "CRONOGRAMA"]),
  /** Só para CRONOGRAMA. "2026-09-03", rótulo de organização do painel. */
  dia: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  posicao: z.enum(["inicio", "fim"]).optional(),
});

export type DestinoDoSorteioInput = z.infer<typeof destinoSchema>;

/** O que aconteceu com o destino escolhido, para a tela poder falar disso. */
export type ResultadoDoDestino =
  | { tipo: "RASCUNHO" }
  | { tipo: "PUBLICAR" }
  | { tipo: "CRONOGRAMA"; enfileirado: true }
  | { tipo: "CRONOGRAMA"; enfileirado: false; motivo: string };
