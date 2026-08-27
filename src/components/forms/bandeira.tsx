import { Globe } from "lucide-react";

// Bandeiras redondas, desenhadas em SVG.
//
// Emoji não serve: o Windows não tem fonte de bandeiras e mostra as duas
// letras do país no lugar do desenho, que foi o "BR" cinza que aparecia no
// seletor. Imagem de CDN também não: são dezessete requisições a um host de
// fora numa tela de cadastro, e a arte precisa aparecer antes de a pessoa
// escolher.
//
// São simplificações deliberadas. Num círculo de 20px o que identifica uma
// bandeira são as faixas e as cores; brasão de Portugal, águia do México e
// sol do Uruguai viram borrão nesse tamanho, então entram como uma marca
// única no lugar certo, ou não entram. Quem quiser a bandeira fiel tem de
// trocar isto por um conjunto de arte de verdade.

const FLAGS: Record<string, React.ReactNode> = {
  BR: (
    <>
      <rect width="24" height="24" fill="#009b3a" />
      <path d="M12 3.5 21.5 12 12 20.5 2.5 12Z" fill="#fedf00" />
      <circle cx="12" cy="12" r="4" fill="#002776" />
    </>
  ),
  PT: (
    <>
      <rect width="24" height="24" fill="#f00" />
      <rect width="9.6" height="24" fill="#006600" />
      <circle cx="9.6" cy="12" r="3.4" fill="#ffe900" stroke="#c00" strokeWidth="0.8" />
    </>
  ),
  US: (
    <>
      <rect width="24" height="24" fill="#fff" />
      {[0, 2, 4, 6, 8, 10].map((i) => (
        <rect key={i} y={i * 2 + 1} width="24" height="1.85" fill="#b22234" />
      ))}
      <rect width="11" height="13" fill="#3c3b6e" />
    </>
  ),
  AR: (
    <>
      <rect width="24" height="24" fill="#74acdf" />
      <rect y="8" width="24" height="8" fill="#fff" />
      <circle cx="12" cy="12" r="2.4" fill="#f6b40e" />
    </>
  ),
  PY: (
    <>
      <rect width="24" height="24" fill="#0038a8" />
      <rect width="24" height="8" fill="#d52b1e" />
      <rect y="8" width="24" height="8" fill="#fff" />
    </>
  ),
  UY: (
    <>
      <rect width="24" height="24" fill="#fff" />
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} y={i * 6 + 3} width="24" height="3" fill="#0038a8" />
      ))}
      <rect width="12" height="12" fill="#fff" />
      <circle cx="6" cy="6" r="2.6" fill="#fcd116" />
    </>
  ),
  CL: (
    <>
      <rect width="24" height="24" fill="#fff" />
      <rect y="12" width="24" height="12" fill="#d52b1e" />
      <rect width="9" height="12" fill="#0039a6" />
      <path d="m4.5 3.4 1 2.6 2.6.1-2 1.7.7 2.6-2.3-1.5-2.3 1.5.7-2.6-2-1.7 2.6-.1Z" fill="#fff" />
    </>
  ),
  CO: (
    <>
      <rect width="24" height="24" fill="#fcd116" />
      <rect y="12" width="24" height="6" fill="#003893" />
      <rect y="18" width="24" height="6" fill="#ce1126" />
    </>
  ),
  PE: (
    <>
      <rect width="24" height="24" fill="#fff" />
      <rect width="8" height="24" fill="#d91023" />
      <rect x="16" width="8" height="24" fill="#d91023" />
    </>
  ),
  BO: (
    <>
      <rect width="24" height="24" fill="#d52b1e" />
      <rect y="8" width="24" height="8" fill="#f9e300" />
      <rect y="16" width="24" height="8" fill="#007a33" />
    </>
  ),
  MX: (
    <>
      <rect width="24" height="24" fill="#fff" />
      <rect width="8" height="24" fill="#006847" />
      <rect x="16" width="8" height="24" fill="#ce1126" />
      <circle cx="12" cy="12" r="2.2" fill="#8c6239" />
    </>
  ),
  ES: (
    <>
      <rect width="24" height="24" fill="#aa151b" />
      <rect y="6" width="24" height="12" fill="#f1bf00" />
    </>
  ),
  IT: (
    <>
      <rect width="24" height="24" fill="#fff" />
      <rect width="8" height="24" fill="#009246" />
      <rect x="16" width="8" height="24" fill="#ce2b37" />
    </>
  ),
  GB: (
    <>
      <rect width="24" height="24" fill="#012169" />
      <path d="M0 0 24 24M24 0 0 24" stroke="#fff" strokeWidth="5" />
      <path d="M0 0 24 24M24 0 0 24" stroke="#c8102e" strokeWidth="2.6" />
      <path d="M12 0v24M0 12h24" stroke="#fff" strokeWidth="8" />
      <path d="M12 0v24M0 12h24" stroke="#c8102e" strokeWidth="4.4" />
    </>
  ),
  CA: (
    <>
      <rect width="24" height="24" fill="#fff" />
      <rect width="6" height="24" fill="#d80621" />
      <rect x="18" width="6" height="24" fill="#d80621" />
      <path d="m12 6.5 1.3 3 2.4-.9-1 2.7 2.3 1.6-2.7.6.3 2.9-2.6-1.6-2.6 1.6.3-2.9-2.7-.6L8.3 11l-1-2.7 2.4.9Z" fill="#d80621" />
    </>
  ),
  JP: (
    <>
      <rect width="24" height="24" fill="#fff" />
      <circle cx="12" cy="12" r="6.5" fill="#bc002d" />
    </>
  ),
};

export function Bandeira({
  iso,
  tamanho = 20,
  className,
}: {
  iso: string;
  tamanho?: number;
  className?: string;
}) {
  const desenho = FLAGS[iso];

  // Países fora da lista, inclusive a linha "Outro país", ficam com o globo:
  // um círculo vazio pareceria bandeira que não carregou.
  if (!desenho) {
    return (
      <Globe
        aria-hidden
        className={className}
        style={{ width: tamanho, height: tamanho }}
      />
    );
  }

  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      width={tamanho}
      height={tamanho}
      className={className}
      style={{ borderRadius: "9999px", overflow: "hidden", flexShrink: 0 }}
    >
      {desenho}
      {/* Aro por dentro da borda. Bandeira de fundo branco, como a do Japão,
          some no cartão claro sem ele. */}
      <circle
        cx="12"
        cy="12"
        r="11.4"
        fill="none"
        stroke="rgba(0,0,0,.25)"
        strokeWidth="1.2"
      />
    </svg>
  );
}
