// Schema do link de troca da Steam. Validado no cliente (UX) e no servidor
// (segurança) — mesmo padrão dos outros schemas do projeto.

import { z } from "zod";

import { isValidTradeUrl } from "@/lib/cs2";

export const steamTradeUrlSchema = z.object({
  // Vazio limpa o link cadastrado; qualquer outra coisa precisa ser um
  // link de troca válido. Um link torto só falharia na hora de entregar
  // a skin — tarde demais.
  steamTradeUrl: z
    .string()
    .trim()
    .refine(
      (v) => v === "" || isValidTradeUrl(v),
      "Link inválido. Copie o link completo em Steam → Inventário → Ofertas de troca.",
    ),
});

export type SteamTradeUrlInput = z.infer<typeof steamTradeUrlSchema>;
