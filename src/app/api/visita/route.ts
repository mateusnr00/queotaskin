// Recebe o aviso de que uma página do site foi aberta.
//
// Por que uma rota, e não contar no render do servidor: o render acontece
// também para robô de busca, para o prefetch do próprio Next e para o
// verificador de link do WhatsApp. Contar ali encheria o painel de visitas
// que nunca foram gente. Aqui só chega quem tem navegador e roda JavaScript.
//
// A identidade do visitante é um cookie sorteado, sem nada de pessoal dentro:
// serve só para não contar a mesma pessoa duas vezes no mesmo dia. O segundo
// cookie guarda o último dia contado, para a virada de meia-noite valer sem
// precisar consultar o banco.

import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { estaBloqueado, registrarFalha, ipDaRequisicao } from "@/server/services/login-throttle";

import { getCurrentTenant } from "@/lib/tenant";
import {
  diaEmBrasilia,
  registrarVisita,
  registrarVisitaDeCanal,
} from "@/server/services/visitas";

const COOKIE_VISITANTE = "qos_v";
const COOKIE_DIA = "qos_vd";
const UM_ANO = 60 * 60 * 24 * 365;

export async function POST(req: Request) {
  try {
    const tenant = await getCurrentTenant();
    // Host sem tenant: nada a contar, e responder erro daria log de erro em
    // toda visita a um domínio que ainda não foi apontado.
    if (!tenant) return NextResponse.json({ ok: true, ignorado: true });

    // F-07 anti-abuso: o contador e incrementado a cada POST. Sem freio, da
    // para inflar a metrica trivialmente. Freio por IP confiavel (mesma
    // infra do login). Bloqueado -> responde ok e nao conta.
    const ip = ipDaRequisicao(await headers());
    const chaveVisita = `visita:${ip ?? "sem-ip"}`;
    if ((await estaBloqueado([chaveVisita])).bloqueado) {
      return NextResponse.json({ ok: true, ignorado: true });
    }
    await registrarFalha([chaveVisita]);

    const jar = await cookies();
    const hoje = diaEmBrasilia().toISOString().slice(0, 10);
    const diaAnterior = jar.get(COOKIE_DIA)?.value;
    const novoNoDia = diaAnterior !== hoje;

    if (!jar.get(COOKIE_VISITANTE)) {
      jar.set(COOKIE_VISITANTE, crypto.randomUUID(), {
        maxAge: UM_ANO,
        httpOnly: true,
        sameSite: "lax",
        path: "/",
      });
    }
    if (novoNoDia) {
      jar.set(COOKIE_DIA, hoje, {
        maxAge: UM_ANO,
        httpOnly: true,
        sameSite: "lax",
        path: "/",
      });
    }

    await registrarVisita(tenant.id, novoNoDia);

    // Quando a página aberta é um sorteio E o link trazia um canal, conta
    // também para aquele canal. É o que responde "qual divulgação está
    // trazendo gente para este sorteio".
    const corpo = (await req.json().catch(() => null)) as
      | { slug?: unknown; canal?: unknown }
      | null;
    const slug = typeof corpo?.slug === "string" ? corpo.slug : null;
    const canal = typeof corpo?.canal === "string" ? corpo.canal : null;
    if (slug && canal) {
      await registrarVisitaDeCanal(tenant.id, slug, canal);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    // Falhar aqui não pode atrapalhar quem está navegando: o contador é
    // secundário, e a página já está na tela quando este aviso sai.
    console.error("[api/visita]", err);
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
