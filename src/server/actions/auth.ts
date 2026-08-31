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

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { getCurrentTenant } from "@/lib/tenant";
import { cookies, headers } from "next/headers";
import { COOKIE_DE_INDICACAO } from "@/lib/afiliados";
import { vincularIndicacao } from "@/server/services/afiliados";

import { auth, signIn, signOut } from "@/auth";
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
  loginSchema,
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
  const parsed = registerSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Dados inválidos",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const { name, cpf, phone, phoneCountry, codigoDeIndicacao } = parsed.data;

  // Freio por IP: o cadastro é sem senha e sem captcha, então é criação livre
  // de contas (munição para abuso de reserva) e um oráculo de enumeração. Usa
  // o mesmo freio do login, por IP.
  const ipReg = ipDaRequisicao(await headers());
  const chaveReg = `registro:${ipReg ?? "sem-ip"}`;
  if ((await estaBloqueado([chaveReg])).bloqueado) {
    return {
      ok: false,
      error: "Muitas tentativas de cadastro. Espere alguns minutos e tente de novo.",
    };
  }
  await registrarFalha([chaveReg]);

  // Onde a pessoa se cadastrou.
  //
  // Sem isso a conta nasce solta e não aparece em Clientes até a primeira
  // compra, porque a lista acha o cliente por vínculo com o tenant ou por
  // reserva, e quem acabou de se cadastrar não tem nenhum dos dois. Quem
  // criou conta e não comprou é exatamente o cliente que o painel precisa
  // enxergar para ir atrás.
  //
  // Não muda o que o schema diz: PARTICIPANT continua global, podendo
  // comprar em qualquer tenant, porque a lista também casa por reserva. Isto
  // aqui só registra a porta de entrada.
  const tenant = await getCurrentTenant();

  try {
    const user = await prisma.user.create({
      data: {
        name,
        cpf,
        phone,
        phoneCountry,
        role: "PARTICIPANT",
        tenantId: tenant?.id ?? null,
      },
      select: { id: true },
    });

    // O VÍNCULO COM QUEM INDICOU.
    //
    // Vem do campo do formulário quando a pessoa digitou, e do cookie quando
    // ela chegou por /?ref=CODIGO dias atrás. Roda depois da conta existir e
    // nunca derruba o cadastro: código inexistente, autoindicação ou afiliado
    // suspenso simplesmente não vinculam, e a conta é criada igual.
    const codigoDoCookie = (await cookies()).get(COOKIE_DE_INDICACAO)?.value;
    const codigo = (codigoDeIndicacao || codigoDoCookie || "").trim();
    if (codigo) {
      const vinculado = await vincularIndicacao(user.id, codigo);
      if (vinculado) {
        void registrarLog({
          acao: "afiliado.indicacao_vinculada",
          tenantId: tenant?.id ?? null,
          origem: "PUBLICO",
          ator: { id: user.id, nome: name, papel: "PARTICIPANT" },
          alvo: { tipo: "User", id: user.id },
          detalhes: { codigo: vinculado },
        });
      }
    }

    return { ok: true, data: { userId: user.id } };
  } catch (err) {
    // P2002 = unique constraint violation. Phone e cpf são unique.
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      // Mensagem única, sem distinguir a coluna (phone/cpf): uma resposta
      // específica por campo vira oráculo de enumeração de quem já tem conta.
      return { ok: false, error: "Já existe uma conta com esses dados." };
    }
    console.error("[registerAction] erro criando user:", err);
    return { ok: false, error: "Erro ao criar conta" };
  }
}

// Login passwordless via nome + celular. O provider Credentials no auth.ts
// busca pelo celular e confere o nome, sem senha.
export async function loginAction(
  raw: unknown
): Promise<ActionResult> {
  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Nome ou CPF inválido",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const freio = await estaBloqueado(
    chavesDoLogin(ipDaRequisicao(await headers()), parsed.data.cpf)
  );
  if (freio.bloqueado) {
    // Dizer que está bloqueado é melhor do que repetir "não encontrado": sem
    // isso a pessoa que errou a digitação fica tentando sem entender por que
    // o login parou de funcionar. Quem ataca já sabe que errou dez vezes.
    return {
      ok: false,
      error: `Muitas tentativas. Espere ${Math.ceil(freio.segundos / 60)} minuto(s) e tente de novo.`,
    };
  }

  try {
    await signIn("credentials", {
      name: parsed.data.name,
      cpf: parsed.data.cpf,
      redirect: false,
    });
    return { ok: true, data: undefined };
  } catch {
    // Sem log do erro: o objeto de credenciais carrega o CPF.
    return { ok: false, error: "Nome ou CPF não encontrado" };
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

  return { ok: true, data: undefined };
}

export async function logoutAction() {
  await signOut({ redirectTo: "/" });
}
