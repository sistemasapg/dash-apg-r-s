'use server';

import { revalidatePath } from 'next/cache';
import { migrar } from '@/lib/db';
import { apagarVagaPipefy, salvarVagaPipefy, SITUACOES, type Situacao } from '@/lib/pipefy';
import { funcoesDaCategoria, NOMES_CATEGORIAS } from '@/config/categorias';
import { escolaValida, normalizarEscola, normalizarRegional } from '@/config/unidades';

/**
 * O que a tela recebe de volta depois de gravar. Um erro aqui é quase sempre
 * digitação, não falha do sistema — então a mensagem tem de dizer o que
 * corrigir, e não "erro ao salvar".
 */
export interface EstadoForm {
  ok: boolean;
  mensagem: string | null;
  /** Nome do campo a destacar, quando o erro é de um campo só. */
  campo?: string;
}

function texto(dados: FormData, campo: string): string | null {
  const valor = dados.get(campo);
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo === '' ? null : limpo;
}

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

function hojeLocal(): string {
  const agora = new Date();
  return new Date(agora.getTime() - agora.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
}

export async function gravarVaga(
  _anterior: EstadoForm,
  dados: FormData,
): Promise<EstadoForm> {
  const cardId = texto(dados, 'card_id');
  const titulo = texto(dados, 'titulo');
  const abertaEm = texto(dados, 'aberta_em');
  const situacaoBruta = texto(dados, 'situacao') ?? 'aberta';

  if (!cardId) return { ok: false, mensagem: 'Informe o ID do card no Pipefy.', campo: 'card_id' };
  if (!titulo) return { ok: false, mensagem: 'Informe o nome da vaga.', campo: 'titulo' };
  if (!abertaEm || !DATA_ISO.test(abertaEm)) {
    return { ok: false, mensagem: 'Informe a data de abertura.', campo: 'aberta_em' };
  }
  if (!SITUACOES.includes(situacaoBruta as Situacao)) {
    return { ok: false, mensagem: 'Situação inválida.', campo: 'situacao' };
  }

  const situacao = situacaoBruta as Situacao;

  /*
    A categoria é obrigatória porque é ela que carrega o SLA: sem categoria o
    dash não tem prazo a cobrar, e a vaga entraria na lista fora de qualquer
    medição. A conferência é contra `config/categorias.ts` e não contra o que a
    tela mandou — o `select` do formulário pode ser burlado, o servidor não.
  */
  const categoria = texto(dados, 'categoria');
  if (!categoria) {
    return { ok: false, mensagem: 'Escolha a categoria da vaga.', campo: 'categoria' };
  }
  if (!NOMES_CATEGORIAS.includes(categoria)) {
    return { ok: false, mensagem: 'Categoria desconhecida.', campo: 'categoria' };
  }

  const funcao = texto(dados, 'funcao');
  const funcoes = funcoesDaCategoria(categoria);
  // Só aceita função da própria categoria — é o que mantém o campo agrupável
  // depois. As quatro categorias têm lista; uma categoria nova sem lista cai no
  // texto livre, para não travar o lançamento enquanto ela não é levantada.
  if (funcao && funcoes.length > 0 && !funcoes.includes(funcao)) {
    return {
      ok: false,
      mensagem: `"${funcao}" não é uma função de ${categoria}.`,
      campo: 'funcao',
    };
  }

  /*
    A data de fechamento é consequência da situação, não um campo independente:
    vaga aberta não tem fechamento, e vaga encerrada sem data vira "hoje". Deixar
    os dois soltos produziria linhas contraditórias — fechada sem data, ou aberta
    com data de fechamento — que estragariam a média de tempo de preenchimento.
  */
  const fechadaBruta = texto(dados, 'fechada_em');
  const fechadaEm = situacao === 'aberta' ? null : (fechadaBruta ?? hojeLocal());

  if (fechadaEm && !DATA_ISO.test(fechadaEm)) {
    return { ok: false, mensagem: 'Data de fechamento inválida.', campo: 'fechada_em' };
  }
  if (fechadaEm && fechadaEm < abertaEm) {
    return {
      ok: false,
      mensagem: 'A data de fechamento não pode ser anterior à de abertura.',
      campo: 'fechada_em',
    };
  }
  if (abertaEm > hojeLocal()) {
    return { ok: false, mensagem: 'A data de abertura está no futuro.', campo: 'aberta_em' };
  }

  // "São José dos Pinhais" e "SJP" têm de virar a mesma regional, senão os
  // cadastros antigos apareceriam como um grupo à parte nos relatórios.
  const regional = normalizarRegional(texto(dados, 'regional'));

  /*
    A lista de escolas está completa (`config/unidades.ts`), então escola fora
    dela é erro de digitação ou escola nova — e nos dois casos alguém precisa
    saber agora, e não quando o relatório sair com um grupo a mais.

    Escola em branco passa: é a vaga que atende a regional inteira.
  */
  const unidade = normalizarEscola(regional, texto(dados, 'unidade'));
  if (!escolaValida(unidade)) {
    return {
      ok: false,
      mensagem:
        `"${unidade}" não está na lista de escolas. Se for uma escola nova, ` +
        'ela precisa ser acrescentada em config/unidades.ts.',
      campo: 'unidade',
    };
  }

  try {
    // Idempotente, e evita "relation does not exist" em banco recém-criado.
    await migrar();
    await salvarVagaPipefy({
      card_id: cardId,
      titulo,
      categoria,
      funcao,
      regional,
      unidade,
      aberta_em: abertaEm,
      fechada_em: fechadaEm,
      situacao,
      vaga_codigo: texto(dados, 'vaga_codigo'),
      observacao: texto(dados, 'observacao'),
    });
  } catch (erro) {
    /*
      23505 é violação de unicidade. Aqui só pode ser o índice de `vaga_codigo`:
      o `card_id` repetido cai no `on conflict` e vira atualização. Ou seja, a
      vaga da Gupy escolhida já pertence a outro card.
    */
    const codigo = (erro as { code?: string }).code;
    if (codigo === '23505') {
      return {
        ok: false,
        mensagem:
          'Essa vaga da Gupy já está vinculada a outro card do Pipefy. ' +
          'Desvincule lá antes de vincular aqui.',
        campo: 'vaga_codigo',
      };
    }
    return { ok: false, mensagem: `Não deu para gravar: ${(erro as Error).message}` };
  }

  revalidatePath('/pipefy');
  revalidatePath('/');
  return { ok: true, mensagem: `Vaga do card ${cardId} gravada.` };
}

/**
 * Tira o card do acompanhamento.
 *
 * Assinatura de `action` direta (só o FormData) porque a tela não precisa de
 * resposta: a confirmação já aconteceu no botão de dois passos, e o resultado
 * é a linha sumir da lista.
 */
export async function removerVaga(dados: FormData): Promise<void> {
  const cardId = texto(dados, 'card_id');
  if (!cardId) return;

  await apagarVagaPipefy(cardId);
  revalidatePath('/pipefy');
  revalidatePath('/');
}
