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
import { solicitarOtpDeLogin } from "@/server/services/otp/login";
import { provedorDeOtp } from "@/server/services/otp/provider";
import { solicitarCadastro, concluirCadastro } from "@/server/services/otp/registro";
import { revogarTodasAsSessoes } from "@/server/services/otp/sessao";
import { registrarEventoDeSeguranca } from "@/server/services/admin/audit";
import { criarDesafio } from "@/server/services/otp/otp-service";
import { trocarTelefoneVerificado } from "@/server/services/otp/conta";
import { onlyDigits } from "@/lib/cpf";
import { registrarLog } from "@/server/services/activity-log";
import {
  chavesDoLogin,
  estaBloqueado,
  ipDaRequisicao,
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

// Cria nova conta de PARTICIPANT. NÃO loga automaticamente; o componente
// chama loginAction logo depois com os mesmos dados.
export async function registerAction(
  raw: unknown
): Promise<ActionResult<{ userId: string }>> {
  // FECHADO: cadastro nao cria mais conta autenticavel so com nome+CPF+telefone.
  // O telefone precisa ser provado por OTP antes da conta existir
  // (solicitarCadastroAction -> concluirCadastroAction). Esta action legada
  // recusa, para nao restar caminho que crie conta sem prova do telefone.
  void raw;
  return { ok: false, error: "O cadastro agora confirma seu telefone por um codigo." };
}

/// Passo 1 do cadastro: valida os dados e dispara o OTP ao telefone. Resposta
/// neutra: nao revela se CPF/telefone ja existem, e nao altera conta alguma.
export async function solicitarCadastroAction(
  raw: unknown
): Promise<ActionResult<{ challengeId: string }>> {
  const parsed = registerSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Dados invalidos", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const { name, cpf, phone, phoneCountry, codigoDeIndicacao } = parsed.data;
  const ip = ipDaRequisicao(await headers());
  const tenant = await getCurrentTenant();
  const codigoDoCookie = (await cookies()).get(COOKIE_DE_INDICACAO)?.value;
  try {
    const r = await solicitarCadastro(
      { name, cpf, phone, phoneCountry, tenantId: tenant?.id ?? null, codigoDeIndicacao: codigoDeIndicacao || codigoDoCookie || null, ip },
      provedorDeOtp(),
    );
    if ("bloqueado" in r) return { ok: false, error: "Muitas tentativas. Tente novamente em alguns minutos." };
    return { ok: true, data: { challengeId: r.challengeId } };
  } catch {
    return { ok: false, error: "Envio de codigo indisponivel no momento." };
  }
}

/// Passo 2 do cadastro: valida o OTP e cria a conta (telefone ja verificado).
export async function concluirCadastroAction(
  raw: unknown
): Promise<ActionResult<{ userId: string }>> {
  const challengeId = typeof (raw as { challengeId?: unknown })?.challengeId === "string" ? (raw as { challengeId: string }).challengeId : "";
  const codigo = typeof (raw as { codigo?: unknown })?.codigo === "string" ? (raw as { codigo: string }).codigo : "";
  if (!challengeId || !/^[0-9]{6}$/.test(codigo)) return { ok: false, error: "Codigo invalido" };
  const ip = ipDaRequisicao(await headers());
  const r = await concluirCadastro({ challengeId, codigo, ip });
  if (r.ok) return { ok: true, data: { userId: r.userId } };
  const msg = r.motivo === "BLOQUEADO" ? "Muitas tentativas. Tente novamente em alguns minutos."
    : r.motivo === "JA_EXISTE" ? "Ja existe uma conta com esses dados."
    : "Codigo incorreto ou expirado.";
  return { ok: false, error: msg };
}

/// Encerra todas as sessoes do usuario autenticado (§24 logout-all).
export async function encerrarTodasAsSessoesAction(): Promise<ActionResult> {
  const sessao = await auth();
  if (!sessao?.user?.id) return { ok: false, error: "Nao autenticado" };
  await revogarTodasAsSessoes(sessao.user.id);
  await signOut({ redirect: false });
  return { ok: true, data: undefined };
}

/// Passo 1 da troca de telefone (§9): exige sessao; dispara OTP ao NOVO numero.
export async function solicitarOtpTrocaTelefoneAction(
  raw: unknown
): Promise<ActionResult<{ challengeId: string }>> {
  const sessao = await auth();
  if (!sessao?.user?.id) return { ok: false, error: "Nao autenticado" };
  const phone = onlyDigits(String((raw as { phone?: unknown })?.phone ?? ""));
  const phoneCountry = String((raw as { phoneCountry?: unknown })?.phoneCountry ?? "BR");
  if (phone.length < 6) return { ok: false, error: "Telefone invalido" };
  try {
    const d = await criarDesafio(
      { userId: sessao.user.id, purpose: "CHANGE_PHONE", destino: { phoneCountry, phoneDigits: phone } },
      provedorDeOtp(),
    );
    return { ok: true, data: { challengeId: d.challengeId } };
  } catch {
    return { ok: false, error: "Envio de codigo indisponivel no momento." };
  }
}

/// Passo 2 da troca de telefone: sessao + OTP do novo numero. Revoga sessoes
/// antigas; a propria sessao que trocou precisa reautenticar (documentado).
export async function trocarTelefoneAction(
  raw: unknown
): Promise<ActionResult> {
  const sessao = await auth();
  if (!sessao?.user?.id) return { ok: false, error: "Nao autenticado" };
  const r = raw as { challengeId?: unknown; codigo?: unknown; phone?: unknown; phoneCountry?: unknown };
  const challengeId = typeof r?.challengeId === "string" ? r.challengeId : "";
  const codigo = typeof r?.codigo === "string" ? r.codigo : "";
  const phone = onlyDigits(String(r?.phone ?? ""));
  const phoneCountry = String(r?.phoneCountry ?? "BR");
  if (!challengeId || !/^[0-9]{6}$/.test(codigo) || phone.length < 6) {
    return { ok: false, error: "Dados invalidos" };
  }
  const out = await trocarTelefoneVerificado({
    sessao: { userId: sessao.user.id, sessionVersion: sessao.user.sessionVersion },
    novoPhone: phone,
    novoPhoneCountry: phoneCountry,
    challengeIdDoNovoTelefone: challengeId,
    codigo,
  });
  if (!out.ok) return { ok: false, error: "Nao autorizado. Confirme sua identidade e tente de novo." };
  // Sessoes antigas (incluindo esta) foram revogadas: forca reautenticacao.
  await signOut({ redirect: false });
  return { ok: true, data: undefined };
}

// Login passwordless via nome + celular. O provider Credentials no auth.ts
// busca pelo celular e confere o nome, sem senha.
export async function loginAction(
  raw: unknown
): Promise<ActionResult> {
  // A1 FECHADO: nome + CPF NÃO autenticam. CPF é identificador, não segredo.
  // O login passou a ser CPF + código (OTP) enviado ao telefone da conta, em
  // dois passos (solicitarCodigoDeLoginAction -> entrarComCodigoAction). Esta
  // action legada existe só para não deixar nenhum caminho antigo conceder
  // sessão: ela sempre recusa.
  void raw;
  return {
    ok: false,
    error: "O login agora exige o código enviado ao seu telefone.",
  };
}

/// Passo 1 do login: recebe o CPF, localiza a conta e dispara o código (OTP)
/// para o telefone cadastrado. Resposta neutra: não revela se o CPF existe.
export async function solicitarCodigoDeLoginAction(
  raw: unknown
): Promise<ActionResult<{ challengeId: string }>> {
  const cpf = typeof (raw as { cpf?: unknown })?.cpf === "string"
    ? (raw as { cpf: string }).cpf.replace(/\D/g, "")
    : "";
  if (cpf.length !== 11) {
    return { ok: false, error: "CPF inválido" };
  }
  const ip = ipDaRequisicao(await headers());
  try {
    const r = await solicitarOtpDeLogin({ cpf, ip }, provedorDeOtp());
    if ("bloqueado" in r) {
      return { ok: false, error: "Muitas tentativas. Tente novamente em alguns minutos." };
    }
    return { ok: true, data: { challengeId: r.challengeId } };
  } catch {
    // Provider real ainda não configurado (etapa seguinte). Não vaza detalhe.
    return { ok: false, error: "Envio de código indisponível no momento." };
  }
}

/// Passo 2 do login: valida o código e cria a sessão.
export async function entrarComCodigoAction(
  raw: unknown
): Promise<ActionResult> {
  const challengeId = typeof (raw as { challengeId?: unknown })?.challengeId === "string"
    ? (raw as { challengeId: string }).challengeId
    : "";
  const codigo = typeof (raw as { codigo?: unknown })?.codigo === "string"
    ? (raw as { codigo: string }).codigo
    : "";
  if (!challengeId || !/^[0-9]{6}$/.test(codigo)) {
    return { ok: false, error: "Código inválido" };
  }
  try {
    await signIn("credentials", { challengeId, codigo, redirect: false });
    return { ok: true, data: undefined };
  } catch {
    return { ok: false, error: "Código incorreto ou expirado." };
  }
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
