'use client';

import { useState } from 'react';
import type { VagaPipefyComNumeros } from '@/lib/types';
import { FormularioVagaPipefy, type OpcaoGupy } from './FormularioVagaPipefy';
import { TabelaVagasPipefy } from './TabelaVagasPipefy';

/**
 * Junta o formulário e a lista.
 *
 * Existe porque os dois precisam da mesma informação — qual vaga está sendo
 * editada — e essa informação é da tela, não do servidor: escolher uma linha
 * para editar não deve recarregar a página nem entrar no histórico do navegador.
 */
export function PainelPipefy({
  vagas,
  opcoes,
  consulta,
  temComparacao,
}: {
  vagas: VagaPipefyComNumeros[];
  opcoes: OpcaoGupy[];
  consulta: string;
  temComparacao: boolean;
}) {
  const [emEdicao, setEmEdicao] = useState<VagaPipefyComNumeros | null>(null);


  const editar = (vaga: VagaPipefyComNumeros) => {
    setEmEdicao(vaga);
    // O formulário fica no topo; sem isso a pessoa clica em "editar" e nada
    // parece acontecer, porque a mudança está fora da tela.
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="flex flex-col gap-6">
      <FormularioVagaPipefy
        // A troca de `key` remonta o formulário, e é o que faz os campos
        // assumirem os valores da vaga escolhida — eles são não-controlados.
        key={emEdicao?.card_id ?? 'novo'}
        vaga={emEdicao}
        opcoes={opcoes}
        aoCancelar={() => setEmEdicao(null)}
      />

      <TabelaVagasPipefy
        vagas={vagas}
        consulta={consulta}
        temComparacao={temComparacao}
        aoEditar={editar}
      />
    </div>
  );
}
