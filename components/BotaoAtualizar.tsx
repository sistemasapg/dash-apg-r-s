'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Refaz a foto de hoje na hora. O dash não é tempo real: ele mostra o estado do
 * momento em que o sync rodou. Este botão é para quando alguém precisa do agora
 * sem esperar o horário agendado.
 */
export function BotaoAtualizar() {
  const router = useRouter();
  const [rodando, setRodando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [atualizando, iniciarTransicao] = useTransition();

  async function atualizar() {
    setRodando(true);
    setErro(null);
    try {
      const resposta = await fetch('/api/sync', { method: 'POST' });
      const dados = await resposta.json();
      if (!resposta.ok) throw new Error(dados.erro ?? 'Não consegui falar com a Gupy.');
      iniciarTransicao(() => router.refresh());
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setRodando(false);
    }
  }

  const ocupado = rodando || atualizando;

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={atualizar}
        disabled={ocupado}
        className="rounded-lg border border-borda bg-surface px-3 py-1.5 text-sm text-ink-2 hover:text-ink disabled:opacity-50"
      >
        {ocupado ? 'Consultando a Gupy...' : 'Atualizar agora'}
      </button>
      {erro && <span className="max-w-xs text-right text-xs text-[var(--baixa)]">{erro}</span>}
    </div>
  );
}
