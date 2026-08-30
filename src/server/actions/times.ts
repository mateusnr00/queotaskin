"use server";

// O cadastro de times: criar, editar, enviar escudo, ativar e apagar.
//
// Os times moravam em código e viraram tabela porque o pedido foi poder enviar
// o escudo e adicionar times novos, e isso é cadastro, não deploy.
//
// APAGAR É A OPERAÇÃO PERIGOSA AQUI
//
// O id do time fica gravado na conta de quem torce por ele. Apagar deixaria
// esses ids órfãos, e cada pessoa perderia o time em silêncio. Por isso o
// caminho normal é DESATIVAR, que tira do seletor e mantém o emblema de quem
// já escolheu; apagar de vez só é permitido enquanto ninguém torce.

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { getAdminOrThrow } from "@/lib/auth-helpers";
import { isStorageConfigured, uploadImagem } from "@/lib/storage";
import { COR_VALIDA, TAG_VALIDA } from "@/lib/times-cs2";
import { toSlug } from "@/lib/slug";
import { registrarLog } from "@/server/services/activity-log";
import type { ActionResult } from "@/server/actions/auth";

const TAMANHO_MAXIMO = 2 * 1024 * 1024;

const esquema = z.object({
  // Vazio na criação: o id sai do nome. No preenchido, é edição.
  id: z.string().optional().nullable(),
  nome: z.string().trim().min(2, "Nome muito curto").max(40),
  tag: z
    .string()
    .trim()
    .regex(TAG_VALIDA, "A tag tem de 2 a 4 caracteres"),
  cor: z
    .string()
    .trim()
    .toLowerCase()
    .regex(COR_VALIDA, "Use uma cor em hex, como #ef4444"),
  regiao: z.enum(["BR", "INTER"]),
  ordem: z.coerce.number().int().min(0).max(999).default(0),
  ativo: z.boolean().default(true),
  // O escudo por LINK, para não precisar baixar e subir de novo.
  //
  // Só https, e a recusa não é frescura: "javascript:" e "data:" num src
  // colado por quem tem o painel viraria execução de script na página pública,
  // e "http:" quebraria o cadeado do navegador para todo visitante.
  escudo: z
    .string()
    .trim()
    .max(2048)
    .refine((v) => v === "" || v.startsWith("https://"), "O link precisa começar com https://")
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
});

export async function salvarTimeAction(
  raw: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = esquema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Dados inválidos",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    await getAdminOrThrow();
    const d = parsed.data;
    const editando = Boolean(d.id);
    // O id sai do nome na criação e NUNCA muda depois: ele é a chave gravada
    // em User.favoriteTeamId, e trocá-lo desligaria todo mundo que torce.
    const id = d.id || toSlug(d.nome);
    if (!id) return { ok: false, error: "Não consegui gerar um id do nome." };

    if (!editando && (await prisma.team.count({ where: { id } })) > 0) {
      return { ok: false, error: "Já existe um time com esse nome." };
    }

    const dados = {
      nome: d.nome,
      tag: d.tag,
      cor: d.cor,
      regiao: d.regiao,
      ordem: d.ordem,
      ativo: d.ativo,
      escudo: d.escudo,
    };
    await prisma.team.upsert({
      where: { id },
      update: dados,
      create: { id, ...dados },
    });

    await registrarLog({
      acao: editando ? "time.editado" : "time.criado",
      alvo: { tipo: "Team", id, rotulo: d.nome },
    });

    revalidatePath("/admin/times");
    revalidatePath("/minha-conta");
    return { ok: true, data: { id } };
  } catch {
    return { ok: false, error: "Não foi possível salvar." };
  }
}

/** O escudo. Aceita o arquivo e grava a URL na linha do time. */
export async function enviarEscudoAction(
  formData: FormData,
): Promise<ActionResult<{ escudo: string }>> {
  try {
    await getAdminOrThrow();
    if (!isStorageConfigured()) {
      return { ok: false, error: "Storage não configurado." };
    }

    const id = String(formData.get("id") ?? "");
    const file = formData.get("arquivo");
    if (!id || !(file instanceof File) || file.size === 0) {
      return { ok: false, error: "Escolha um arquivo." };
    }
    if (file.size > TAMANHO_MAXIMO) {
      return { ok: false, error: "O escudo precisa ter até 2 MB." };
    }

    const time = await prisma.team.findUnique({ where: { id }, select: { nome: true } });
    if (!time) return { ok: false, error: "Time não encontrado." };

    // uploadImagem recusa SVG, e é de propósito: SVG carrega script e é
    // servido do bucket como imagem. Escudo em PNG ou WebP resolve.
    const { url } = await uploadImagem("times", file);
    await prisma.team.update({ where: { id }, data: { escudo: url } });

    await registrarLog({
      acao: "time.editado",
      alvo: { tipo: "Team", id, rotulo: time.nome },
      detalhes: { escudo: "enviado" },
    });

    revalidatePath("/admin/times");
    revalidatePath("/minha-conta");
    return { ok: true, data: { escudo: url } };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Falha no envio.";
    return { ok: false, error: msg };
  }
}

/** Tira o escudo e volta ao emblema de iniciais. */
export async function removerEscudoAction(
  id: string,
): Promise<ActionResult<null>> {
  try {
    await getAdminOrThrow();
    await prisma.team.update({ where: { id }, data: { escudo: null } });
    revalidatePath("/admin/times");
    revalidatePath("/minha-conta");
    return { ok: true, data: null };
  } catch {
    return { ok: false, error: "Não foi possível remover." };
  }
}

/**
 * Apaga de vez, e só enquanto ninguém torce.
 *
 * A recusa não é burocracia: o id do time está gravado na conta de quem
 * escolheu, e apagar deixaria esses ids órfãos. Cada pessoa perderia o time
 * sem nunca saber por quê. Para tirar do ar um time que já tem torcida, o
 * caminho é desativar.
 */
export async function apagarTimeAction(
  id: string,
): Promise<ActionResult<{ torcedores: number }>> {
  try {
    await getAdminOrThrow();
    const torcedores = await prisma.user.count({ where: { favoriteTeamId: id } });
    if (torcedores > 0) {
      return {
        ok: false,
        error: `${torcedores} pessoa(s) torcem por este time. Desative em vez de apagar.`,
      };
    }
    const time = await prisma.team.findUnique({ where: { id }, select: { nome: true } });
    await prisma.team.delete({ where: { id } });

    await registrarLog({
      acao: "time.apagado",
      alvo: { tipo: "Team", id, rotulo: time?.nome },
    });

    revalidatePath("/admin/times");
    revalidatePath("/minha-conta");
    return { ok: true, data: { torcedores: 0 } };
  } catch {
    return { ok: false, error: "Não foi possível apagar." };
  }
}
