// Helpers de autorização, chamados no topo de Server Components/Actions
// que exigem perfil específico.
//
// IMPORTANTE: o JWT do NextAuth guarda o `role` no momento do login. Se o
// admin promove alguém, o JWT antigo continuaria mostrando o role antigo
// até a pessoa relogar. Por isso aqui consultamos o role direto do banco
// em todas as checagens admin, assim a promoção vale imediatamente, sem
// precisar logout/login.
//
// Multi-tenant: ADMIN só pode operar no tenant ao qual pertence
// (User.tenantId). SUPER_ADMIN é global, opera em qualquer tenant
// (geralmente o tenant resolvido pelo host atual).

import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { ForbiddenError, UnauthorizedError } from "@/lib/errors";
import { validarSessaoParticipante, donoOuAdminPodeAcessar, sessaoFoiRevogada } from "@/server/services/otp/sessao-participante";

export async function requireAuth() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  return session;
}

// Consulta o role + tenant atuais no banco. Devolve null se o usuário sumiu.
async function freshUser(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, tenantId: true, mustChangePassword: true },
  });
}

// Garante que o usuário é ADMIN ou SUPER_ADMIN. Retorna a session enriquecida
// com role + tenantId atualizados (não o que tinha no JWT).
export async function requireAdmin() {
  const sessao = await requireAdminSemTrocaDeSenha();
  // Senha temporária tranca o painel inteiro até ser trocada. Deixar navegar
  // com ela esvazia o reset: a senha que foi entregue por fora continuaria
  // valendo indefinidamente.
  if (sessao.mustChangePassword) {
    redirect("/trocar-senha");
  }
  return sessao;
}

/**
 * Igual ao requireAdmin, mas sem redirecionar quem tem senha temporária,
 * usado pela própria tela de troca de senha, que senão redirecionaria para
 * si mesma em laço.
 */
export async function requireAdminSemTrocaDeSenha() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }
  const fresh = await freshUser(session.user.id);
  if (!fresh || (fresh.role !== "ADMIN" && fresh.role !== "SUPER_ADMIN")) {
    redirect("/");
  }
  return {
    mustChangePassword: fresh.mustChangePassword,
    ...session,
    user: {
      ...session.user,
      role: fresh.role,
      tenantId: fresh.tenantId,
    },
  };
}

// Só SUPER_ADMIN passa. Usado em telas de gerenciamento global (criação
// de tenants, listagem cross-tenant, etc).
export async function requireSuperAdmin() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }
  const fresh = await freshUser(session.user.id);
  if (!fresh || fresh.role !== "SUPER_ADMIN") {
    redirect("/admin");
  }
  return {
    ...session,
    user: {
      ...session.user,
      role: fresh.role,
      tenantId: fresh.tenantId,
    },
  };
}

// Para Server Actions: lança erro tipado em vez de redirecionar.
export async function getSessionOrThrow() {
  const session = await auth();
  if (!session?.user) throw new UnauthorizedError();
  return session;
}

export async function getAdminOrThrow() {
  const session = await auth();
  if (!session?.user?.id) throw new UnauthorizedError();
  const fresh = await freshUser(session.user.id);
  if (!fresh || (fresh.role !== "ADMIN" && fresh.role !== "SUPER_ADMIN")) {
    throw new ForbiddenError();
  }
  // Senha temporária tranca também as server actions, não só as páginas
  // (requireAdmin faz o redirect). Sem isto, um admin com senha temporária
  // invoca actions direto e opera sem nunca rotacionar a senha entregue por
  // fora, esvaziando o reset.
  if (fresh.mustChangePassword) {
    throw new ForbiddenError();
  }
  return {
    ...session,
    user: {
      ...session.user,
      role: fresh.role,
      tenantId: fresh.tenantId,
    },
  };
}

export async function getSuperAdminOrThrow() {
  const session = await auth();
  if (!session?.user?.id) throw new UnauthorizedError();
  const fresh = await freshUser(session.user.id);
  if (!fresh || fresh.role !== "SUPER_ADMIN") {
    throw new ForbiddenError();
  }
  return {
    ...session,
    user: {
      ...session.user,
      role: fresh.role,
      tenantId: fresh.tenantId,
    },
  };
}

// Isolamento entre usuários para recursos endereçados por link
// (capability-URL, ex.: comprovante e caixa surpresa, alcançados por um cuid
// não-adivinhável):
//
// - COM sessão: o usuário logado só acessa o que é dele; admin também passa.
//   Impede que um usuário logado abra o recurso de OUTRO com um id alheio.
// - SEM sessão: o próprio link é a credencial (quem tem o cuid acessa): é o
//   modelo do comprovante compartilhável, então não exigimos conta.
//
// O role aqui vem da sessão, não do banco: é decisão de LEITURA/posse, não
// operação privilegiada de painel. As escritas de painel são host-bound e
// releem o role fresco em getAdminOrThrow/getActiveTenantIdForAdmin.
export async function sessionMayAccessOwnedResource(
  ownerUserId: string | null | undefined
): Promise<boolean> {
  const session = await auth();
  // §21: sessao REVOGADA nao acessa recurso privado autenticado, mesmo que o
  // ownership ainda bata. Deslogado (capability-URL) segue por outro caminho.
  if (session?.user?.id) {
    const revogada = await sessaoFoiRevogada({ userId: session.user.id, sessionVersion: session.user.sessionVersion });
    if (revogada) return false;
  }
  return donoOuAdminPodeAcessar(session?.user?.id, session?.user?.role, ownerUserId);
}

/**
 * Quem está olhando é do painel deste site?
 *
 * Serve para a PRÉ-VISUALIZAÇÃO: a página de uma campanha em rascunho ou na
 * fila do cronograma responde 404 para o mundo, e continua abrindo para quem
 * administra o painel. Sem isso, preparar a campanha viraria trabalho às
 * cegas: não haveria como olhar a página antes de publicar.
 *
 * O papel vem do banco, e não do JWT: admin rebaixado hoje continuaria com
 * "ADMIN" no token até relogar, e passaria por aqui vendo o calendário do
 * site inteiro.
 */
export async function ehDoPainel(tenantId: string): Promise<boolean> {
  const session = await auth();
  const uid = session?.user?.id;
  if (!uid) return false;
  const fresh = await freshUser(uid);
  if (!fresh) return false;
  if (fresh.role === "SUPER_ADMIN") return true;
  return fresh.role === "ADMIN" && fresh.tenantId === tenantId;
}


// Sessao de participante VALIDADA para acao protegida (§2). Exige sessao,
// confirma o sessionVersion contra o banco (revogacao/logout-all) e recusa
// sessao legada (sem claim confiavel). Retorna so o userId da SESSAO - nunca
// do request (§3). Lanca em falha (fail-closed).
export async function requireValidParticipantSession(): Promise<{ userId: string }> {
  const session = await auth();
  const v = await validarSessaoParticipante(
    session?.user?.id
      ? { userId: session.user.id, sessionVersion: session.user.sessionVersion }
      : null,
  );
  if (!v.ok) throw new UnauthorizedError();
  return { userId: v.userId };
}
