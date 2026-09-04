import { NextResponse } from "next/server";

// LIVENESS (P1-C 9 §19): o processo responde. Read-only, SEM segredo, sem tocar
// o banco. Expoe o release id (commit sha) para PROVAR o drain do OLD: durante
// o rollout, o operador confere que 100% das respostas trazem o sha do NEW.
export const dynamic = "force-dynamic";

export function GET() {
  const releaseId =
    process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ??
    process.env.RELEASE_ID ??
    "dev";
  return NextResponse.json(
    { status: "ok", release: releaseId, ts: new Date().toISOString() },
    { headers: { "cache-control": "no-store" } },
  );
}
