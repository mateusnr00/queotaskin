// Hook de boot do Next.js. Em producao, valida os invariantes de seguranca do
// ambiente e derruba o processo se algum faltar (fail-fast, P1-C §5).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateProductionEnvironment } = await import("@/lib/env-validation");
    validateProductionEnvironment();
  }
}
