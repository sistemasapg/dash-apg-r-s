'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * A marca da APG. Usa o arquivo em `public/logo.png` quando ele existe e cai
 * numa versão tipográfica quando não existe — assim o cabeçalho nunca aparece
 * quebrado em quem clonou o projeto sem o arquivo de imagem.
 */
export function Logo() {
  const imagem = useRef<HTMLImageElement>(null);
  const [falhou, setFalhou] = useState(false);

  useEffect(() => {
    // O erro de carregamento acontece antes do React hidratar, então o onError
    // sozinho não pega: na montagem é preciso perguntar ao próprio elemento se
    // a imagem chegou a existir.
    const el = imagem.current;
    if (el && el.complete && el.naturalWidth === 0) setFalhou(true);
  }, []);

  if (falhou) {
    return (
      <span className="flex items-baseline leading-none">
        <span className="text-2xl font-bold tracking-tight text-[var(--marca-azul)]">APG</span>
        <span className="ml-1 text-sm font-semibold tracking-[0.14em] text-ink-2">GOV</span>
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={imagem}
      src="/logo.png"
      alt="APG Gov"
      className="logo-marca h-11 w-auto"
      onError={() => setFalhou(true)}
    />
  );
}
