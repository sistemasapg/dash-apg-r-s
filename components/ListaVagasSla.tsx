'use client';

import { Fragment, useState } from 'react';
import Link from 'next/link';
import type { VagaPipefyComNumeros } from '@/lib/types';
import { dataLonga, numero } from '@/lib/format';
import { rotuloRegional } from '@/config/unidades';
import { selosDe, urlDoCard } from '@/config/pipefy';
import {
  Amostra,
  BarraJornada,
  DetalheJornada,
  NumerosPorTime,
  rotuloDono,
} from './Jornada';
import { SelosDeTime } from './SeloDeTime';

/**
 * As vagas do recorte, em ordem de urgência.
 *
 * É a resposta ao clique no gráfico: "12 administrativas" vira "quais são as
 * 12". Por isso ela vive logo abaixo dos gráficos e obedece aos mesmos filtros.
 *
 * Quando a vaga traz jornada — o que só acontece vindo do relatório do Pipefy —
 * a linha ganha a coluna de fases. O cadastro manual não tem histórico de fase
 * nenhum, então no Dashboard original a coluna simplesmente não aparece, em vez
 * de aparecer vazia em todas as linhas.
 */
export function ListaVagasSla({
  vagas,
  titulo,
  ordem = 'mais urgente primeiro',
}: {
  vagas: VagaPipefyComNumeros[];
  titulo: string;
  /** O critério de ordenação, dito ao leitor. Muda conforme a aba escolhida. */
  ordem?: string;
}) {
  const [aberta, setAberta] = useState<string | null>(null);

  const temJornada = vagas.some((v) => v.jornada && v.jornada.length > 0);

  /*
    A coluna de candidatos depende do vínculo com a Gupy, que só existe no
    cadastro manual. Numa tela que não o lê, ela seria uma coluna inteira
    dizendo "sem vínculo" — barulho ocupando largura. Some junto com o vínculo.
  */
  const temVinculo = vagas.some((v) => v.vaga_codigo);

  /*
    A escala é compartilhada entre as linhas: a barra mede dias úteis, não uma
    proporção de si mesma. Sem isso, uma vaga de 2 dias e uma de 40 teriam
    barras do mesmo tamanho, e a coluna mentiria sobre exatamente o que foi
    feita para mostrar.
  */
  const escala = Math.max(
    1,
    ...vagas.map((v) => (v.jornada ?? []).reduce((s, t) => s + t.diasUteis, 0)),
  );

  const colunas = 5 + (temJornada ? 1 : 0) + (temVinculo ? 1 : 0);

  return (
    <section className="rounded-xl border border-borda bg-surface">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-borda p-5">
        <h2 className="text-sm font-semibold">
          {titulo}
          <span className="ml-2 font-normal text-ink-muted">{numero(vagas.length)}</span>
        </h2>
        <span className="text-xs text-ink-muted">{ordem}</span>
      </div>

      {/*
        A tabela não quebra palavra em célula nenhuma: um cargo como
        "PROFESSOR(A) · RECURSOS HUMANOS" partido em duas linhas desalinha a
        linha inteira e cada linha passa a ter uma altura. Em vez disso ela
        cresce para o lado e o contêiner rola na horizontal — ler rolando é
        melhor do que ler desalinhado.
      */}
      <div className="overflow-x-auto">
        <table
          className={`w-full ${temJornada ? 'min-w-[62rem]' : 'min-w-[46rem]'} text-sm [&_td]:whitespace-nowrap`}
        >
          <thead className="sticky top-0 z-10 bg-surface-2 text-[0.7rem] tracking-wider text-ink-2 uppercase">
            <tr className="border-b border-borda [&>th]:whitespace-nowrap [&>th]:px-4 [&>th]:py-2.5 [&>th]:font-semibold">
              <th scope="col" className="text-left">Card</th>
              <th scope="col" className="text-left">Vaga</th>
              <th scope="col" className="text-left">Regional / escola</th>
              <th scope="col" className="text-left">Aberta em</th>
              <th scope="col" className="text-right">Dias úteis</th>
              {temJornada && (
                <th scope="col" className="w-64 text-left">Fase atual e jornada</th>
              )}
              {temVinculo && <th scope="col" className="text-right">Candidatos</th>}
            </tr>
          </thead>
          <tbody>
            {vagas.map((v) => {
              const sla = v.sla;
              const cor =
                !sla
                  ? 'text-ink-muted'
                  : sla.saldo < 0
                    ? 'text-[var(--baixa)]'
                    : sla.saldo === 0
                      ? 'text-[var(--atencao)]'
                      : 'text-ink';

              const trechos = v.jornada ?? [];
              const atual = trechos.find((t) => t.atual) ?? trechos[trechos.length - 1];
              const expandida = aberta === v.card_id;

              return (
                <Fragment key={v.card_id}>
                  {/*
                    A linha inteira abre a jornada. O alvo antes era um texto
                    cinza de 11px no fim da célula — pequeno para o que ele
                    revela, que é o dado mais rico da tabela. Os links dentro
                    da linha param a propagação para continuarem navegando.
                  */}
                  <tr
                    onClick={temJornada && trechos.length > 0 ? () => setAberta(expandida ? null : v.card_id) : undefined}
                    aria-expanded={temJornada && trechos.length > 0 ? expandida : undefined}
                    className={`border-b border-borda align-top ${
                      temJornada && trechos.length > 0 ? 'cursor-pointer' : ''
                    } ${expandida ? 'bg-surface-2' : 'hover:bg-surface-2'}`}
                  >
                    <td className="px-4 py-3">
                      <a
                        href={urlDoCard(v.card_id)}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        title={`Abrir o card ${v.card_id} no Pipefy`}
                        className="num inline-flex items-center gap-1 font-medium text-[var(--marca-azul)] underline-offset-2 hover:underline"
                      >
                        {v.card_id}
                        <span aria-hidden="true" className="text-xs">↗</span>
                      </a>
                    </td>

                    <td className="px-4 py-3">
                      <div className="max-w-[18rem] truncate font-medium" title={v.titulo}>
                        {v.titulo}
                      </div>

                      {/*
                        A categoria morava numa coluna própria, com a função
                        embaixo — e a função é literalmente o começo do título
                        ao lado. Uma coluna inteira repetindo a vizinha cortava
                        a tabela na borda da tela. Aqui sobra só o que acrescenta.
                      */}
                      <div className="text-xs text-ink-muted">
                        {v.categoria ? (
                          [
                            v.categoria.replace(/^Vagas /, ''),
                            // No cadastro manual o título é digitado e pode não
                            // conter a função; aí ela ainda informa algo.
                            v.funcao && !v.titulo.toUpperCase().includes(v.funcao.toUpperCase())
                              ? v.funcao
                              : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')
                        ) : (
                          <span className="text-[var(--atencao)]">sem categoria</span>
                        )}
                      </div>

                      {/*
                        Os selos dizem algo que nenhuma coluna diz — hoje só o
                        RPA. Vão abaixo do nome porque qualificam a vaga, e não
                        são um dado à parte dela.
                      */}
                      {selosDe(v.etiquetas).map((selo) => (
                        <span
                          key={selo}
                          title="Card com a etiqueta CONTRATAÇÃO TEMPORARIA no Pipefy"
                          className="mt-1 mr-1 inline-block rounded border border-[var(--marca-laranja)] px-1.5 py-px text-[0.65rem] font-semibold tracking-wider text-[var(--marca-laranja)]"
                        >
                          {selo}
                        </span>
                      ))}
                    </td>

                    <td className="px-4 py-3 text-xs">
                      <div>{rotuloRegional(v.regional) || <span className="text-ink-muted">—</span>}</div>
                      {v.unidade && (
                        <div className="max-w-[11rem] truncate text-ink-muted" title={v.unidade}>
                          {v.unidade}
                        </div>
                      )}
                    </td>

                    <td className="num px-4 py-3 text-xs">
                      {dataLonga(v.aberta_em)}
                      <div className="text-ink-muted">{numero(v.dias)} dias corridos</div>
                    </td>

                    <td className={`num px-4 py-3 text-right tabular-nums ${cor}`}>
                      {sla ? (
                        <>
                          <span className="font-medium">
                            {numero(sla.decorridos)} / {numero(sla.prazo)}
                          </span>
                          <div className="text-xs">
                            {sla.saldo < 0
                              ? `${numero(-sla.saldo)} de atraso`
                              : sla.saldo === 0
                                ? 'vence hoje'
                                : `faltam ${numero(sla.saldo)}`}
                          </div>
                        </>
                      ) : (
                        <span className="text-xs">sem prazo</span>
                      )}
                    </td>

                    {temJornada && (
                      <td className="px-4 py-3">
                        {trechos.length === 0 ? (
                          <span className="text-xs text-ink-muted">sem histórico de fase</span>
                        ) : (
                          <>
                            {atual && (
                              <div
                                className="flex items-center gap-1.5 text-xs"
                                title={`${atual.fase} · ${rotuloDono(atual.dono)}`}
                              >
                                <Amostra dono={atual.dono} />
                                {/*
                                  Reticências em vez de empurrar a tabela: nomes
                                  como "Documentação Enviada (Estagiário)" são
                                  longos, e como nenhuma célula quebra linha eles
                                  esticavam a tabela para além da tela. O nome
                                  inteiro fica no title da célula.
                                */}
                                <span className="max-w-[11rem] truncate font-medium">
                                  {atual.fase}
                                </span>
                                <span className="shrink-0 text-ink-muted">
                                  ({rotuloDono(atual.dono)})
                                </span>
                              </div>
                            )}
                            <div className="mt-1.5 max-w-[12rem]">
                              <BarraJornada trechos={trechos} escala={escala} altura="h-2" />
                            </div>
                            <div className="mt-1.5">
                              {/*
                                Os selos substituem a soma crua por time: além
                                de quanto cada um levou, dizem contra quanto —
                                que é o que torna o número acionável. Sem SLA
                                calculado (cadastro manual), cai no antigo.
                              */}
                              {v.slaPorTime ? (
                                <SelosDeTime sla={v.slaPorTime} />
                              ) : (
                                <NumerosPorTime trechos={trechos} />
                              )}
                            </div>
                            <span
                              className={`mt-1.5 inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs transition-colors ${
                                expandida
                                  ? 'border-[var(--marca-azul)] text-[var(--marca-azul)]'
                                  : 'border-borda text-ink-2'
                              }`}
                            >
                              <span aria-hidden="true">{expandida ? '▴' : '▾'}</span>
                              {expandida ? 'fechar' : `${trechos.length} fases`}
                            </span>
                          </>
                        )}
                      </td>
                    )}

                    {temVinculo && (
                      <td className="num px-4 py-3 text-right tabular-nums">
                        {v.vaga_codigo ? (
                          <Link
                            href={`/vagas/${encodeURIComponent(v.vaga_codigo)}`}
                            onClick={(e) => e.stopPropagation()}
                            className="hover:underline"
                          >
                            {numero(v.candidatos ?? 0)}
                          </Link>
                        ) : (
                          <span className="text-xs text-[var(--atencao)]">sem vínculo</span>
                        )}
                      </td>
                    )}
                  </tr>

                  {expandida && trechos.length > 0 && (
                    <tr className="border-b border-borda bg-surface-2">
                      {/*
                        A faixa azul à esquerda amarra a linha expandida à linha
                        que a abriu — sem ela, numa tabela longa, o detalhe
                        parece começar do nada.
                      */}
                      <td
                        colSpan={colunas}
                        className="border-l-2 border-[var(--marca-azul)] px-6 py-4 whitespace-normal"
                      >
                        <div className="mb-3 text-xs font-semibold tracking-wider text-ink-muted uppercase">
                          Jornada do card {v.card_id}
                        </div>
                        <DetalheJornada trechos={trechos} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}

            {vagas.length === 0 && (
              <tr>
                <td colSpan={colunas} className="px-4 py-10 text-center text-ink-muted">
                  Nenhuma vaga neste recorte.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
