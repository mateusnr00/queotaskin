/**
 * Mascara o sobrenome para exibição pública: "João da Silva" → "João da S****".
 *
 * O ranking é público, então o nome completo de quem gasta muito não pode
 * ficar exposto — é um convite a engenharia social.
 */
export function maskName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Participante";
  if (parts.length === 1) {
    const only = parts[0];
    return only.length <= 3 ? only : `${only.slice(0, 3)}****`;
  }
  const last = parts[parts.length - 1];
  return [...parts.slice(0, -1), `${last.charAt(0)}****`].join(" ");
}
