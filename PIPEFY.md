# Manual: como os dados do Pipefy chegam no dash

Última conferência: **20/10/2026**, lendo os próprios logs da planilha.

---

## 1. A ideia em uma frase

**O dash nunca fala com o Pipefy.** Ele lê uma planilha do Google. Quem fala com
o Pipefy são robôs que enchem essa planilha.

```
Pipefy  →  [robô]  →  planilha "R&S _ BASE"  →  dash
```

Isso é de propósito. O dash roda na Vercel e cai de pé se o Pipefy estiver fora
do ar ou se a cota de API acabar — ele só precisa que a planilha exista. E o
time enxerga a planilha, o que faz qualquer problema ser depurável por quem não
programa.

---

## 2. As três fontes de dado do Pipefy

Existem **três** caminhos independentes, e eles não se misturam:

| # | Fonte | O que tem | Está automático? |
|---|---|---|---|
| 1 | Aba `pipefy_cards` | 58 colunas: os campos do card | ✅ **Sim**, todo dia 06:46 |
| 2 | Aba `pipefy_relatorio` | 143 colunas: os campos **+ entrada e saída de cada fase** | ❌ **Não.** Rodou 1 vez, na mão |
| 3 | Tabela `vaga_pipefy` (Postgres) | O vínculo card ↔ vaga da Gupy | ❌ Não, é digitado pelo R&S |

A diferença entre 1 e 2 é a que importa: **só o relatório traz o histórico de
fases.** Sem ele não existe "quanto tempo ficou em cada etapa", e portanto não
existe nem a tela de Pendências nem a de Tempo por time.

---

## 3. O que está rodando sozinho hoje

### ✅ Aba `pipefy_cards` — automático e saudável

- **Quem faz:** `apps-script/pipefy-para-sheets.gs`, instalado dentro da própria
  planilha (Extensões → Apps Script).
- **Como busca:** API GraphQL do Pipefy, página por página (50 cards por
  chamada).
- **Quando:** todo dia às **06:46** de Brasília — de propósito antes do sync da
  Gupy, às 07:30.
- **O que faz:** reescreve a aba inteira. Uma linha por card, uma coluna por
  campo.
- **Prova de que funciona:** a aba `status_sync` registra cada rodada. Os
  últimos dias:

  | Quando | Resultado | Cards | Segundos |
  |---|---|---|---|
  | 2026-10-18 | OK | 2.262 | 49,0 |
  | 2026-10-19 | OK | 2.262 | 43,8 |
  | 2026-10-20 | OK | **2.275** | 44,0 |

- **Custo de cota:** ~46 chamadas por rodada (2.275 ÷ 50), ou seja **~1.380 por
  mês**. É de longe o maior consumidor da cota.

### ❌ Aba `pipefy_relatorio` — **não** está automática

Esta é a resposta curta para "hoje está automático?": **a parte que o dash mais
usa, não.**

- **Estado atual:** a aba tem 2.266 linhas, carregadas **uma única vez**, em
  **19/10/2026 às 13:14**. A aba `log_relatorio` tem exatamente uma linha, que é
  essa.
- **Como foi carregada:** na mão — o relatório salvo do Pipefy foi exportado por
  scraping no PC, convertido para CSV e enviado para a planilha por um Web App
  (`apps-script/receptor-relatorio.gs`).
- **Consequência prática:** Pendências e Tempo por time estão lendo uma foto de
  **19/10**. Os números não erram — eles envelhecem. Um card que mudou de fase
  hoje aparece na fase de ontem, e o tempo parado conta a partir de uma data que
  pode já ter mudado.

### ❌ Tabela `vaga_pipefy` — manual por enquanto

É o cadastro da aba **Vagas R&S**: card, nome, regional, unidade e o **vínculo
com a vaga da Gupy**. O R&S digita.

O vínculo card ↔ Gupy é a parte que **nenhum robô resolve**, porque não existe
no Pipefy: a Gupy publica por cidade, o Pipefy abre por unidade, e dizer qual
publicação corresponde a qual card é uma decisão humana. O resto do cadastro é
que dá para automatizar.

---

## 4. Quem lê o quê, dentro do dash

| Tela | Arquivo | Lê de |
|---|---|---|
| Dashboard, Funil Gupy, Movimentações | `lib/db.ts` | Postgres (dados da **Gupy**, não do Pipefy) |
| **Vagas R&S** | `lib/pipefy.ts` | Postgres, tabela `vaga_pipefy` |
| **Pendências** | `lib/pendencias.ts` | Aba `pipefy_relatorio` (gid 1135125070) |
| **Tempo por time** | `lib/jornada.ts` | Aba `pipefy_relatorio` (gid 1135125070) |
| **SLA por função** | `lib/sla-funcao.ts` | Aba `pipefy_relatorio` (gid 1135125070) |

As três últimas leem a planilha **a cada carregamento de página** (4 a 8
segundos, 2,4 MB de CSV) e **não gravam nada**. São ensaio: nada do que elas
calculam está no banco.

---

## 5. Nenhuma tela chama a API do Pipefy

Vale dizer com clareza, porque a pergunta "o que vem do relatório e o que vem da
API" sugere que as duas coisas alimentam o dash ao mesmo tempo. **Não
alimentam.**

- O dash lê **só a planilha**. Zero chamadas de API, zero token do Pipefy nas
  variáveis de ambiente da Vercel.
- A API aparece **antes** da planilha: é o robô da aba `pipefy_cards` que a usa,
  dentro do Apps Script, com o token guardado nas propriedades do script.
- `lib/pipefy-api.ts` existe, mas **nenhuma tela o importa**. É ferramenta de
  diagnóstico, rodada na mão por `npm run pipefy:descobrir` quando se precisa
  investigar um campo ou uma fase nova. Esse sim usa `PIPEFY_TOKEN` do `.env`.

Resumindo: **API → planilha → dash.** A API está a dois passos de distância.

---

## 6. Cota do Pipefy

O teto do plano é **10.000 chamadas por mês** (Enterprise). O Pipefy conta 1 por
requisição GraphQL; download de arquivo não conta.

| Quem | Por rodada | Por mês |
|---|---|---|
| `pipefy_cards` (diário) | ~46 | **~1.380** |
| `pipefy_relatorio` pela API, se for ligado | ~2 a 4 | **~60 a 120** |
| Diagnóstico na mão | poucas | desprezível |

Sobra folga de sobra. O número a notar é o contraste: **o robô caro é o que
alimenta a aba que ninguém lê** (ver abaixo), e o barato é o que alimenta as
duas telas novas.

---

## 7. Duas pontas soltas (achadas ao conferir isto)

Não são urgências, mas vale saber que existem.

1. **A aba `pipefy_cards` não alimenta nenhuma tela hoje.** O único módulo que a
   lia é `lib/simulacao-pipefy.ts`, e nada mais o importa — ele e
   `components/TabelaSimulacao.tsx` ficaram órfãos quando a tela de Pendências
   foi reescrita. Ou seja: ~1.380 chamadas/mês mantendo uma aba que o dash
   ignora.

   Como as 143 colunas do relatório **contêm** as 58 da `pipefy_cards`, dá para
   aposentar esse robô e ficar só com o do relatório — a cota cairia de ~1.380
   para ~120 por mês. Só não faça isso antes do item 2, ou o dash fica sem
   nenhuma fonte.

2. **Falta escolher como automatizar o relatório.** Há duas implementações
   prontas e nenhuma rodando:

   | | Apps Script na nuvem | Scraping no PC |
   |---|---|---|
   | Arquivo | `apps-script/pipefy-relatorio-para-sheets.gs` | robô Playwright + `receptor-relatorio.gs` |
   | Roda sem PC ligado | ✅ sim | ❌ não |
   | Gasta cota | ~2 a 4 por rodada | **zero** |
   | Sessão expira | ❌ não | ✅ sim, precisa `npm run login` de novo |
   | Estado | nunca completou uma rodada (erro de serviço do Drive) | foi o que carregou a aba em 19/10 |

   O da nuvem é o que não depende de ninguém lembrar de nada. O passo a passo
   está na seção 8.

---

## 8. Como ligar a automação do relatório

**Não é só agendar.** O script da nuvem nunca completou uma rodada, e o motivo
foi o erro `Drive is not defined` — falta um serviço que precisa ser habilitado
na mão. Agendar antes disso só agenda uma falha diária.

São quatro passos, no editor do Apps Script da planilha **R&S _ BASE**
(Extensões → Apps Script):

### Passo 1 — habilitar o serviço do Drive (é o que estava faltando)

No painel esquerdo, em **Serviços**, clique no **+** e adicione **Drive API**.
O identificador precisa ficar `Drive`, que é o padrão.

O script usa `Drive.Files.create` para converter o `.xlsx` que o Pipefy devolve
em planilha do Google. Sem esse serviço, essa linha não existe e a rodada morre
ali.

### Passo 2 — guardar o token

Em **Configurações do projeto → Propriedades do script**, confira se existe:

- `PIPEFY_TOKEN` — o token de API do Pipefy, **ou**
- `PIPEFY_TOKEN` + `PIPEFY_TOKEN_URL` — se for Service Account.

O token fica aqui e nunca no código, para quem tiver acesso de leitura ao script
não levar o token junto.

### Passo 3 — testar antes de agendar

Rode a função **`testarConexao`** pelo menu do editor. Ela deve imprimir o nome
do pipe e a lista de relatórios, com `<== em uso` marcando o **301121312**.

Se isso funcionar, rode **`atualizarRelatorio`** uma vez, na mão, e confira a
aba `log_relatorio`. É o teste de verdade: ele exercita o Drive, o download e a
escrita na aba.

### Passo 4 — agendar

Rode **`instalarGatilhoDiario`** uma vez. Ela cria o gatilho diário das 9h e
apaga qualquer gatilho repetido antes, então rodar duas vezes não duplica nada.

### Depois: conferir no dia seguinte

Abra a aba `log_relatorio`. Deve ter uma linha nova, com as colunas de
**chamadas na rodada** e **chamadas no mês** preenchidas.

> Detalhe cosmético: a aba `log_relatorio` foi criada pelo robô antigo, com duas
> colunas (`Quando`, `Linhas`). O script da nuvem grava quatro valores por linha
> e só cria o cabeçalho quando a aba está vazia — então as duas colunas novas
> vão aparecer sem título. Não quebra nada; para arrumar, basta escrever
> `Chamadas nesta rodada` e `Chamadas no mês` em C1 e D1 na mão.

### E o `pipefy_cards`?

Só depois de o relatório rodar sozinho por alguns dias é que vale aposentar o
robô do `pipefy_cards` (seção 7, item 1). Até lá, deixe os dois: um custa cota,
o outro é o que sustenta as telas.

---

## 9. Como conferir, a qualquer momento, se está no ar

Sem abrir código. Cole no navegador, trocando só o nome da aba no fim:

```
https://docs.google.com/spreadsheets/d/1pt8sHmP-VQiP7K-jAXXA0TbeWOG1VT2exKZGecplYjg/gviz/tq?tqx=out:csv&sheet=status_sync
```

- **`status_sync`** → uma linha por rodada da aba `pipefy_cards`. Se a última
  linha for de hoje e disser `OK`, está no ar.
- **`log_relatorio`** → uma linha por carga da aba `pipefy_relatorio`. Se a
  última linha for antiga, Pendências e Tempo por time estão mostrando dados
  daquela data.

Dentro do dash, as duas telas também imprimem **"lido em ..."** no cabeçalho —
mas atenção: esse carimbo é a hora em que o dash leu a *planilha*, não a hora em
que a planilha recebeu dados do Pipefy. Para a idade real do dado, olhe o
`log_relatorio`.

---

## 10. Onde ficam as decisões de de-para

Quando um nome muda no Pipefy, é um destes três arquivos que precisa saber:

| Arquivo | Decide |
|---|---|
| `config/pipefy.ts` | categoria do cargo → categoria do dash; unidade → regional/escola; o que conta como fase aberta, fechada ou cancelada |
| `config/etapas-pipefy.ts` | de quem é cada fase (R&S, DP, Regional, Fim) e o prazo de cada uma |
| `config/categorias.ts` | o SLA de cada categoria de vaga |

Dois cuidados que já custaram tempo:

- **Nomes de fase são casados ao pé da letra.** A fase
  `Atualizar  ou Cadastrar no Domínio` tem **dois espaços** depois de
  "Atualizar", e é assim que precisa ficar no código — "consertar" quebra o
  casamento com as colunas do relatório.
- **Nunca use a coluna "Tempo total na fase X (dias)"** do relatório. O Google
  Sheets lê o ponto decimal como separador de milhar, e `4.98265` dias viram
  `498.265`. O tempo é sempre recalculado a partir das datas de entrada e saída,
  que atravessam limpas — e de quebra sai em dias úteis, que é o que o time usa.
