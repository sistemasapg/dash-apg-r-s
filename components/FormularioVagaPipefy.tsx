'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { gravarVaga, type EstadoForm } from '@/app/(painel)/pipefy/acoes';
import type { VagaPipefyComNumeros } from '@/lib/types';
import { CATEGORIAS, NOMES_CATEGORIAS } from '@/config/categorias';
import { escolasDaRegional, REGIONAIS, SIGLAS } from '@/config/unidades';

export interface OpcaoGupy {
  codigo: string;
  nome: string;
  /**
   * Cards que já usam esta vaga. Vazio quando ninguém a vinculou ainda.
   *
   * É lista porque a mesma publicação atende vários cards — ela informa, e não
   * impede.
   */
  vinculadaA: string[];
}

const INICIAL: EstadoForm = { ok: false, mensagem: null };

function Campo({
  rotulo,
  nome,
  children,
  dica,
  erro,
}: {
  rotulo: string;
  nome: string;
  children: React.ReactNode;
  dica?: string;
  erro?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={nome} className="text-xs font-medium text-ink-2">
        {rotulo}
      </label>
      {children}
      {dica && <span className={`text-xs ${erro ? 'text-[var(--baixa)]' : 'text-ink-muted'}`}>{dica}</span>}
    </div>
  );
}

const ENTRADA =
  'rounded-lg border border-borda bg-surface px-3 py-2 text-sm focus:outline-2 focus:outline-[var(--marca-azul)]';

function Botao() {
  // O pending vem do form pai; por isso este botão vive num componente próprio.
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-[var(--marca-azul)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
    >
      {pending ? 'Gravando...' : 'Gravar vaga'}
    </button>
  );
}

/**
 * O lançamento manual da vaga do Pipefy.
 *
 * Serve tanto para criar quanto para editar: o `card_id` é a identidade, e
 * reenviar o mesmo card atualiza a linha. Por isso a tela não separa "novo" de
 * "editar" — corrigir uma vaga é lançá-la de novo.
 */
export function FormularioVagaPipefy({
  vaga,
  opcoes,
  aoCancelar,
}: {
  vaga: VagaPipefyComNumeros | null;
  opcoes: OpcaoGupy[];
  aoCancelar?: () => void;
}) {
  const [estado, acao] = useActionState(gravarVaga, INICIAL);
  const [situacao, setSituacao] = useState(vaga?.situacao ?? 'aberta');
  const [categoria, setCategoria] = useState(vaga?.categoria ?? '');
  const [regional, setRegional] = useState(vaga?.regional ?? '');
  const editando = Boolean(vaga);

  const erroNo = (campo: string) => !estado.ok && estado.campo === campo;

  /*
    A função depende da categoria escolhida. Categoria sem lista definida
    (Jovem Aprendiz, Estagiário) vira campo de texto: um `select` vazio seria
    um beco sem saída para quem precisa lançar a vaga hoje.
  */
  const funcoes = categoria ? (CATEGORIAS[categoria]?.funcoes ?? []) : [];
  const sla = categoria ? CATEGORIAS[categoria]?.slaDiasUteis : undefined;

  return (
    <section className="rounded-xl border border-borda bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-borda p-5">
        <div>
          <h2 className="text-sm font-semibold">
            {editando ? `Editando o card ${vaga!.card_id}` : 'Lançar vaga'}
          </h2>
          <p className="mt-0.5 text-xs text-ink-muted">
            {editando
              ? 'Alterar e gravar substitui os dados deste card.'
              : 'Um card do Pipefy por vaga. Reenviar o mesmo ID atualiza o cadastro.'}
          </p>
        </div>
        {editando && aoCancelar && (
          <button
            type="button"
            onClick={aoCancelar}
            className="rounded-lg border border-borda px-3 py-1.5 text-sm text-ink-2 hover:text-ink"
          >
            Cancelar edição
          </button>
        )}
      </div>

      <form action={acao} className="flex flex-col gap-5 p-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Campo
            rotulo="ID do card no Pipefy *"
            nome="card_id"
            dica={erroNo('card_id') ? estado.mensagem! : 'O número que aparece na URL do card.'}
            erro={erroNo('card_id')}
          >
            <input
              id="card_id"
              name="card_id"
              required
              defaultValue={vaga?.card_id ?? ''}
              // Trocar o ID viraria outro card: para renomear, remova e lance de novo.
              readOnly={editando}
              placeholder="1234567890"
              className={`${ENTRADA} ${editando ? 'text-ink-muted' : ''}`}
            />
          </Campo>

          <Campo
            rotulo="Nome da vaga *"
            nome="titulo"
            dica={erroNo('titulo') ? estado.mensagem! : undefined}
            erro={erroNo('titulo')}
          >
            <input
              id="titulo"
              name="titulo"
              required
              defaultValue={vaga?.titulo ?? ''}
              placeholder="Agente Administrativo"
              className={ENTRADA}
            />
          </Campo>

          <Campo
            rotulo="Categoria *"
            nome="categoria"
            dica={
              erroNo('categoria')
                ? estado.mensagem!
                : sla !== undefined
                  ? `SLA de ${sla} dias úteis para fechar a vaga.`
                  : 'A categoria define o prazo de fechamento.'
            }
            erro={erroNo('categoria')}
          >
            <select
              id="categoria"
              name="categoria"
              required
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              className={ENTRADA}
            >
              <option value="">— escolha —</option>
              {NOMES_CATEGORIAS.map((nome) => (
                <option key={nome} value={nome}>
                  {nome} ({CATEGORIAS[nome].slaDiasUteis} dias úteis)
                </option>
              ))}
            </select>
          </Campo>

          <Campo
            rotulo="Função"
            nome="funcao"
            dica={
              erroNo('funcao')
                ? estado.mensagem!
                : !categoria
                  ? 'Escolha a categoria primeiro.'
                  : funcoes.length === 0
                    ? 'Esta categoria ainda não tem lista de funções: digite.'
                    : undefined
            }
            erro={erroNo('funcao')}
          >
            {funcoes.length > 0 ? (
              <select
                id="funcao"
                name="funcao"
                // A troca de `key` remonta o campo ao mudar de categoria: sem
                // isso a função da categoria anterior ficaria selecionada e
                // seria gravada numa categoria onde ela não existe.
                key={categoria}
                defaultValue={
                  vaga?.categoria === categoria && vaga?.funcao
                    ? vaga.funcao
                    : // Categoria de função única (Jovem Aprendiz, Estagiário) já
                      // vem escolhida: não há decisão a tomar, só um clique a poupar.
                      funcoes.length === 1
                      ? funcoes[0]
                      : ''
                }
                className={ENTRADA}
              >
                <option value="">— sem função definida —</option>
                {funcoes.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id="funcao"
                name="funcao"
                key={categoria}
                defaultValue={vaga?.categoria === categoria ? (vaga?.funcao ?? '') : ''}
                disabled={!categoria}
                placeholder={categoria ? 'Nome da função' : ''}
                className={ENTRADA}
              />
            )}
          </Campo>

          <Campo rotulo="Regional" nome="regional">
            <select
              id="regional"
              name="regional"
              value={regional}
              onChange={(e) => setRegional(e.target.value)}
              className={ENTRADA}
            >
              <option value="">— escolha —</option>
              {SIGLAS.map((s) => (
                <option key={s} value={s}>
                  {REGIONAIS[s].nome} ({s})
                </option>
              ))}
              {/* Regional gravada antes da lista existir continua selecionável,
                  senão editar outro campo apagaria o que já estava lá. */}
              {vaga?.regional && !SIGLAS.includes(vaga.regional) && (
                <option value={vaga.regional}>{vaga.regional} (fora da lista)</option>
              )}
            </select>
          </Campo>

          <Campo
            rotulo="Escola"
            nome="unidade"
            dica={
              erroNo('unidade')
                ? estado.mensagem!
                : !regional
                  ? 'Escolha a regional primeiro.'
                  : 'Em branco = vaga da regional inteira.'
            }
            erro={erroNo('unidade')}
          >
            <select
              id="unidade"
              name="unidade"
              // Remonta ao trocar de regional: a escola anterior é de outra
              // regional e não pode continuar selecionada.
              key={regional}
              defaultValue={vaga?.unidade ?? ''}
              disabled={!regional}
              className={ENTRADA}
            >
              <option value="">— toda a regional —</option>
              {escolasDaRegional(regional || null).map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
              {/* Escola gravada antes da lista fechar continua selecionável,
                  senão editar outro campo a apagaria sem ninguém pedir. */}
              {vaga?.unidade && !escolasDaRegional(regional || null).includes(vaga.unidade) && (
                <option value={vaga.unidade}>{vaga.unidade} (fora da lista)</option>
              )}
            </select>
          </Campo>

          <Campo
            rotulo="Aberta em *"
            nome="aberta_em"
            dica={
              erroNo('aberta_em')
                ? estado.mensagem!
                : 'É desta data que sai o "há quantos dias está em aberto".'
            }
            erro={erroNo('aberta_em')}
          >
            <input
              id="aberta_em"
              name="aberta_em"
              type="date"
              required
              defaultValue={vaga?.aberta_em ?? ''}
              className={ENTRADA}
            />
          </Campo>

          <Campo rotulo="Situação" nome="situacao">
            <select
              id="situacao"
              name="situacao"
              value={situacao}
              onChange={(e) => setSituacao(e.target.value as typeof situacao)}
              className={ENTRADA}
            >
              <option value="aberta">Aberta</option>
              <option value="fechada">Fechada (preenchida)</option>
              <option value="cancelada">Cancelada</option>
            </select>
          </Campo>

          {situacao !== 'aberta' && (
            <Campo
              rotulo="Fechada em"
              nome="fechada_em"
              dica={
                erroNo('fechada_em')
                  ? estado.mensagem!
                  : 'Em branco, o dash grava a data de hoje.'
              }
              erro={erroNo('fechada_em')}
            >
              <input
                id="fechada_em"
                name="fechada_em"
                type="date"
                defaultValue={vaga?.fechada_em ?? ''}
                className={ENTRADA}
              />
            </Campo>
          )}

          <Campo
            rotulo="Vaga correspondente na Gupy"
            nome="vaga_codigo"
            dica={
              erroNo('vaga_codigo')
                ? estado.mensagem!
                : 'Sem vínculo, o card aparece na lista mas sem candidatos.'
            }
            erro={erroNo('vaga_codigo')}
          >
            <select
              id="vaga_codigo"
              name="vaga_codigo"
              defaultValue={vaga?.vaga_codigo ?? ''}
              className={ENTRADA}
            >
              <option value="">— ainda não publicada / sem vínculo —</option>
              {opcoes.map((o) => {
                /*
                  Vaga já usada por outro card continua selecionável: a Gupy
                  publica por cidade e o R&S abre por unidade, então a mesma
                  publicação atende várias escolas. O aviso fica só para a
                  pessoa saber que vai dividir o pool de candidatos, e não para
                  impedi-la.
                */
                const outros = o.vinculadaA.filter((c) => c !== vaga?.card_id);
                return (
                  <option key={o.codigo} value={o.codigo}>
                    {o.nome}
                    {outros.length > 0
                      ? ` — já em ${outros.length} card${outros.length > 1 ? 's' : ''}`
                      : ''}
                  </option>
                );
              })}
            </select>
          </Campo>
        </div>

        <Campo rotulo="Observação" nome="observacao">
          <textarea
            id="observacao"
            name="observacao"
            rows={2}
            defaultValue={vaga?.observacao ?? ''}
            placeholder="Contexto que ajuda quem for ler depois."
            className={ENTRADA}
          />
        </Campo>

        <div className="flex flex-wrap items-center gap-3">
          <Botao />
          {estado.mensagem && !estado.campo && (
            <span
              role="status"
              className={`text-sm ${estado.ok ? 'text-[var(--alta)]' : 'text-[var(--baixa)]'}`}
            >
              {estado.mensagem}
            </span>
          )}
        </div>
      </form>
    </section>
  );
}
