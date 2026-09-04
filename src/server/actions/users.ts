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
import { registrarLog } from "@/server/services/activity-log";
import { diferencas } from "@/lib/activity-log-detalhes";
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

    const { id, name, email, cpf, phone, role, showModBadge } = parsed.data;

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
        name: true,
        email: true,
        cpf: true,
        phone: true,
        role: true,
        showModBadge: true,
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

    // Isolamento de identidade: name/cpf/phone vivem no User GLOBAL, visto por
    // todos os tenants. Permitir reescrevê-los porque "tem 1 reserva aqui"
    // deixa um ADMIN de A mudar o CPF de um cliente cujo painel de origem é B
    // e depois logar como ele no site público (login é global por CPF), um
    // takeover cruzando a fronteira de tenant. Então só edita identidade quem
    // é membro real deste tenant (ou conta sem dono), ou o SUPER_ADMIN.
    const podeEditarIdentidade =
      session.user.role === "SUPER_ADMIN" ||
      target.tenantId === tenantId ||
      target.tenantId === null;
    if (!podeEditarIdentidade) {
      return {
        ok: false,
        error:
          "Este cliente pertence a outro painel. Aqui você pode vê-lo, mas a edição dos dados é feita lá.",
      };
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
          // REG-4/§2: telefone alterado por admin NAO e verificado. Zera a
          // marca de confianca; so o dono, provando o numero por OTP, verifica.
          ...(( phone || null) !== (target.phone ?? null) ? { phoneVerifiedAt: null } : {}),
          role: finalRole,
          showModBadge,
          // Se promovendo pra ADMIN/AFFILIATE e ainda não pertence a um tenant,
          // linka ao tenant atual.
          ...((finalRole === "ADMIN" || finalRole === "AFFILIATE") &&
          !target.tenantId
            ? { tenantId }
            : {}),
          // Senha é coisa de painel. Quem sai de um papel de painel perde a
          // credencial junto: o hash ficaria dormindo no banco e uma
          // repromoção futura devolveria o acesso com a senha antiga, que a
          // pessoa afastada continua tendo guardada. O login já recusa papel
          // que não abre painel (auth.ts), isto tira a chave de circulação.
          ...(abrePainel(finalRole)
            ? {}
            : { passwordHash: null, mustChangePassword: false }),
        },
      });
    } catch (err) {
      const duplicado = erroDeDuplicidade(err);
      if (duplicado) return { ok: false, error: duplicado };
      throw err;
    }

    // Papel alterado ganha ação própria mesmo quando outros campos mudaram
    // junto. É o que alguém procura, e escondê-lo dentro de "editou os dados"
    // apagaria a promoção no meio do barulho.
    const mudou = diferencas(
      {
        nome: target.name,
        email: target.email,
        cpf: target.cpf,
        telefone: target.phone,
        papel: target.role,
        seloDeMod: target.showModBadge,
      },
      {
        nome: name,
        email: email || null,
        cpf: cpf || null,
        telefone: phone || null,
        papel: finalRole,
        seloDeMod: showModBadge,
      }
    );
    // Salvar sem mexer em nada não vira linha: o histórico é do que mudou.
    if (Object.keys(mudou.depois).length > 0) {
      await registrarLog({
        acao:
          mudou.depois.papel !== undefined
            ? "usuario.papel_alterado"
            : "usuario.editado",
        tenantId,
        alvo: { tipo: "User", id, rotulo: name },
        detalhes: mudou,
      });
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

      await registrarLog({
        acao: "usuario.criado",
        tenantId,
        alvo: { tipo: "User", id: criado.id, rotulo: name },
        // A senha em si nunca entra: ela aparece uma vez na tela de quem
        // criou e o banco guarda só o hash. Registrar que a conta nasceu com
        // acesso ao painel é o que interessa aqui.
        detalhes: { papel: role, comAcessoAoPainel: Boolean(senhaTemporaria) },
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
    // Amarra a ação ao painel. getActiveTenantIdForAdmin recusa a chamada
    // vinda do host público e devolve o tenant em que este admin opera; era
    // a única escrita de usuários que não passava por ela.
    const tenantId = await getActiveTenantIdForAdmin(session.user);

    const alvo = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, email: true, tenantId: true },
    });
    if (!alvo) return { ok: false, error: "Usuário não encontrado" };

    // A senha nova aparece na tela de quem pediu. Sem conferir o painel de
    // origem, um ADMIN que descubra o id de um admin de outro tenant reseta a
    // senha dele e entra no painel alheio com o que acabou de ler.
    //
    // Vem antes das outras checagens de propósito: responder "não é conta de
    // painel" ou "sem e-mail" para um id de fora já contaria algo sobre uma
    // conta que este admin não deveria nem saber que existe.
    if (session.user.role !== "SUPER_ADMIN" && alvo.tenantId !== tenantId) {
      return {
        ok: false,
        error: "Esta conta é de outro painel. O acesso dela é gerado lá.",
      };
    }

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

    await registrarLog({
      acao: "usuario.senha_gerada",
      tenantId,
      alvo: { tipo: "User", id: userId, rotulo: alvo.email },
      detalhes: { papel: alvo.role },
    });

    revalidatePath(`/admin/usuarios/${userId}/editar`);
    return { ok: true, data: { senhaTemporaria } };
  } catch (err) {
    console.error("[gerarSenhaDePainelAction]", err);
    return { ok: false, error: "Erro ao gerar a senha" };
  }
}
