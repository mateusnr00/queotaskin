"use server";

// As ações da Caixa de Level Up, do lado do cliente logado.
//
// O QUE O NAVEGADOR PODE PEDIR
//
// Abrir uma caixa que é dele, e ler o que ele tem. Só isso. Multiplicador,
// raridade, prazo e status são decididos e validados no servidor: o pedido que
// chega aqui é um id, e o dono entra no WHERE da consulta, então id de caixa
// alheia simplesmente não encontra linha.
//
// O sorteio acontece no serviço, com o gerador de criptografia, dentro de uma
// transação com trava por usuário. A animação da tela roda DEPOIS, sobre um
// resultado que já está gravado: ela mostra o prêmio, não o escolhe.

import { z } from "zod";

import { auth } from "@/auth";
import { getCurrentTenantOrThrow } from "@/lib/tenant";
import {
  abrirCaixa,
  recompensasDoUsuario,
  type BoostAtivo,
  type CaixaFechada,
  type ResultadoDaAbertura,
} from "@/server/services/caixa-de-level-up";

export type AberturaDaCaixa = ResultadoDaAbertura;

const entrada = z.object({ boxId: z.string().cuid() });

export async function abrirCaixaAction(raw: unknown): Promise<AberturaDaCaixa> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { ok: false, erro: "Entre na sua conta para abrir a caixa." };
    }

    const parsed = entrada.safeParse(raw);
    if (!parsed.success) return { ok: false, erro: "Caixa inválida." };

    const { id: tenantId } = await getCurrentTenantOrThrow();
    return await abrirCaixa({
      boxId: parsed.data.boxId,
      userId: session.user.id,
      tenantId,
    });
  } catch (err) {
    console.error("[abrirCaixaAction]", err);
    return { ok: false, erro: "Não foi possível abrir a caixa agora." };
  }
}

/**
 * O estado das recompensas para a tela.
 *
 * Serve à contagem regressiva: ela desenha a partir do `expiraEm` que veio
 * daqui, e não do relógio do navegador. Relógio adiantado não estende boost.
 */
export async function minhasRecompensasAction(): Promise<{
  ativo: BoostAtivo | null;
  fechadas: CaixaFechada[];
}> {
  try {
    const session = await auth();
    if (!session?.user?.id) return { ativo: null, fechadas: [] };
    const { id: tenantId } = await getCurrentTenantOrThrow();
    return await recompensasDoUsuario({ userId: session.user.id, tenantId });
  } catch (err) {
    console.error("[minhasRecompensasAction]", err);
    return { ativo: null, fechadas: [] };
  }
}
