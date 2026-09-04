"use server";

// Server Actions de autenticação. Fluxo PASSWORDLESS por nome + celular:
// - registerAction: cria conta com {name, cpf, phone, phoneCountry}. Sem
//   senha, sem e-mail.
//   O CPF é digitado pelo usuário (validado por dígito verificador) e gravado
//   no User.cpf, alimenta o PIX. Não é exibido na UI depois do cadastro.
// - loginAction: autentica via nome + CPF. Sem senha.
// - logoutAction: derruba a sessão.
//
// Server Actions = funções TS que rodam SEMPRE no servidor, mesmo quando
// chamadas a partir de componentes client. CSRF é tratado nativamente.


import { prisma } from "@/lib/db";
import { getCurrentTenant } from "@/lib/tenant";
import { cookies, headers } from "next/headers";
import { COOKIE_DE_INDICACAO } from "@/lib/afiliados";

import { auth, signIn, signOut } from "@/auth";
import { hashDeSenha, emitirProvaDeAcaoCritica } from "@/server/services/otp/senha-participante";
import { participantLoginSchema, participantChangePasswordSchema } from "@/lib/validations/auth";
import { vincularIndicacao } from "@/server/services/afiliados";
import { Prisma } from "@prisma/client";
import { revogarTodasAsSessoes } from "@/server/services/otp/sessao";
import { mfaAtivo } from "@/server/services/admin/mfa";
import { exigirStepUpAdmin } from "@/server/services/admin/sessao";
import { registrarEventoDeSeguranca } from "@/server/services/admin/audit";
import { onlyDigits } from "@/lib/cpf";
import { registrarLog } from "@/server/services/activity-log";
import {
  chavesDoLogin,
  estaBloqueado,
  ipDaRequisicao,
  registrarFalha,
} from "@/server/services/login-throttle";
import bcrypt from "bcryptjs";
import {
  registerSchema,
  adminLoginSchema,
  changePasswordSchema,
} from "@/lib/validations/auth";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

// Cadastro de PARTICIPANT (FASE 10.2): CPF + senha. O telefone e contato de
// cadastro e NAO ganha phoneVerifiedAt (nao ha OTP automatico). NAO loga
// automaticamente.
export async function registerAction(
  raw: unknown
): Promise<ActionResult<{ userId: string }>> {
  const parsed = registerSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Dados invalidos", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const { name, cpf, phone, phoneCountry, senha, codigoDeIndicacao } = parsed.data;
  const ip = ipDaRequisicao(await headers());
  const chaveReg = `registro:${ip ?? "sem-ip"}`;
  if ((await estaBloqueado([chaveReg])).bloqueado) {
    return { ok: false, error: "Muitas tentativas de cadastro. Espere alguns minutos." };
  }
  await registrarFalha([chaveReg]);

  // §15 CPF/telefone ja existente: resposta neutra, sem sobrescrever/upsert.
  const conflito = await prisma.user.findFirst({ where: { OR: [{ cpf }, { phone }] }, select: { id: true } });
  if (conflito) return { ok: false, error: "Ja existe uma conta com esses dados." };

  const tenant = await getCurrentTenant();
  const codigoDoCookie = (await cookies()).get(COOKIE_DE_INDICACAO)?.value;
  try {
    const user = await prisma.user.create({
      data: {
        name, cpf, phone, phoneCountry,
        phoneVerifiedAt: null, // §10 telefone NUNCA verificado sem processo explicito
        passwordHash: await hashDeSenha(senha),
        role: "PARTICIPANT",
        tenantId: tenant?.id ?? null,
      },
      select: { id: true },
    });
    const codigo = (codigoDeIndicacao || codigoDoCookie || "").trim();
    if (codigo) await vincularIndicacao(user.id, codigo).catch(() => null);
    return { ok: true, data: { userId: user.id } };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { ok: false, error: "Ja existe uma conta com esses dados." };
    }
    return { ok: false, error: "Erro ao criar conta" };
  }
}

/// Login do participante: CPF + senha (§11/§12). Resposta neutra.
export async function loginParticipanteAction(
  raw: unknown
): Promise<ActionResult> {
  const parsed = participantLoginSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "CPF ou senha invalidos" };
  try {
    await signIn("credentials", { cpf: parsed.data.cpf, senha: parsed.data.senha, redirect: false });
    return { ok: true, data: undefined };
  } catch {
    return { ok: false, error: "CPF ou senha invalidos" };
  }
}

/// Encerra todas as sessoes do usuario autenticado (§24 logout-all).
export async function encerrarTodasAsSessoesAction(): Promise<ActionResult> {
  const sessao = await auth();
  if (!sessao?.user?.id) return { ok: false, error: "Nao autenticado" };
  await revogarTodasAsSessoes(sessao.user.id);
  await signOut({ redirect: false });
  return { ok: true, data: undefined };
}

/// Troca de telefone do participante (§22): sessao valida + senha atual. O
/// novo telefone entra como NAO verificado (phoneVerifiedAt=null); telefone
/// nao e fator de login. Revoga todas as sessoes.
export async function trocarTelefoneComSenhaAction(
  raw: unknown
): Promise<ActionResult> {
  const sessao = await auth();
  if (!sessao?.user?.id) return { ok: false, error: "Nao autenticado" };
  const r = raw as { phone?: unknown; phoneCountry?: unknown; senha?: unknown };
  const phone = onlyDigits(String(r?.phone ?? ""));
  const phoneCountry = String(r?.phoneCountry ?? "BR");
  const senha = typeof r?.senha === "string" ? r.senha : "";
  if (phone.length < 6 || !senha) return { ok: false, error: "Dados invalidos" };

  const user = await prisma.user.findUnique({ where: { id: sessao.user.id }, select: { passwordHash: true } });
  const confere = user?.passwordHash ? await bcrypt.compare(senha, user.passwordHash) : false;
  if (!confere) return { ok: false, error: "Senha incorreta." };

  const emUso = await prisma.user.findFirst({ where: { phone, id: { not: sessao.user.id } }, select: { id: true } });
  if (emUso) return { ok: false, error: "Telefone em uso por outra conta." };

  await prisma.user.update({ where: { id: sessao.user.id }, data: { phone, phoneCountry, phoneVerifiedAt: null } });
  await revogarTodasAsSessoes(sessao.user.id);
  await signOut({ redirect: false });
  return { ok: true, data: undefined };
}

/// Reauth de acao critica do participante por SENHA (§19/§20). Verifica a senha
/// e emite uma prova single-use (challengeId + prova). A action critica consome.
export async function provarAcaoCriticaComSenhaAction(
  raw: unknown
): Promise<ActionResult<{ challengeId: string; prova: string }>> {
  const sessao = await auth();
  if (!sessao?.user?.id) return { ok: false, error: "Nao autenticado" };
  const senha = typeof (raw as { senha?: unknown })?.senha === "string" ? (raw as { senha: string }).senha : "";
  if (!senha) return { ok: false, error: "Informe a senha." };
  const prova = await emitirProvaDeAcaoCritica({ userId: sessao.user.id, senha });
  if (!prova) return { ok: false, error: "Senha incorreta." };
  return { ok: true, data: prova };
}

/// Troca de senha do participante (§18): senha atual -> nova -> revoga sessoes.
export async function trocarSenhaParticipanteAction(
  raw: unknown
): Promise<ActionResult> {
  const sessao = await auth();
  if (!sessao?.user?.id) return { ok: false, error: "Nao autenticado" };
  const parsed = participantChangePasswordSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados invalidos", fieldErrors: parsed.error.flatten().fieldErrors };
  const user = await prisma.user.findUnique({ where: { id: sessao.user.id }, select: { passwordHash: true } });
  const confere = user?.passwordHash ? await bcrypt.compare(parsed.data.senhaAtual, user.passwordHash) : false;
  if (!confere) return { ok: false, error: "Senha atual incorreta." };
  await prisma.user.update({ where: { id: sessao.user.id }, data: { passwordHash: await hashDeSenha(parsed.data.novaSenha) } });
  await revogarTodasAsSessoes(sessao.user.id);
  await signOut({ redirect: false });
  return { ok: true, data: undefined };
}

// LEGADO OTP: caminhos antigos de login por OTP permanentemente FECHADOS (§37).
export async function loginAction(): Promise<ActionResult> {
  return { ok: false, error: "Entre com CPF e senha." };
}
export async function solicitarCodigoDeLoginAction(): Promise<ActionResult<{ challengeId: string }>> {
  return { ok: false, error: "Entre com CPF e senha." };
}
export async function entrarComCodigoAction(): Promise<ActionResult> {
  return { ok: false, error: "Entre com CPF e senha." };
}

// Entrada do painel. Mensagem de erro única de propósito: dizer "e-mail não
// encontrado" entregaria quais contas existem para quem estivesse testando.
export async function adminLoginAction(raw: unknown): Promise<ActionResult> {
  const parsed = adminLoginSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "E-mail ou senha inválidos" };
  }

  const freio = await estaBloqueado(
    chavesDoLogin(ipDaRequisicao(await headers()), parsed.data.email.toLowerCase())
  );
  if (freio.bloqueado) {
    return {
      ok: false,
      error: `Muitas tentativas. Espere ${Math.ceil(freio.segundos / 60)} minuto(s) e tente de novo.`,
    };
  }

  try {
    await signIn("admin-password", {
      email: parsed.data.email,
      password: parsed.data.password,
      totp: parsed.data.totp ?? "",
      redirect: false,
    });
    return { ok: true, data: undefined };
  } catch {
    // Não loga o erro com os dados: a senha vem no objeto de credenciais.
    return { ok: false, error: "E-mail ou senha inválidos" };
  }
}

// Troca da própria senha. Exige a atual mesmo com sessão válida, sessão
// roubada não deve conseguir trocar a senha e trancar o dono para fora.
export async function changeOwnPasswordAction(
  raw: unknown
): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "Sessão expirada. Entre de novo." };

  const parsed = changePasswordSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Dados inválidos",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, passwordHash: true },
  });
  if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) {
    return { ok: false, error: "Sem permissão" };
  }
  if (!user.passwordHash) {
    return { ok: false, error: "Esta conta ainda não tem senha definida" };
  }

  const confere = await bcrypt.compare(
    parsed.data.currentPassword,
    user.passwordHash
  );
  if (!confere) return { ok: false, error: "Senha atual incorreta" };

  // §18 troca de senha e CRITICAL: exige step-up quando a conta tem MFA ativa.
  if (await mfaAtivo(user.id)) {
    const totp = typeof (parsed.data as { totp?: string }).totp === "string" ? (parsed.data as { totp: string }).totp : "";
    if (!(await exigirStepUpAdmin(user.id, totp))) {
      return { ok: false, error: "Confirmacao de seguranca (MFA) necessaria." };
    }
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await bcrypt.hash(parsed.data.newPassword, 12),
      mustChangePassword: false,
    },
  });

  // §7/§8 revoga TODAS as sessoes (incremento atomico) e audita. A propria
  // sessao que trocou tambem cai: forca novo login (preferencia declarada).
  await revogarTodasAsSessoes(user.id);
  await registrarEventoDeSeguranca({ action: "PASSWORD_CHANGE", actorAdminId: user.id, targetType: "User", targetId: user.id });

  // Trocar a própria senha é o movimento clássico de quem tomou uma conta e
  // quer ficar dentro dela. Sem esta linha, a única troca de senha que o
  // histórico enxergava era a feita por outra pessoa no painel.
  //
  // Nenhuma senha entra aqui, nem a antiga nem a nova: o registro diz que
  // aconteceu, e é só isso que ele precisa dizer.
  await registrarLog({
    acao: "usuario.senha_gerada",
    tenantId: session?.user?.tenantId ?? null,
    alvo: { tipo: "User", id: user.id },
    detalhes: { o_que: "trocou a propria senha" },
  });

  // A sessao atual foi revogada junto: encerra o cookie para forcar novo login.
  await signOut({ redirect: false });
  return { ok: true, data: undefined };
}

export async function logoutAction() {
  await signOut({ redirectTo: "/" });
}
