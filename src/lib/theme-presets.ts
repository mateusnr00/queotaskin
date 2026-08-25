// Mapa de presets de cor pra personalização do tema. Cada entrada define:
//   color     → cor "central" do swatch (oklch) usada como --primary
//   foreground→ cor de texto sobre o color (claro/escuro auto)
//   accent    → background suave do mesmo tom (--accent)
//   accentFg  → texto sobre o accent
//
// Os valores ficam em CSS oklch pra fácil interpolação. O componente
// admin "personalizar tema" mostra o swatch usando o mesmo "color".
// O root layout lê o preset do banco e injeta um <style> com overrides
// de variáveis CSS, sobrescrevendo os defaults definidos em globals.css.

export type ThemePresetKey =
  | "default"
  | "purple"
  | "cyan"
  | "blue"
  | "orange"
  | "red"
  | "indigo"
  | "teal"
  | "lime"
  | "yellow"
  | "pink"
  | "brown"
  | "grey"
  | "deepOrange"
  | "deepPurple"
  | "blueGrey"
  | "amber"
  | "lightBlue"
  | "cs2";

export interface ThemePreset {
  label: string;
  /** Cor sólida usada como --primary e exibida no swatch. */
  color: string;
  /** Texto que vai sobre --primary (claro pra cores escuras, escuro pras claras). */
  foreground: string;
  /** Background suave do mesmo tom (--accent). */
  accent: string;
  /** Texto sobre --accent. */
  accentFg: string;
}

export const THEME_PRESETS: Record<ThemePresetKey, ThemePreset> = {
  default: {
    label: "Padrão",
    color: "oklch(0.55 0.02 250)",
    foreground: "oklch(0.98 0 0)",
    accent: "oklch(0.95 0.01 250)",
    accentFg: "oklch(0.30 0.02 250)",
  },
  purple: {
    label: "Roxo",
    color: "oklch(0.55 0.20 295)",
    foreground: "oklch(0.98 0 0)",
    accent: "oklch(0.95 0.05 295)",
    accentFg: "oklch(0.32 0.18 295)",
  },
  cyan: {
    label: "Ciano",
    color: "oklch(0.68 0.13 200)",
    foreground: "oklch(0.18 0.02 250)",
    accent: "oklch(0.95 0.04 200)",
    accentFg: "oklch(0.34 0.13 200)",
  },
  blue: {
    label: "Azul",
    color: "oklch(0.58 0.18 250)",
    foreground: "oklch(0.98 0 0)",
    accent: "oklch(0.95 0.04 250)",
    accentFg: "oklch(0.34 0.18 250)",
  },
  orange: {
    label: "Laranja",
    color: "oklch(0.78 0.17 70)",
    foreground: "oklch(0.18 0.02 250)",
    accent: "oklch(0.95 0.05 80)",
    accentFg: "oklch(0.32 0.12 60)",
  },
  red: {
    label: "Vermelho",
    color: "oklch(0.62 0.22 25)",
    foreground: "oklch(0.98 0 0)",
    accent: "oklch(0.95 0.05 25)",
    accentFg: "oklch(0.34 0.20 25)",
  },
  indigo: {
    label: "Índigo",
    color: "oklch(0.54 0.18 275)",
    foreground: "oklch(0.98 0 0)",
    accent: "oklch(0.95 0.04 275)",
    accentFg: "oklch(0.32 0.18 275)",
  },
  teal: {
    label: "Teal",
    color: "oklch(0.62 0.12 180)",
    foreground: "oklch(0.98 0 0)",
    accent: "oklch(0.95 0.03 180)",
    accentFg: "oklch(0.34 0.12 180)",
  },
  lime: {
    label: "Lima",
    color: "oklch(0.82 0.18 125)",
    foreground: "oklch(0.18 0.02 250)",
    accent: "oklch(0.96 0.06 125)",
    accentFg: "oklch(0.32 0.12 125)",
  },
  yellow: {
    label: "Amarelo",
    color: "oklch(0.88 0.16 95)",
    foreground: "oklch(0.18 0.02 250)",
    accent: "oklch(0.97 0.06 95)",
    accentFg: "oklch(0.32 0.14 95)",
  },
  pink: {
    label: "Rosa",
    color: "oklch(0.72 0.18 340)",
    foreground: "oklch(0.18 0.02 250)",
    accent: "oklch(0.96 0.04 340)",
    accentFg: "oklch(0.34 0.16 340)",
  },
  brown: {
    label: "Marrom",
    color: "oklch(0.45 0.08 50)",
    foreground: "oklch(0.98 0 0)",
    accent: "oklch(0.94 0.03 50)",
    accentFg: "oklch(0.34 0.08 50)",
  },
  grey: {
    label: "Cinza",
    color: "oklch(0.55 0.01 250)",
    foreground: "oklch(0.98 0 0)",
    accent: "oklch(0.95 0.01 250)",
    accentFg: "oklch(0.32 0.01 250)",
  },
  deepOrange: {
    label: "Laranja escuro",
    color: "oklch(0.67 0.20 45)",
    foreground: "oklch(0.98 0 0)",
    accent: "oklch(0.95 0.05 45)",
    accentFg: "oklch(0.34 0.18 45)",
  },
  deepPurple: {
    label: "Roxo escuro",
    color: "oklch(0.43 0.20 295)",
    foreground: "oklch(0.98 0 0)",
    accent: "oklch(0.93 0.05 295)",
    accentFg: "oklch(0.32 0.18 295)",
  },
  blueGrey: {
    label: "Azul acinzentado",
    color: "oklch(0.52 0.04 240)",
    foreground: "oklch(0.98 0 0)",
    accent: "oklch(0.94 0.02 240)",
    accentFg: "oklch(0.32 0.04 240)",
  },
  // Preset do QuéOta Skin: o laranja quente do HUD do Counter-Strike.
  // Foi calibrado pra ficar legível sobre o fundo escuro (themeMode DARK),
  // que é como o público de CS espera ver um site de skins.
  cs2: {
    label: "CS2 (QuéOta Skin)",
    color: "oklch(0.70 0.19 48)",
    foreground: "oklch(0.15 0.02 250)",
    accent: "oklch(0.28 0.06 48)",
    accentFg: "oklch(0.88 0.10 60)",
  },
  amber: {
    label: "Âmbar",
    color: "oklch(0.80 0.16 80)",
    foreground: "oklch(0.18 0.02 250)",
    accent: "oklch(0.96 0.06 80)",
    accentFg: "oklch(0.32 0.14 80)",
  },
  lightBlue: {
    label: "Azul claro",
    color: "oklch(0.72 0.13 230)",
    foreground: "oklch(0.18 0.02 250)",
    accent: "oklch(0.95 0.04 230)",
    accentFg: "oklch(0.34 0.13 230)",
  },
};

export const THEME_PRESET_KEYS = Object.keys(THEME_PRESETS) as ThemePresetKey[];

export function isThemePresetKey(v: string): v is ThemePresetKey {
  return v in THEME_PRESETS;
}

// Gera o bloco CSS que sobrescreve as variáveis do tema baseado no preset.
// Usado pelo root layout pra injetar como <style> antes de qualquer
// componente renderizar.
export function themePresetCss(key: ThemePresetKey): string {
  const p = THEME_PRESETS[key];
  return `:root {
  --primary: ${p.color};
  --primary-foreground: ${p.foreground};
  --accent: ${p.accent};
  --accent-foreground: ${p.accentFg};
  --ring: ${p.color};
  --sidebar-primary: ${p.color};
  --sidebar-primary-foreground: ${p.foreground};
  --sidebar-accent: ${p.accent};
  --sidebar-accent-foreground: ${p.accentFg};
  --sidebar-ring: ${p.color};
  --chart-1: ${p.color};
}`;
}
