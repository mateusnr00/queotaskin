// Alteracao de Steam Trade URL: dado sensivel (destino da skin). Exige sessao
// valida + reauth CRITICAL_ACTION single-use (§8/§27). Nucleo sem NextAuth.
import { prisma } from "@/lib/db";
import { steamIdFromTradeUrl } from "@/lib/cs2";
import {
  exigirReautenticacao,
  validarSessaoParticipante,
  type SessaoParticipante,
} from "@/server/services/otp/sessao-participante";

export type ResultadoSteam =
  | { ok: true }
  | { ok: false; motivo: "SESSAO_INVALIDA" | "REAUTH_INVALIDA" };

export async function alterarSteamTradeUrl(entrada: {
  sessao: SessaoParticipante;
  steamTradeUrl: string | null;
  reauth: { challengeId: string; codigo: string };
}): Promise<ResultadoSteam> {
  const sess = await validarSessaoParticipante(entrada.sessao);
  if (!sess.ok) return { ok: false, motivo: "SESSAO_INVALIDA" };

  const provou = await exigirReautenticacao({
    userId: sess.userId,
    challengeId: entrada.reauth.challengeId,
    codigo: entrada.reauth.codigo,
  });
  if (!provou) return { ok: false, motivo: "REAUTH_INVALIDA" };

  await prisma.user.update({
    where: { id: sess.userId },
    data: {
      steamTradeUrl: entrada.steamTradeUrl,
      steamId: entrada.steamTradeUrl ? steamIdFromTradeUrl(entrada.steamTradeUrl) : null,
    },
  });
  return { ok: true };
}
