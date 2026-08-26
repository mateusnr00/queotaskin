"use server";

// Server actions de usuários (admin). Apenas role ADMIN pode chamar.
//
// Regras:
// - Celular e CPF são únicos no banco; conflito devolve erro amigável
//   identificando qual campo está duplicado.
// - Um admin NÃO pode rebaixar a si mesmo (anti-lockout: se for o único
//   admin e mudar de role, ninguém mais consegue entrar no painel).
//
// Não permitimos editar e-mail aqui, login do sistema é por nome+celular,
// e-mail é só contato opcional.

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { getAdminOrThrow } from "@/lib/auth-helpers";
import { getActiveTenantIdForAdmin } from "@/lib/tenant";
import bcrypt from "bcryptjs";

import { userCreateSchema, userEditSchema } from "@/lib/validations/auth";
import { gerarSenhaTemporaria } from "@/lib/senha-temporaria";
import type { ActionResult } from "@/server/actions/auth";

/** Papéis que abrem o painel. */
const PAPEIS_DE_PAINEL = ["ADMIN", "SUPER_ADMIN"] as const;
type PapelDePainel = (typeof PAPEIS_DE_PAINEL)[number];

function abrePainel(papel: string): papel is PapelDePainel {
  return (PAPEIS_DE_PAINEL as readonly string[]).includes(papel);
}

/**
 * Traduz a violação de unicidade para o campo que a pessoa enxerga.
 *
 * Sem isso o erro é "Unique constraint failed", que não diz se o problema é o
 * CPF, o celular ou o e-mail, e a pessoa fica trocando campo por tentativa.
 */
function erroDeDuplicidade(err: unknown): string | null {
  if (
    !(err instanceof Prisma.PrismaClientKnownRequestError) ||
    err.code !== "P2002"
  ) {
    return null;
  }
  const alvo = err.meta?.target;
  const texto = Array.isArray(alvo) ? alvo.join(",") : String(alvo ?? "");
  if (texto.includes("phone")) return "Celular já está em uso por outra conta";
  if (texto.includes("cpf")) return "CPF já está em uso por outra conta";
  if (texto.includes("email")) return "E-mail já está em uso por outra conta";
  return "Já existe um usuário com esses dados";
}

export async function updateUserAction(
  raw: unknown
): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await getAdminOrThrow();
    const tenantId = await getActiveTenantIdForAdmin(session.user);

    const parsed = userEditSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        error: "Dados inválidos",
        fieldErrors: parsed.error.flatten().fieldErrors,
      };
    }

    const { id, name, email, cpf, phone, role } = parsed.data;

    // Anti-lockout: o próprio admin não pode se rebaixar.
    if (session.user.id === id && role !== "ADMIN" && role !== "SUPER_ADMIN") {
      return {
        ok: false,
        error:
          "Você não pode remover o próprio papel de admin. Peça pra outro admin fazer isso.",
      };
    }

    // O usuário editado precisa ter relação com o tenant atual (membro ou
    // comprador). Bloqueia admins de bagunçar contas de outros tenants.
    const target = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        role: true,
        tenantId: true,
        reservations: {
          where: { raffle: { tenantId } },
          select: { id: true },
          take: 1,
        },
      },
    });
    if (!target) return { ok: false, error: "Usuário não encontrado" };
    const belongsToTenant =
      target.tenantId === tenantId || target.reservations.length > 0;
    if (!belongsToTenant && session.user.role !== "SUPER_ADMIN") {
      return { ok: false, error: "Usuário não pertence a esse tenant" };
    }

    // Admin muda papel, inclusive promovendo outro admin: sem isso, quem é
    // promovido não consegue montar a própria equipe e "admin" vira um papel
    // pela metade, que depende do dono para cada cadastro.
    //
    // SUPER_ADMIN fica de fora nas duas direções. Conceder deixaria um admin
    // criar uma conta acima da dele; revogar deixaria ele derrubar o dono da
    // plataforma. Essa é a única coisa que separa os dois papéis.
    const ehDono = session.user.role === "SUPER_ADMIN";
    if (!ehDono && role === "SUPER_ADMIN" && target.role !== "SUPER_ADMIN") {
      return {
        ok: false,
        error: "Só o dono da plataforma pode conceder SUPER_ADMIN.",
      };
    }
    if (
      !ehDono &&
      target.role === "SUPER_ADMIN" &&
      role !== "SUPER_ADMIN" &&
      session.user.id !== target.id
    ) {
      return {
        ok: false,
        error: "SUPER_ADMIN só pode ser revogado pelo próprio dono.",
      };
    }
    const finalRole =
      !ehDono && target.role === "SUPER_ADMIN" ? target.role : role;

    try {
      await prisma.user.update({
        where: { id },
        data: {
          name,
          email: email || null,
          cpf: cpf || null,
          phone: phone || null,
          role: finalRole,
          // Se promovendo pra ADMIN/AFFILIATE e ainda não pertence a um tenant,
          // linka ao tenant atual.
          ...((finalRole === "ADMIN" || finalRole === "AFFILIATE") &&
          !target.tenantId
            ? { tenantId }
            : {}),
        },
      });
    } catch (err) {
      const duplicado = erroDeDuplicidade(err);
      if (duplicado) return { ok: false, error: duplicado };
      throw err;
    }

    revalidatePath("/admin/usuarios");
    // Clientes é a lista onde essa edição costuma começar (alguém trocou de
    // número e pediu para atualizar); sem isto ela continuaria mostrando o
    // dado antigo depois de salvar.
    revalidatePath("/admin/clientes");
    revalidatePath(`/admin/usuarios/${id}/editar`);

    return { ok: true, data: { id } };
  } catch (err) {
    console.error("[updateUserAction]", err);
    return { ok: false, error: "Erro ao salvar usuário" };
  }
}

/**
 * Cria uma conta pelo painel.
 *
 * Quando o papel dá acesso ao painel, a conta nasce com uma senha temporária
 * sorteada, que volta UMA vez para ser repassada e nunca mais é recuperável:
 * o banco guarda só o hash. A conta entra marcada para trocar a senha no
 * primeiro acesso, então a senha que passou por WhatsApp morre ali.
 */
export async function criarUsuarioAction(
  raw: unknown
): Promise<ActionResult<{ id: string; senhaTemporaria: string | null }>> {
  try {
    const session = await getAdminOrThrow();
    const tenantId = await getActiveTenantIdForAdmin(session.user);

    const parsed = userCreateSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        error: "Dados inválidos",
        fieldErrors: parsed.error.flatten().fieldErrors,
      };
    }

    const { name, email, cpf, phone, role } = parsed.data;

    // Só quem já é SUPER_ADMIN cria outro SUPER_ADMIN. Sem essa linha, um
    // ADMIN comum criaria uma conta acima da dele e usaria essa conta para
    // remover quem o promoveu.
    if (role === "SUPER_ADMIN" && session.user.role !== "SUPER_ADMIN") {
      return {
        ok: false,
        error: "Só o dono da plataforma pode criar outro SUPER_ADMIN.",
      };
    }

    const senhaTemporaria = abrePainel(role) ? gerarSenhaTemporaria() : null;

    try {
      const criado = await prisma.user.create({
        data: {
          name,
          email: email || null,
          cpf: cpf || null,
          phone: phone || null,
          role,
          // Conta criada no painel é deste tenant, seja qual for o papel:
          // foi este painel que a cadastrou. Sem isso um cliente cadastrado à
          // mão não apareceria na lista de Clientes até a primeira compra,
          // que é justamente o cadastro que alguém acabou de fazer olhando
          // para a tela.
          //
          // SUPER_ADMIN fica de fora: ele é dono da plataforma, não membro de
          // um tenant, e amarrá-lo a um limitaria o alcance dele.
          ...(role === "SUPER_ADMIN" ? {} : { tenantId }),
          ...(senhaTemporaria
            ? {
                passwordHash: await bcrypt.hash(senhaTemporaria, 12),
                mustChangePassword: true,
              }
            : {}),
        },
        select: { id: true },
      });

      revalidatePath("/admin/clientes");
      revalidatePath("/admin/usuarios");

      return { ok: true, data: { id: criado.id, senhaTemporaria } };
    } catch (err) {
      const duplicado = erroDeDuplicidade(err);
      if (duplicado) return { ok: false, error: duplicado };
      throw err;
    }
  } catch (err) {
    console.error("[criarUsuarioAction]", err);
    return { ok: false, error: "Erro ao criar usuário" };
  }
}

/**
 * Gera uma senha nova de painel para uma conta que já existe.
 *
 * Serve a dois casos que dariam no mesmo beco: promover um cliente antigo a
 * admin, que deixaria a conta com papel de painel e sem senha nenhuma, e
 * admin que perdeu a senha. Sem isso, os dois exigiriam rodar script no
 * servidor, que é justamente o que o painel existe para evitar.
 */
export async function gerarSenhaDePainelAction(
  userId: string
): Promise<ActionResult<{ senhaTemporaria: string }>> {
  try {
    const session = await getAdminOrThrow();

    const alvo = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, email: true },
    });
    if (!alvo) return { ok: false, error: "Usuário não encontrado" };

    if (!abrePainel(alvo.role)) {
      return {
        ok: false,
        error: "Essa conta não é de painel. Mude o papel para Admin primeiro.",
      };
    }
    if (!alvo.email) {
      return {
        ok: false,
        error: "Sem e-mail não há como entrar no painel. Preencha o e-mail e salve antes.",
      };
    }
    // Um ADMIN comum resetando a senha de um SUPER_ADMIN tomaria a conta do
    // dono: ele receberia a senha nova na tela e entraria com ela.
    if (
      alvo.role === "SUPER_ADMIN" &&
      session.user.role !== "SUPER_ADMIN" &&
      session.user.id !== alvo.id
    ) {
      return {
        ok: false,
        error: "Só o dono da plataforma pode gerar senha de um SUPER_ADMIN.",
      };
    }

    const senhaTemporaria = gerarSenhaTemporaria();
    await prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: await bcrypt.hash(senhaTemporaria, 12),
        mustChangePassword: true,
      },
    });

    revalidatePath(`/admin/usuarios/${userId}/editar`);
    return { ok: true, data: { senhaTemporaria } };
  } catch (err) {
    console.error("[gerarSenhaDePainelAction]", err);
    return { ok: false, error: "Erro ao gerar a senha" };
  }
}
