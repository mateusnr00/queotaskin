import { prisma } from "@/lib/db";

// Freio de tentativas de login.
//
// O login do site é por nome + CPF, sem senha. Isso serve à conversão, mas
// deixa a porta aberta para varredura: com uma lista de CPFs vazados, dá para
// testar combinações até acertar, e sem freio nada no caminho reclamaria.
//
// Duas chaves, cada uma resolvendo um ataque diferente:
//
//   ip:   quem varre muitas contas vem de poucos endereços.
//   cpf:  quem insiste numa conta só troca de endereço, mas não de alvo.
//
// A contagem vive no banco porque em serverless cada requisição pode cair
// numa instância diferente: contador em memória seria zerado a cada troca, e
// o freio viraria enfeite.

// Limites diferentes por tipo de chave, e a diferença importa.
//
// Operadora de celular no Brasil põe milhares de assinantes atrás do mesmo
// endereço. Com o limite do IP igual ao da conta, dez erros de dez pessoas
// diferentes na mesma operadora trancariam todas elas, e o freio contra
// ataque viraria negação de serviço contra cliente.
//
// A conta é o alvo real e por isso aperta mais: dez tentativas contra um CPF
// específico não são engano de digitação.
const LIMITE_POR_CHAVE: Record<string, number> = {
  ip: 40,
  cpf: 10,
  // Rate-limit de abuso de recurso (custo de gateway, trava de estoque),
  // sobre a mesma tabela e janela do freio de login.
  reserva: 8, // reservas criadas por usuário na janela
  registro: 15, // cadastros por IP na janela
  poll: 30, // consultas forçadas de status por reserva na janela
  pixgen: 6, // gerações de Pix por reserva na janela
};
const LIMITE_PADRAO = 10;

export function limiteDe(chave: string): number {
  const tipo = chave.split(":", 1)[0]!;
  return LIMITE_POR_CHAVE[tipo] ?? LIMITE_PADRAO;
}

/** Janela de contagem. Sem falha nova nesse tempo, a contagem recomeça. */
const JANELA_MS = 15 * 60 * 1000;

/** Quanto tempo fica bloqueado depois de estourar o limite. */
const BLOQUEIO_MS = 15 * 60 * 1000;

export interface ResultadoDoFreio {
  bloqueado: boolean;
  /** Segundos restantes, para a mensagem ao usuário. */
  segundos: number;
}

const LIVRE: ResultadoDoFreio = { bloqueado: false, segundos: 0 };

/**
 * Chaves de um pedido de login. IP pode faltar, e quando falta a proteção
 * por conta continua valendo.
 */
export function chavesDoLogin(ip: string | null, identificador: string) {
  // O prefixo não é enfeite: é ele que escolhe o limite em limiteDe().
  const chaves = [chaveDeConta(identificador)];
  if (ip) chaves.unshift(`ip:${ip}`);
  return chaves;
}

/**
 * Só a chave da CONTA (identificador), sem a chave de IP compartilhada.
 *
 * No sucesso do login limpamos só esta: apagar a chave `ip:` (compartilhada
 * por todos atrás do mesmo endereço) num acerto zeraria o freio de varredura
 * por IP de todo mundo. Ver auth.ts.
 */
export function chaveDeConta(identificador: string): string {
  return `cpf:${identificador}`;
}

/** Extrai o IP de quem chamou, atrás do proxy da Vercel. */
export function ipDaRequisicao(headers: Headers): string | null {
  // x-real-ip é setado pela borda da Vercel com o IP de quem realmente
  // conecta, e o cliente não o sobrescreve. Preferi-lo evita que um
  // X-Forwarded-For forjado à esquerda (valor fornecido pelo cliente) vire
  // uma chave de IP nova a cada request, furando o freio. Sem x-real-ip
  // (fora da Vercel) caímos no ÚLTIMO item do XFF, o que o proxy mais próximo
  // acrescentou, não o primeiro que o cliente injeta.
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;
  const encaminhado = headers.get("x-forwarded-for");
  if (encaminhado) {
    const partes = encaminhado
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    return partes.length ? partes[partes.length - 1]! : null;
  }
  return null;
}

/**
 * Alguma das chaves está bloqueada agora?
 *
 * Falha de banco devolve livre de propósito: um erro de infraestrutura não
 * pode trancar o login de todo mundo. O freio protege contra varredura, e
 * varredura sem banco não vai a lugar nenhum de qualquer forma.
 */
export async function estaBloqueado(
  chaves: string[]
): Promise<ResultadoDoFreio> {
  try {
    const agora = new Date();
    const registros = await prisma.loginAttempt.findMany({
      where: { chave: { in: chaves }, bloqueadoAte: { gt: agora } },
      select: { bloqueadoAte: true },
    });
    if (registros.length === 0) return LIVRE;

    const ate = registros
      .map((r) => r.bloqueadoAte!.getTime())
      .reduce((a, b) => Math.max(a, b));
    return {
      bloqueado: true,
      segundos: Math.max(1, Math.ceil((ate - agora.getTime()) / 1000)),
    };
  } catch (err) {
    console.error("[login-throttle] falha ao consultar:", err);
    return LIVRE;
  }
}

/** Registra uma tentativa falha em cada chave. */
export async function registrarFalha(chaves: string[]): Promise<void> {
  const agora = new Date();
  const inicioDaJanela = new Date(agora.getTime() - JANELA_MS);

  for (const chave of chaves) {
    try {
      const atual = await prisma.loginAttempt.findUnique({ where: { chave } });

      // Sem registro, ou janela vencida: a contagem recomeça do um. Sem isso,
      // uma falha por mês somaria até bloquear alguém que nunca atacou nada.
      if (!atual || atual.desde < inicioDaJanela) {
        await prisma.loginAttempt.upsert({
          where: { chave },
          create: { chave, falhas: 1, desde: agora },
          update: { falhas: 1, desde: agora, bloqueadoAte: null },
        });
        continue;
      }

      const falhas = atual.falhas + 1;
      await prisma.loginAttempt.update({
        where: { chave },
        data: {
          falhas,
          bloqueadoAte:
            falhas >= limiteDe(chave)
              ? new Date(agora.getTime() + BLOQUEIO_MS)
              : null,
        },
      });
    } catch (err) {
      console.error("[login-throttle] falha ao registrar:", err);
    }
  }
}

/**
 * Zera a contagem depois de um login certo.
 *
 * Sem isto, quem erra a digitação algumas vezes e depois acerta carregaria as
 * falhas antigas até a janela vencer, e seria bloqueado na próxima sessão por
 * erros que já tinham sido resolvidos.
 */
export async function limparFalhas(chaves: string[]): Promise<void> {
  try {
    await prisma.loginAttempt.deleteMany({ where: { chave: { in: chaves } } });
  } catch (err) {
    console.error("[login-throttle] falha ao limpar:", err);
  }
}
