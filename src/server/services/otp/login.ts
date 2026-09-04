// Login por CPF + OTP. Substitui o nome+CPF passwordless (A1). O CPF é
// IDENTIFICADOR: localiza a conta e escolhe para onde mandar o código. Ele
// NÃO autentica sozinho - autentica o código enviado ao telefone da conta.
//
// Resistência a enumeração (§8): a resposta é sempre a mesma, exista ou não a
// conta. Para CPF sem conta (ou conta sem telefone) criamos um desafio "chamariz"
// (userId nulo, nada enviado), de modo que resposta, forma e caminho de código
// sejam indistinguíveis de fora. Não exibimos telefone mascarado pré-auth: isso
// revelaria a existência da conta (troca UX por segurança, decisão consciente).
import { prisma } from "@/lib/db";
import { hmac } from "@/lib/auth/cripto";
import {
  chaveDeAuth,
  limpar,
  permitido,
  registrar,
} from "@/server/services/otp/rate-limit";
import {
  criarDesafio,
  verificarDesafio,
} from "@/server/services/otp/otp-service";
import type { OtpDeliveryProvider } from "@/server/services/otp/provider";

export interface PedidoDeOtpLogin {
  cpf: string; // dígitos
  ip?: string | null;
}

export interface RespostaDeOtpLogin {
  challengeId: string;
  // Sempre "enviado" do ponto de vista de fora, seja real ou chamariz.
  enviado: true;
}

/// Passo 1: recebe CPF, freia, localiza a conta e dispara (ou finge disparar)
/// o OTP. Resposta neutra sempre.
export async function solicitarOtpDeLogin(
  pedido: PedidoDeOtpLogin,
  provider: OtpDeliveryProvider,
): Promise<RespostaDeOtpLogin | { bloqueado: true }> {
  const chaves = [chaveDeAuth("REQUEST_OTP", "cpf", pedido.cpf)];
  if (pedido.ip) chaves.push(chaveDeAuth("REQUEST_OTP", "ip", pedido.ip));

  const rate = await permitido(chaves);
  if (!rate.permitido) return { bloqueado: true };
  await registrar("REQUEST_OTP", chaves);

  // Modelo atual: PARTICIPANT é global (cpf @unique global). tenantId do
  // desafio segue o da conta quando houver (ADMIN/AFFILIATE), nulo para
  // participante - documentado no relatório.
  const user = await prisma.user.findUnique({
    where: { cpf: pedido.cpf },
    select: { id: true, tenantId: true, phone: true, phoneCountry: true, phoneVerifiedAt: true },
  });

  // REG-2 / §12 FAIL-CLOSED: telefone NAO verificado nunca vira fator. Conta
  // legada (phoneVerifiedAt NULL) cai no chamariz: nao recebe codigo e nao
  // autentica. E o cerne do blocker - migracao passa por fluxo assistido, nao
  // por mandar OTP para um telefone que nunca foi provado.
  if (user?.phone && user.phoneVerifiedAt) {
    const { challengeId } = await criarDesafio(
      {
        tenantId: user.tenantId,
        userId: user.id,
        purpose: "LOGIN",
        destino: { phoneCountry: user.phoneCountry, phoneDigits: user.phone },
      },
      provider,
    );
    return { challengeId, enviado: true };
  }

  // Chamariz: conta inexistente ou sem telefone. Cria desafio sem user, com
  // destino aleatório, e NÃO entrega. Verificar depois sempre falhará.
  const chamariz = await prisma.authChallenge.create({
    data: {
      purpose: "LOGIN",
      destinationHash: hmac(`chamariz:${crypto.randomUUID()}`),
      codeHash: hmac(`chamariz:${crypto.randomUUID()}`),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    },
    select: { id: true },
  });
  return { challengeId: chamariz.id, enviado: true };
}

export interface IdentidadeAutenticada {
  id: string;
  tenantId: string | null;
}

/// Passo 2: verifica o código do desafio de LOGIN e devolve a identidade
/// ligada ao desafio. Nome+CPF nunca entram aqui: sem código válido, nada.
export async function autenticarPorDesafioDeLogin(entrada: {
  challengeId: string;
  codigo: string;
  ip?: string | null;
}): Promise<IdentidadeAutenticada | null> {
  const chaves = [chaveDeAuth("VERIFY_OTP", "challenge", entrada.challengeId)];
  if (entrada.ip) chaves.push(chaveDeAuth("VERIFY_OTP", "ip", entrada.ip));
  if (!(await permitido(chaves)).permitido) return null;

  // Primeiro lê o desafio para amarrar tenant/user ao verificar (o binding é
  // conferido dentro de verificarDesafio contra o que passamos).
  const ch = await prisma.authChallenge.findUnique({
    where: { id: entrada.challengeId },
    select: { tenantId: true, userId: true },
  });
  if (!ch) {
    await registrar("VERIFY_OTP", chaves);
    return null;
  }

  const r = await verificarDesafio({
    challengeId: entrada.challengeId,
    codigo: entrada.codigo,
    purpose: "LOGIN",
    tenantId: ch.tenantId,
    userId: ch.userId,
  });

  if (r.resultado !== "VERIFICADO" || !r.userId) {
    await registrar("VERIFY_OTP", chaves);
    return null;
  }

  await limpar(chaves);
  const user = await prisma.user.findUnique({
    where: { id: r.userId },
    select: { id: true, tenantId: true },
  });
  return user ? { id: user.id, tenantId: user.tenantId } : null;
}
