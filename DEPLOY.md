# Subir para produção

O alvo é a Vercel, ligada ao repositório
[`sistemasapg/dash-apg-r-s`](https://github.com/sistemasapg/dash-apg-r-s).
O banco é o Supabase que a APG já usa (plano Pro), no schema **`gupy_apg`** —
que já está migrado e com dados reais. **Não há migração a rodar no deploy.**

## 1. Variáveis de ambiente

Na Vercel: **Settings → Environment Variables**. A tela aceita colar um arquivo
`.env` inteiro — o jeito mais rápido é colar o conteúdo do seu `.env.local`,
que já tem todos os valores certos.

| Variável | O que é | Se faltar |
|---|---|---|
| `DATABASE_URL` | session pooler do Supabase (`aws-1-…pooler.supabase.com:5432`) | o dash não sobe |
| `DATABASE_SCHEMA` | **`gupy_apg`** | escreveria no schema errado, em cima de outro sistema |
| `GUPY_TOKEN` | token de R&S da Gupy | o sync falha com 401 |
| `DASH_USUARIO` / `DASH_SENHA` | a conta principal do painel | **o dash responde 503 e se recusa a subir** |
| `DASH_USUARIOS` | contas adicionais, `email:senha` por linha | só a conta principal consegue entrar |
| `DASH_SEGREDO` | assina o cookie de sessão | cai no `CRON_SECRET`; trocá-lo depois desloga todo mundo |
| `CRON_SECRET` | autoriza o cron a chamar `/api/sync` | o sync diário não roda |
| `DASH_DIAS_DETALHE` | `14` | volta ao padrão 45, e o banco cresce ~3x |

> **`DATABASE_SCHEMA` é o mais perigoso de esquecer.** Sem ele o dash escreve em
> `public`, no mesmo banco onde vivem `rh_sistema_prod`, `financeiro` e o dash do
> instituto. Confira antes do primeiro deploy.

A trava do 503 é proposital: o painel mostra nome e e-mail de candidatos reais,
e uma URL pública sem senha é vazamento de dado pessoal, não descuido de
configuração.

## 2. Fluid Compute — obrigatório

O sync varre 218 vagas e **leva ~131 segundos** (medido em 28/08/2026, 37.557
candidaturas). O padrão da Vercel é 60s, e nesse teto a função morre no meio sem
gravar foto nenhuma.

Em **Settings → Functions**, ligue **Fluid Compute**. É ele que permite o
`maxDuration = 300` que a rota já declara.

Se por algum motivo não der para ligar, o caminho é rodar o sync **fora da
Vercel** — `.\agendar.ps1` cria a tarefa no Windows — e **não** apertar o
recorte de vagas, que mudaria o número que o dash existe para mostrar.

## 3. O cron

O [`vercel.json`](vercel.json) já agenda:

```json
{ "crons": [{ "path": "/api/sync", "schedule": "30 10 * * *" }] }
```

`30 10 * * *` em UTC é **07:30 de Brasília**. No plano Pro o horário é preciso.

O cron não sabe fazer login: ele se identifica pelo `CRON_SECRET` no header
`Authorization`, e o middleware libera só a rota `/api/sync` por esse atalho.

## 4. Conferir depois do deploy

1. Abrir a URL → tem de cair em `/entrar`, e o login tem de funcionar.
2. **Dashboard** → as vagas do R&S aparecem, com o prazo em dias úteis.
3. **Funil Gupy** → o total de candidatos bate com o do ambiente local.
4. Disparar o sync à mão, para não descobrir o problema só amanhã de manhã:

```bash
curl -X GET https://<sua-url>/api/sync -H "Authorization: Bearer <CRON_SECRET>"
```

Ele responde JSON com `gravadas`, `vagas` e o tempo. Se estourar o tempo limite,
é o Fluid Compute que não está ligado.

## 5. Espaço no banco

Medido em 31/08/2026: **~15,6 MB por foto**. Com `DASH_DIAS_DETALHE=14`, o
regime é de **~220 MB** só deste dash. O banco inteiro estava em **501,8 MB**
com todos os outros sistemas, então em regime fica perto de **700 MB** — folgado
nos 8 GB do plano Pro.

O que cresce é só a janela de detalhe. As contagens por vaga e etapa
(`resumo_dia`) ficam para sempre e são pequenas: ~264 kB por dia, ~96 MB ao ano.

Acompanhe com `npm run status` de tempos em tempos.

## Depois

Cada `git push` na `main` vira um deploy. Para mexer com segurança, use um
branch e abra PR — a Vercel cria um deploy de pré-visualização com URL própria,
apontando para o **mesmo banco**. Ou seja: preview escreve em dados reais.
Para testar mudança que grava, use um `DATABASE_SCHEMA` diferente no ambiente
de preview.
