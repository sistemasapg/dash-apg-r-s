'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { COOKIE_SESSAO, lerSessao } from '@/lib/sessao';
import { restaurarPrazo, salvarPrazo, type Escopo } from '@/lib/prazos';
import { CATEGORIAS } from '@/config/categorias';
import { ETAPAS, etapaConta } from '@/config/etapas-pipefy';

export interface EstadoPrazo {
  erro: string | null;
  salvo: string | null;
}

/**
 * Só aceita chaves que existem no sistema.
 *
 * O formulário manda o nome da categoria ou da etapa num campo oculto, e campo
 * oculto é sugestão, não garantia. Sem esta conferência daria para gravar
 * prazo para uma etapa inventada, que depois apareceria na tela sem nunca
 * casar com nada do Pipefy.
 */
function chaveValida(escopo: Escopo, chave: string): boolean {
  if (escopo === 'categoria') return Object.hasOwn(CATEGORIAS, chave);
  // O prazo por time existe só para o DP: o R&S é medido pelo prazo da categoria.
  if (escopo === 'time') return chave === 'DP';
  return Object.hasOwn(ETAPAS, chave) && etapaConta(chave);
}

/** O limite é generoso de propósito: quem define o prazo é o R&S, não o código. */
const MAXIMO_DIAS = 365;

export async function guardarPrazo(
  _anterior: EstadoPrazo,
  dados: FormData,
): Promise<EstadoPrazo> {
  const escopo = String(dados.get('escopo') ?? '') as Escopo;
  const chave = String(dados.get('chave') ?? '').trim();

  if (escopo !== 'categoria' && escopo !== 'etapa' && escopo !== 'time') {
    return { erro: 'Escopo inválido.', salvo: null };
  }
  if (!chaveValida(escopo, chave)) {
    return { erro: `"${chave}" não é algo que tenha prazo neste sistema.`, salvo: null };
  }

  const bruto = String(dados.get('dias') ?? '').trim();
  const observacao = String(dados.get('observacao') ?? '').trim() || null;

  /*
    Campo vazio é "sem prazo acordado", e é um valor legítimo — não um erro de
    preenchimento. É o que distingue a etapa que ninguém combinou ainda da que
    tem prazo zero, e a tela mostra as duas de formas diferentes.
  */
  let dias: number | null = null;
  if (bruto !== '') {
    const n = Number(bruto);
    if (!Number.isInteger(n) || n < 0 || n > MAXIMO_DIAS) {
      return { erro: `O prazo precisa ser um número inteiro entre 0 e ${MAXIMO_DIAS}, ou vazio.`, salvo: null };
    }
    dias = n;
  }

  const por = await lerSessao((await cookies()).get(COOKIE_SESSAO)?.value);

  try {
    await salvarPrazo({ escopo, chave, diasUteis: dias, observacao, por });
  } catch (e) {
    return { erro: `Não deu para gravar: ${(e as Error).message}`, salvo: null };
  }

  revalidatePath('/prazos');
  return { erro: null, salvo: chave };
}

/** Devolve o prazo ao valor que está no código. */
export async function voltarAoPadrao(
  _anterior: EstadoPrazo,
  dados: FormData,
): Promise<EstadoPrazo> {
  const escopo = String(dados.get('escopo') ?? '') as Escopo;
  const chave = String(dados.get('chave') ?? '').trim();

  if ((escopo !== 'categoria' && escopo !== 'etapa' && escopo !== 'time') || !chaveValida(escopo, chave)) {
    return { erro: 'Não reconheci o que restaurar.', salvo: null };
  }

  try {
    await restaurarPrazo(escopo, chave);
  } catch (e) {
    return { erro: `Não deu para restaurar: ${(e as Error).message}`, salvo: null };
  }

  revalidatePath('/prazos');
  return { erro: null, salvo: chave };
}
