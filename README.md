# Dash R&S — APG

Acompanhamento diário de candidatos por vaga e por etapa do funil, a partir da
Gupy, somado ao cadastro das vagas que o R&S abre no **Pipefy**.

Responde duas perguntas que hoje moram em sistemas diferentes:

- **da Gupy:** "ontem essa vaga tinha 40 candidatos, hoje tem 52, subiu 12 — e
  foram esses 12 aqui";
- **do Pipefy:** "essa vaga está aberta há 47 dias, é da Regional Norte, e é
  esta publicação da Gupy que responde por ela".

O projeto é irmão do `dash-rs-instituto`: mesma arquitetura, mesmo banco de
ideias. O que muda é o **recorte** (todas as vagas publicadas da APG, menos
Joinville) e a **aba Vagas R&S**, que não existe lá.

## O recorte da APG

Entram no dash as vagas que atendem às duas condições:

| Condição | Variável | Padrão |
|---|---|---|
| status na Gupy é `published` | `GUPY_STATUS_VAGA` | `published` |
| o nome **não** contém "Joinville" | `GUPY_EXCLUIR_VAGA` | `Joinville` |

Joinville tem painel próprio (`dash-rs-instituto`); acompanhá-la aqui também
duplicaria o número e as duas telas passariam a discordar entre si.

O status é uma **lista de permissão**, não de bloqueio: uma vaga sem status, ou
com um status novo que a Gupy invente amanhã, fica de fora sozinha em vez de
entrar sem ninguém notar.

## Por que ele guarda fotos diárias

A Gupy só devolve **o estado de agora**. Não existe endpoint que diga quantos
candidatos a vaga tinha na terça passada. Então o dash grava uma **foto
(snapshot) por dia** num Postgres, e as comparações saem daí.

Consequência prática: **a comparação começa a existir a partir do segundo dia de
sync.** No primeiro dia o dash mostra os totais, mas não tem com o que comparar.

O cadastro do Pipefy é a exceção: ele não é foto, é digitado, e por isso não
expira nem some quando snapshots são apagados.

## Como rodar

O banco fica no Supabase, então o primeiro passo é criar um projeto lá (o plano
gratuito basta) e pegar a connection string.

```bash
npm install
cp .env.local.example .env.local   # preencha DATABASE_URL
npm run db:migrar                  # cria as tabelas
npm run demo                       # 14 dias FICTÍCIOS + 5 vagas do Pipefy
npm run dev                        # abre em http://localhost:3000
```

Para apagar os dados de demonstração antes de usar dados reais:
`npm run limpar -- demo` (leva junto os cards `DEMO-*` do Pipefy).

> **Se você usar o MESMO banco do `dash-rs-instituto`, mude o
> `DATABASE_SCHEMA`.** Os dois projetos têm tabelas com o mesmo nome; no mesmo
> schema, um sync sobrescreveria as fotos do outro. Ex.:
> `DATABASE_SCHEMA=dash_rs_gupy`.

### Qual connection string usar — isto custou horas, leia antes

O Supabase oferece três, e **só uma funciona** aqui:

| Opção | Host | Serve? |
|---|---|---|
| Direct connection | `db.<ref>.supabase.co:5432` | ❌ só IPv6 |
| Transaction pooler | `db.<ref>.supabase.co:6543` | ❌ só IPv6 (com pooler dedicado) |
| **Session pooler** | `aws-<n>-<regiao>.pooler.supabase.com:5432` | ✅ **use esta** |

O motivo não tem contorno gratuito: os hosts `db.<ref>` publicam **apenas
endereço IPv6**. As funções do Vercel saem por IPv4, e a maioria das máquinas
também. O erro é `getaddrinfo ENOTFOUND`, que parece host errado mas é ausência
de IPv4. O painel avisa em letras miúdas: *"Session pooler connections are IPv4
proxied for free"*.

Dois detalhes que enganam ao montar a string:

- O prefixo é **`aws-0` ou `aws-1`** dependendo do projeto, não é fixo. Errar
  isso devolve `Tenant or user not found` — que parece senha errada, mas não é.
- O usuário do session pooler é **`postgres.<project-ref>`**, não `postgres`.

Se a senha tiver `@`, `%`, `#` ou `/`, ela precisa ir **percent-encoded** na URL
(`@` → `%40`, `%` → `%25`). Um `@` cru faz o driver achar que o endereço do
servidor começa ali.

Antes de gastar tempo com deploy, confira tudo:

```bash
npm run db:testar
```

Valida o formato da URL, resolve o DNS, conecta de verdade e confirma que o
`search_path` chegou no schema certo — sem nunca imprimir a senha.

> **Sintomas e causas**, para não repetir o diagnóstico:
> `ENOTFOUND` = host só tem IPv6, troque para o session pooler.
> `Tenant or user not found` = prefixo `aws-N` ou região errados, ou usuário sem
> o `.<ref>`.
> `password authentication failed` = aí sim é a senha, e o pooler já achou o projeto.

## Ligando na Gupy

### 1. Gerar o token

Na Gupy: **SETUP → Configurações Avançadas → Geração de Tokens → Gerar Token**.

- Exige perfil **master** ou **administrador**.
- Ao gerar, **habilite a permissão de leitura para `jobs` e `applications`** —
  sem isso a API responde 403.
- O token **não expira**.

Preencha `GUPY_TOKEN=...` no `.env.local`. O arquivo está no `.gitignore`; o
token não deve ser commitado nem passado por chat.

### 2. Conferir o formato antes de confiar

```bash
npm run gupy:inspecionar   # estrutura da resposta, com PII mascarada
npm run gupy:etapas        # todas as etapas em uso e a ordem que o dash daria
npm test                   # trava as regras do funil contra regressão
```

O `gupy:etapas` varre uma amostra de vagas, lista cada etapa em uso e marca com
**`SEM REGRA`** as que o dash não soube ordenar. É ele que alimenta
`config/etapas.ts` — o lugar de corrigir uma etapa fora de lugar sem mexer em
código.

O funil da APG **já foi levantado** (30/08/2026, 17.328 candidaturas em 120
vagas) e está escrito lá. Rode de novo sempre que o R&S criar uma etapa nova.

> **`fields=all` é obrigatório, não é preferência.** No retorno padrão a Gupy
> **omite o campo `status`**. Sem ele, reprovados e contratados apareceriam como
> candidatos ativos e todo o funil ficaria errado. O `all` também traz `source`
> (origem da candidatura). Controlado por `GUPY_CAMPOS` no `.env.local`.

### 3. Gravar a foto do dia

```bash
npm run sync                # foto de hoje
npm run sync -- 2026-08-13  # gravar com outra data
```

Rodar duas vezes no mesmo dia **substitui** a foto, não duplica.

O sync **se recusa a gravar** uma foto vazia quando houve falha de rede: um
snapshot zerado por erro estragaria a comparação do dia seguinte, mostrando uma
queda que nunca aconteceu.

## A aba Vagas R&S

O R&S abre as vagas no Pipefy; a Gupy só sabe da publicação. A aba
**Vagas R&S** é onde as duas metades se encontram.

Cada vaga é lançada à mão com:

| Campo | Para quê |
|---|---|
| **ID do card** | a identidade da vaga aqui dentro — é o número da URL do card |
| **Nome da vaga** | como o time chama |
| **Categoria** e **Função** | definem o SLA; a função é uma lista que segue a categoria |
| **Regional** e **Escola** | de quem é a demanda, das listas em `config/unidades.ts` |
| **Aberta em** | a data de onde sai o "há quantos dias está em aberto" |
| **Situação** | aberta, fechada (preenchida) ou cancelada |
| **Vaga na Gupy** | o vínculo: escolhida numa lista das vagas da foto atual |

Feito o vínculo, o card passa a mostrar quantos candidatos aquela publicação tem
hoje, quanto variou desde a foto anterior e quantos já saíram do funil. E a
página da vaga da Gupy ganha uma ficha dizendo de onde ela veio.

**Vários cards podem apontar para a mesma vaga da Gupy** — e esse é o caso
normal, não a exceção. A Gupy publica por **cidade** ("Professor de Matemática
| Curitiba") e o R&S abre um card por **unidade**; como uma cidade tem várias
escolas, a mesma publicação atende vários cards.

A consequência é que os candidatos daquela publicação são um **pool
compartilhado**: a tela marca "pool dividido com N cards" na linha, e o total do
Dashboard soma uma vez por publicação, e não por card — somar por card contaria
as mesmas pessoas uma vez por escola.

**O tempo em aberto conta da data digitada**, não da criação da vaga na Gupy
(que costuma ser posterior ao pedido). Ao marcar a vaga como fechada, o contador
**congela** no dia do fechamento — sem isso, uma vaga fechada em março
continuaria engordando e a média de preenchimento subiria sozinha todo dia.

Lançar o mesmo card de novo **atualiza** o cadastro em vez de recusar: o time
lança cedo com o que sabe e volta depois para amarrar a vaga e fechar. O ID do
card não é editável — trocá-lo seria outro card; para corrigir, remova e lance
de novo.

Na lista, uma vaga aberta há mais de **30 dias** aparece em amarelo e acima de
**60** em vermelho. Não é um SLA acordado com ninguém, é um marcador para a vaga
velha não se perder no meio da lista — o limite vive em
[`components/TabelaVagasPipefy.tsx`](components/TabelaVagasPipefy.tsx).

Este é o único dado do dash digitado por gente. Ele não pertence a nenhuma foto,
não entra no cascade e sobrevive a `npm run limpar` — apagar o histórico da Gupy
não apaga o trabalho do time.

## O SLA das vagas

Cada categoria carrega o prazo de fechamento da vaga, em **dias úteis**:

| Categoria | SLA | Funções |
|---|---|---|
| Vagas Administrativas | 15 dias úteis | 9 funções (Auxiliar Adm, ASG, Merendeira…) |
| Vagas Professores | 7 dias úteis | 12 funções (PROFESSOR(A), PAC, PAEE…) |
| Vagas Jovem Aprendiz | 10 dias úteis | Jovem Aprendiz |
| Vagas Estagiário | 10 dias úteis | Tutor |

Prazos e funções vivem em [`config/categorias.ts`](config/categorias.ts), num
arquivo só. Mudar um número ali muda o painel inteiro na hora.

**A contagem é D+1:** o dia da abertura não conta, o relógio começa no próximo
dia útil. Sábado, domingo e feriado nacional não contam — Carnaval e Corpus
Christi entram como não úteis, o que é ajustável em
[`config/feriados.ts`](config/feriados.ts) junto com os feriados municipais, que
o dash não tem como adivinhar.

O prazo vale **do início até a finalização**. Vaga fechada congela no dia do
fechamento e recebe um veredito definitivo; vaga cancelada sai de toda a conta,
porque ninguém deixou de cumprir prazo de uma vaga que a APG tirou do ar.

O formulário exige a categoria, e a função aparece em cascata: cada categoria
mostra só as suas, num `select`, e o servidor recusa função que não pertence à
categoria — é isso que mantém o campo agrupável nos relatórios. Categoria de
função única já vem com ela escolhida.

Uma categoria nova, acrescentada antes de as funções dela serem levantadas, cai
num campo de texto livre em vez de travar o lançamento.

> **Dias úteis e dias corridos convivem de propósito.** O corrido responde "há
> quanto tempo essa vaga está na rua", que é o que o gestor pergunta; o útil
> responde "o R&S estourou o prazo?", que é o que o SLA cobra. Um número só não
> serve para as duas perguntas.

### Regionais e escolas

Os dois campos saem de listas fixas em [`config/unidades.ts`](config/unidades.ts),
consolidadas da aba **Escola x Regional** da planilha do `pipefy-rs` — o de-para
que o próprio R&S mantém. São 4 regionais (CWT, GUA, SJP, CSC) e 22 escolas.

A regional é um `select` fechado e grava a **sigla**, que é como as outras
ferramentas da APG gravam. Quem já digitou "São José dos Pinhais" à mão não vira
um grupo à parte: o servidor normaliza para `SJP` ao gravar.

A escola também é um `select` fechado, que segue a regional escolhida, com uma
opção **"— toda a regional —"** para a vaga que não pertence a uma escola
específica. O servidor recusa escola de fora da lista e diz o que fazer: se for
escola nova, ela entra em `config/unidades.ts`. O que já estava gravado à mão é
casado com a lista ignorando acento e caixa, então "Tarsila do Amaral" vira
`TARSILA DO AMARAL` em vez de uma segunda escola.

> **Cidade não é escola.** A Gupy publica por cidade — "Professor de Matemática
> | Fazenda Rio Grande" — e cidades como Fazenda Rio Grande, Roncador,
> Laranjeiras do Sul, Matinhos & Pontal e Juiz de Fora **não** são escolas: são
> onde a vaga foi anunciada. São duas dimensões diferentes, e por isso o dash
> nunca tenta casar uma com a outra pelo nome. O vínculo entre a vaga do R&S e a
> publicação da Gupy é feito à mão, pelo código da vaga.

### O Dashboard

É a tela inicial. Quatro perguntas, nessa ordem:

1. **Quantas vagas tenho em aberto** — e quantas estão fora do prazo.
2. **Quantas por categoria** — barras clicáveis; clicar recorta a lista abaixo.
3. **Filtro por regional e escola** — recorta a tela inteira, e a lista de
   escolas segue a regional escolhida.
4. **Tempo médio contra o prazo, por categoria** — a média em dias úteis das
   vagas abertas, lida contra o SLA da própria categoria.

O gráfico de tempo médio tem um truque que vale entender: **o traço do SLA fica
sempre na mesma posição, e é a barra que varia**. Assim 9 dias aparece curto numa
administrativa (prazo 15) e longo numa de professor (prazo 7) — que é a leitura
correta, e a que uma escala comum de dias esconderia. É o mesmo problema que a
média sozinha tem: ela não compara categorias com prazos diferentes, por isso o
prazo viaja junto na mesma linha.

A lista embaixo vem em ordem de urgência (menor folga primeiro) e traz o número
de candidatos da vaga vinculada na Gupy — é o que separa duas causas opostas do
mesmo sintoma: vaga atrasada **e vazia** é problema de atração; atrasada **e
cheia** é problema de processo.

> **Os números dependem do time fechar as vagas no dash.** Vaga preenchida na
> vida real e nunca marcada como fechada continua contando prazo e vira atraso.
> Combine isso com o R&S antes de a diretoria olhar a tela.

### Por que não há foto diária da carteira do Pipefy

Diferente da Gupy, aqui o histórico é **reconstruível**: com `aberta_em`,
`fechada_em` e a categoria, "em 15/07, quais vagas estavam abertas e quantos
dias úteis cada uma tinha consumido" é uma conta, não um registro. Guardar
snapshot da carteira seria duplicar dado que já se deduz das datas.

## Publicar

### No Vercel

```
Variáveis de ambiente (Settings > Environment Variables):

  DATABASE_URL      connection string do session pooler do Supabase
  DATABASE_SCHEMA   se o banco for compartilhado com o dash do instituto
  GUPY_TOKEN        token de R&S da Gupy
  DASH_USUARIO      quem pode entrar
  DASH_SENHA        a senha
  CRON_SECRET       qualquer texto longo e aleatório
```

Depois de configurar, `npm run db:migrar` uma vez (da sua máquina, apontando
para o mesmo banco) e o deploy sobe funcionando. O
[`vercel.json`](vercel.json) já agenda o sync: `30 10 * * *`, que é **07:30 de
Brasília** — o cron do Vercel trabalha em UTC.

**Duas travas de segurança que valem entender:**

O dash mostra nome e e-mail de candidatos reais. Sem `DASH_USUARIO` e
`DASH_SENHA`, o [`middleware.ts`](middleware.ts) **se recusa a servir o painel em
produção** e responde 503. É proposital: uma URL pública com esses dados é
vazamento de dado pessoal, não descuido de configuração.

O cron não sabe fazer login, então ele se identifica pelo `CRON_SECRET` no header
`Authorization`. Só a rota `/api/sync` aceita esse atalho.

> ### ⚠️ O tempo da função importa aqui mais do que no dash do instituto
>
> Lá o recorte de uma praça fazia o sync levar ~8 segundos. Aqui o recorte é
> largo — **todas as vagas publicadas menos Joinville** — e o sync leva minutos.
>
> Com **Fluid Compute** ligado, uma função do Vercel vai até 300s, e a rota está
> configurada para isso (`maxDuration = 300`). Sem Fluid Compute o teto é 60s e
> **o sync não cabe**: a função morre no meio e nenhuma foto é gravada.
>
> Meça na primeira execução (`npm run sync` imprime o tempo). Se não couber, o
> caminho é rodar o sync **fora do Vercel** (abaixo) — e não apertar o recorte,
> que mudaria o número que o dash existe para mostrar.

### Ou na sua máquina (Windows)

```powershell
.\agendar.ps1              # todo dia às 07:00
.\agendar.ps1 -Hora 06:30
.\agendar.ps1 -Remover
```

Cria uma tarefa no Agendador de Tarefas do Windows chamada
`Dash RS APG - Sync Gupy` (nome diferente do dash do instituto de propósito, para
as duas poderem conviver na mesma máquina). Não precisa de administrador. Cada
execução grava em `data/sync.log`.

Testar sem esperar o horário:

```powershell
schtasks /Run /TN "Dash RS APG - Sync Gupy"
```

> A máquina precisa estar ligada no horário. Se ela vive desligada, o sync tem
> de morar no Vercel ou em outro servidor.

## O que o dash mostra

- **Dashboard** (a tela inicial) — quantas vagas estão em aberto, quantas por
  categoria (barras clicáveis), o tempo médio de cada categoria contra o próprio
  prazo, e a lista das vagas em ordem de urgência. Filtros de regional e escola
  recortam a tela inteira. No rodapé, uma faixa com os números da Gupy, para a
  home não ignorar a outra metade do dash.
- **Vagas R&S** — o cadastro das vagas: lançar, editar, fechar e amarrar à vaga
  da Gupy. É a tela de trabalho do time; o Dashboard é a de leitura.
- **Funil Gupy** — total de candidatos com a variação contra a foto anterior,
  candidaturas novas, quantos avançaram de etapa, funil consolidado, série
  histórica e a tabela de vagas ordenável. Na lateral, filtro multi-seleção por
  vaga que recorta o painel inteiro.
- **Vaga** — o mesmo recorte para uma vaga só, os dados da própria vaga na Gupy,
  a ficha do card do Pipefy que a originou e a **lista nominal dos candidatos**:
  nome, e-mail, etapa, situação, origem, data da candidatura e há quantos dias a
  pessoa está parada na etapa.
- **Movimentações** — nominalmente quem entrou, quem avançou, quem voltou e quem
  saiu do funil entre as duas fotos.
- **Entenda o sistema** — o que cada etapa significa, o que cada número mede e de
  onde vêm os dados. É a página para mandar a quem nunca viu o dash.

**Clicar numa etapa do funil** abre a lista de quem está nela. O recorte fica na
URL, então o link já abre filtrado quando você manda para alguém.

O seletor no topo permite comparar **quaisquer duas datas**, não só ontem e hoje.
A caixa "Só candidatos ativos" tira reprovados, desistentes e contratados da
conta. Enquanto existir só uma foto, as colunas de variação **somem** em vez de
mostrar "+234" comparando contra o nada.

## Comandos

| Comando | Para quê |
|---|---|
| `npm run dev` | sobe o dash em desenvolvimento |
| `npm run sync` | grava a foto de hoje a partir da Gupy |
| `npm run status` | o que há no banco, quanto ocupa, até onde vai o detalhe |
| `npm run gupy:etapas` | lista as etapas em uso e marca as que estão sem regra |
| `npm run gupy:inspecionar` | estrutura da resposta da API, com PII mascarada |
| `npm test` | trava as regras do funil e as contas do Pipefy |
| `npm run limpar -- demo` | apaga as fotos fictícias e os cards `DEMO-*` |
| `npm run demo` | gera 14 dias fictícios para ver a interface |

## Tamanho do banco

Sem filtro de praça, a conta da Gupy pode produzir dezenas de milhares de
candidaturas por foto. Por isso o sync compacta sozinho: o detalhe por candidato
fica **45 dias** (`DASH_DIAS_DETALHE`) e as contagens por vaga/etapa ficam **para
sempre**, numa tabela agregada pequena.

Total, funil, variação e histórico funcionam para qualquer data do passado. Só a
lista nominal — "quem avançou", "quem são os 234" — expira com a janela, e as
telas avisam quando isso acontece em vez de mostrarem vazio.

Meça o custo real desta conta com `npm run status` depois das primeiras fotos: é
ele que diz se 45 dias de janela cabem no plano do Supabase.

## Decisões que valem saber

**Ordem das etapas.** O funil é ordenado por palavras-chave em `lib/mapping.ts`,
função `ordemEtapa`. Para corrigir uma etapa fora de lugar **não mexa no
código**: use [`config/etapas.ts`](config/etapas.ts), que aceita
`'Nome exato da etapa': ordem` e ganha da adivinhação automática.

Duas armadilhas reais que já custaram bug, ambas cobertas por `npm test`:

- `Reprovado` contém `prova`. Por isso o casamento é por **palavra inteira** e a
  saída do funil é avaliada **antes** das demais etapas.
- `Aula Teste` contém `teste`, mas acontece bem depois da prova online — é a aula
  demonstrativa. Por isso ela é avaliada antes do grupo de provas.

**Ser reprovado não é "avançar".** A ordem da etapa sobe quando o candidato sai
do funil, o que faria a reprovação contar como progresso. Saída do funil é um
tipo próprio de movimentação (`Saiu do funil`), separado de `Avançou`.

**Quem saiu do funil não fica na etapa antiga.** Na Gupy, quem é reprovado na
Prova Online continua marcado em "Prova Online" — e contá-lo ali infla a etapa
com gente que já saiu. O dash agrupa essas pessoas em fases próprias no fim do
funil: `Reprovado`, `Desistiu` e `Contratado`. A etapa original não se perde: na
lista de candidatos a coluna **Etapa** mostra onde a pessoa estava quando saiu.

**Tempo parado na etapa.** A coluna "Parado há" usa duas fontes, nessa ordem:

1. **O histórico do dash** — o dia em que ele viu o candidato mudar de etapa. Exato.
2. **O `updatedAt` da Gupy** — a última alteração da candidatura. Aproximado,
   porque qualquer edição mexe nessa data, e marcado com `*` na tela.

**Identidade do candidato.** Para dizer "esse candidato mudou de etapa" é preciso
reconhecê-lo entre dois dias. A chave é `vaga + id da candidatura`, caindo para
e-mail e depois nome quando o id não vem.

**O cadastro do Pipefy fica fora do modelo de snapshot.** Ele é a única tabela
sem `snapshot_id`, e isso é deliberado: trabalho digitado por gente não pode ser
levado embora pelo cascade que apaga uma foto.

## Identidade visual

O logo fica em **`public/logo.png`**. As cores da marca (azul `#2a4a8f`, laranja
`#e8622a`) vivem em `--marca-azul` e `--marca-laranja`, e são usadas **só na
moldura**: cabeçalho, navegação, foco.

No tema escuro o logo passa por `invert(1) hue-rotate(180deg)` (`--logo-filtro`):
o branco do fundo vira preto e some, e o azul-marinho vira um azul claro —
inverter sozinho devolveria um bege.

Os gráficos continuam na paleta validada para daltonismo e contraste. Trocar as
cores de série pelas cores do logo deixaria o painel mais "da marca" e menos
legível para quem não distingue certos tons — não vale a troca.

## Quem pode entrar

O acesso é por tela de login, com sessão em cookie assinado (HMAC) que dura 12
horas. As contas vivem em variáveis de ambiente:

-  /  — a conta principal;
-  — as demais, uma por linha, no formato .

Não há banco de usuários **de propósito**: o painel tem um punhado de pessoas do
mesmo time e nenhuma permissão diferente entre elas. Uma tabela traria cadastro,
recuperação de senha e tela de administração para resolver o que uma variável
resolve. No dia em que existir perfil diferente por pessoa — alguém que só lê,
alguém que lança vaga — aí a tabela passa a valer a pena.

O e-mail de quem entrou aparece no cabeçalho, ao lado de "Sair": num computador
compartilhado, "Sair" sozinho não diz de qual sessão você está saindo.

## Quem pode entrar

O acesso é por tela de login, com sessão em cookie assinado (HMAC) que dura 12
horas. As contas vivem em variáveis de ambiente:

- `DASH_USUARIO` / `DASH_SENHA` — a conta principal;
- `DASH_USUARIOS` — as demais, uma por linha, no formato `email:senha`.

Não há banco de usuários **de propósito**: o painel tem um punhado de pessoas do
mesmo time e nenhuma permissão diferente entre elas. Uma tabela traria cadastro,
recuperação de senha e tela de administração para resolver o que uma variável
resolve. No dia em que existir perfil diferente por pessoa — alguém que só lê,
alguém que lança vaga — aí a tabela passa a valer a pena.

O e-mail de quem entrou aparece no cabeçalho, ao lado de "Sair": num computador
compartilhado, "Sair" sozinho não diz de qual sessão você está saindo.

## Stack

Next.js 15 · React 19 · Tailwind 4 · Postgres no Supabase via
[postgres.js](https://github.com/porsager/postgres). Gráficos são SVG escrito à
mão, sem biblioteca de charts. O cadastro do Pipefy usa Server Actions, sem
rota de API própria.

Os scripts em `scripts/` são TypeScript rodando direto no Node 24, que remove os
tipos sozinho — por isso os imports dentro de `lib/` levam a extensão `.ts`
explícita.
