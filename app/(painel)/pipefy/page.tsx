import { listarSnapshots, migrar } from '@/lib/db';
import { resolverComparacao, vagasComparadas } from '@/lib/metrics';
import { vagasPipefyComNumeros } from '@/lib/pipefy';
import { resumirSla } from '@/lib/analise-sla';
import { lerFiltro, queryDoFiltro, type ParamsBrutos } from '@/lib/consulta';
import { dataLonga, numero } from '@/lib/format';
import { StatTile } from '@/components/StatTile';
import { PainelPipefy } from '@/components/PainelPipefy';
import type { OpcaoGupy } from '@/components/FormularioVagaPipefy';

export const dynamic = 'force-dynamic';

export default async function Pagina({ searchParams }: { searchParams: Promise<ParamsBrutos> }) {
  const filtro = lerFiltro(await searchParams);

  /*
    Esta é a única tela que funciona antes do primeiro sync: o R&S pode lançar
    as vagas do Pipefy no dia em que o dash sobe, sem esperar foto nenhuma. Daí
    o `migrar()` aqui — sem ele, a primeira visita a um banco novo quebraria com
    "relation vaga_pipefy does not exist".
  */
  await migrar();

  const snapshots = await listarSnapshots();
  const comp = await resolverComparacao(filtro.data, filtro.comparar);
  const temComparacao = Boolean(comp.anterior);

  const [vagas, vagasGupy] = await Promise.all([
    vagasPipefyComNumeros(comp),
    vagasComparadas(comp),
  ]);

  const resumo = resumirSla(vagas);
  const consulta = queryDoFiltro(filtro);

  // Quem já está ocupado por um card, para o formulário travar a opção em vez
  // de deixar gravar e receber o erro de unicidade do banco.
  const ocupadas = new Map(
    vagas.filter((v) => v.vaga_codigo).map((v) => [v.vaga_codigo!, v.card_id]),
  );

  const opcoes: OpcaoGupy[] = vagasGupy
    .map((v) => ({
      codigo: v.vaga_codigo,
      nome: v.vaga_nome,
      vinculadaA: ocupadas.get(v.vaga_codigo) ?? null,
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  /*
    Vaga vinculada a um código que sumiu da foto (encerrada na Gupy, ou fora do
    recorte) precisa continuar selecionável, senão editar qualquer outro campo
    dessa linha desfaria o vínculo sem ninguém pedir.
  */
  for (const [codigo, card] of ocupadas) {
    if (!opcoes.some((o) => o.codigo === codigo)) {
      opcoes.push({ codigo, nome: `${codigo} (fora da foto atual)`, vinculadaA: card });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Vagas R&amp;S</h1>
        <p className="mt-1 text-sm text-ink-2">
          As vagas que o R&amp;S abre no Pipefy, lançadas aqui à mão e amarradas à
          publicação correspondente na Gupy.
        </p>
        <p className="mt-0.5 text-xs text-ink-muted">
          {snapshots.length === 0
            ? 'Ainda não há foto da Gupy — dá para lançar as vagas mesmo assim, e os candidatos aparecem no primeiro sync.'
            : `Números de candidatos referentes à foto de ${dataLonga(comp.atual!.data_ref)}.`}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          rotulo="Vagas abertas"
          valor={resumo.abertas}
          nota={
            resumo.semCategoria > 0
              ? `${numero(resumo.semCategoria)} sem categoria (fora do SLA)`
              : resumo.semVinculo > 0
                ? `${numero(resumo.semVinculo)} ainda sem vaga da Gupy vinculada`
                : 'todas classificadas e vinculadas'
          }
          destaque
        />
        <StatTile
          rotulo="Média em aberto"
          valor={resumo.mediaCorridosAbertas ?? 0}
          sufixo=" dias"
          nota={
            resumo.maisAntiga
              ? `mais antiga: ${resumo.maisAntiga.titulo} (${numero(resumo.maisAntiga.dias)} dias)`
              : 'nenhuma vaga aberta'
          }
        />
        <StatTile
          rotulo="Fora do prazo"
          valor={resumo.foraDoPrazo}
          nota={
            resumo.foraDoPrazo === 0
              ? 'nenhuma vaga passou do SLA'
              : 'veja o detalhe na aba SLA'
          }
        />
        <StatTile
          rotulo="Candidatos nas vagas vinculadas"
          valor={resumo.candidatos}
          nota={
            snapshots.length === 0
              ? 'aguardando o primeiro sync da Gupy'
              : 'somados na foto selecionada'
          }
        />
      </div>

      <PainelPipefy
        vagas={vagas}
        opcoes={opcoes}
        consulta={consulta}
        temComparacao={temComparacao}
      />

      <p className="text-xs text-ink-muted">
        O <strong>SLA</strong> vem da categoria e é contado em <strong>dias úteis</strong>,
        começando no dia seguinte à abertura (D+1) e indo até a finalização. Sábados,
        domingos e feriados nacionais não contam. A coluna traz também os dias corridos,
        que é o tempo que a vaga está de fato na rua. Vaga fechada congela no dia do
        fechamento, e vaga cancelada não é cobrada de prazo.
      </p>
    </div>
  );
}
