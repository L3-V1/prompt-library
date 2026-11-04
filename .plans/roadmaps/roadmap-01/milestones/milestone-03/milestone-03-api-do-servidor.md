---
titulo: "M3: API do servidor"
data: 2026-11-04
status: implementado
tipo: milestone
numero: "03"
pai: roadmaps/roadmap-01
triagem: ok
branch: feat/milestone-03-api-do-servidor
encerrado_em: 2026-11-04
---

# M3: API do servidor (`src/server/`)

## Contexto

O M1 entregou o núcleo (`src/core/`, `criarAcervo`: listar, ler, criar, salvar com `baseHash`, favoritar, mover, excluir, Coleções, Versões, diff e restaurar). O M2 entregou o `/save`, que grava direto no vault. Hoje `src/server/main.ts` só tem `/api/health`. O M3 expõe o núcleo por uma API REST em `127.0.0.1` para a interface do M4, com um índice em memória que acompanha as edições feitas no Obsidian e pelo `/save` (watcher), avisos por SSE e conflito como 409.

**Pronto quando:** `npm run typecheck`, `npm run lint` e `npm test` passam; com `npm run dev`, um `.md` criado com `echo` no vault aparece em `GET /api/prompts` com `id` gravado e gera um evento em `/api/eventos`; um `PUT` com `baseHash` antigo responde 409 com o estado do disco e o diff.

## Dependências novas
- `chokidar` (v4+): watcher, com `awaitWriteFinish` e `ignored` por função.
- `zod` (já está no `node_modules` como dependência transitiva; passa a ser direta, e o M5 também a usa) e `@hono/zod-validator` para validar corpo e query.

## Passos

### 1. Núcleo (`src/core/`)
- `tipos.ts`/`config.ts`: `Pastas` ganha `diretrizes` (`Prompts/_Diretrizes.md`).
- `diretrizes.ts` (novo): `criarDiretrizes(pastas)` com
  - `ler()` → `{ conteudo, hash }`; arquivo ausente vale `{ conteudo: '', hash: null }`;
  - `salvar(conteudo, baseHash | null)` com `gravarAtomico` (`arquivos.ts`); se o hash no disco difere de `baseHash` (ou o arquivo passou a existir com `baseHash: null`), lança `DiretrizesConflitoError { atual }` (novo em `erros.ts`). Sem Versões (fora do roadmap).
- `texto.ts` (novo): mover `normalizar` de `skills/save/similaridade.ts` para cá e reexportar; a skill passa a importar do núcleo.
- Exportar tudo em `src/core/index.ts`.

### 2. Índice em memória (`src/server/indice.ts`)
`criarIndice(acervo)`:
- Estado: `{ prompts: Map<id, Prompt>, problemas, colecoes }`, preenchido por `acervo.listar()` + `acervo.listarColecoes()`.
- `atualizar()`: relê tudo (o acervo é pequeno), com *single-flight* (uma releitura por vez; pedidos durante ela marcam outra rodada) e devolve as mudanças por id/hash: `{ criados, alterados, removidos }`. Se houver mudança ou mudar o conjunto de Coleções, emite `acervo` para os ouvintes.
- Consultas: `listar(filtros)`, `obter(id)`, `colecoes()` → `{ nome, total }[]` (inclui pastas vazias e "Sem coleção"), `tags()` → `{ tag, total }[]` (mais usadas primeiro), `problemas()`.
- **Busca** (`src/server/busca.ts`, pura): filtros `q`, `colecao` (`''` = Sem coleção), `tag`, `favorito`. `q` é normalizado com `normalizar` e dividido em termos; todos os termos precisam aparecer em título, Tags ou corpo. Ordem: pontuação (título 3, Tag 2, corpo 1 por termo), depois favoritos e título (`localeCompare` pt-BR). Sem `q`, ordena por título.
- As rotas de escrita chamam o acervo e depois `await indice.atualizar()`, para a resposta e a próxima leitura já verem o novo estado. A releitura disparada pelo watcher em seguida não encontra diferença e não emite evento repetido.

### 3. Watcher (`src/server/observador.ts`)
- `chokidar.watch(pastas.prompts, { ignoreInitial: true, awaitWriteFinish: { stabilityThreshold: 100 }, ignored })`, ignorando qualquer segmento que comece com `.` (`.versoes`, `.analises`, temporários do `gravarAtomico`).
- Eventos em `.md` e pastas com debounce de 150 ms → `indice.atualizar()`. Mudança em `_Diretrizes.md` → evento `diretrizes` com o novo hash.
- Na partida, `mkdir -p Prompts/` (o watcher precisa da pasta; o app vai mesmo gravar lá).
- `fechar()` para os testes e o desligamento.
- A gravação de `id` pela varredura (decisão 6) gera um evento a mais, que estabiliza na releitura seguinte.

### 4. Eventos SSE (`src/server/eventos.ts`)
- Hub simples de ouvintes; `GET /api/eventos` usa `streamSSE` (`hono/streaming`).
- Eventos: `acervo` (`{ criados, alterados, removidos }`, ids) e `diretrizes` (`{ hash }`); `ping` a cada 30 s. O M4 invalida as queries do TanStack Query a partir deles e detecta quando o Prompt aberto mudou fora.

### 5. App e rotas (`src/server/app.ts` + `src/server/rotas/*.ts`)
`criarApp({ acervo, indice, diretrizes, eventos })` devolve o `Hono` (testável com `app.request()`, sem rede); `main.ts` só monta as dependências, liga o watcher, serve o estático em produção e chama `serve` em `127.0.0.1:5174`. Rotas encadeadas para exportar `type AppType` (cliente `hc` do Hono no M4).

| Método e rota | Corpo/query | Resposta |
|---|---|---|
| `GET /api/prompts` | `q`, `colecao`, `tag`, `favorito` | `{ prompts: Resumo[], problemas }` (Resumo = Prompt sem `corpo`) |
| `GET /api/prompts/:id` | | `Prompt` |
| `POST /api/prompts` | `{ titulo, corpo, tags?, favorito?, colecao? }` | 201 `Prompt` |
| `PUT /api/prompts/:id` | `{ titulo?, tags?, corpo?, baseHash }` | `Prompt` ou 409 |
| `PUT /api/prompts/:id/colecao` | `{ colecao: string \| null }` | `Prompt` |
| `PUT /api/prompts/:id/favorito` | `{ favorito }` | `Prompt` |
| `DELETE /api/prompts/:id` | | 204 (vai para `.trash/`) |
| `GET /api/prompts/:id/copia` | | `text/plain` com o corpo verbatim (decisão 25) |
| `GET /api/prompts/:id/versoes` | | `Versao[]` |
| `GET /api/prompts/:id/versoes/:versaoId` | | `VersaoComConteudo` |
| `GET /api/prompts/:id/versoes/:versaoId/diff` | `para` = `atual` (padrão) ou id | `Change[]` |
| `POST /api/prompts/:id/versoes/:versaoId/restaurar` | `{ baseHash }` | `Prompt` ou 409 |
| `GET /api/colecoes` | | `{ nome, total }[]` |
| `POST /api/colecoes` | `{ nome }` | 201 `{ nome }` |
| `PUT /api/colecoes/:nome` | `{ novoNome }` | `{ nome }` |
| `GET /api/tags` | | `{ tag, total }[]` |
| `GET /api/diretrizes` / `PUT` | `PUT`: `{ conteudo, baseHash }` | `{ conteudo, hash }` ou 409 |
| `GET /api/eventos` | | SSE |

**Erros** (`src/server/erros.ts`, um `app.onError`): corpo sempre `{ erro, codigo }` em pt-BR.
- 404: `PromptNaoEncontradoError`, `VersaoNaoEncontradaError`, `ColecaoNaoEncontradaError`.
- 400: validação do zod (mensagem em pt-BR), `ColecaoInvalidaError`.
- 409 `ColecaoJaExisteError`.
- **409 de conflito** (`ConflitoError`): `{ erro, codigo: 'conflito', atual: Prompt, diff: Change[] }`, com `diff = diffLines(corpo enviado, atual.corpo)` (o corpo do pedido; sem corpo no pedido, diff vazio). Mesma forma para `DiretrizesConflitoError` (`atual: { conteudo, hash }`).
- 500 para o resto, com log no console.

**Proteção do loopback** (complementa a decisão 23; o M5 vai executar o `claude` a partir desta API):
- middleware que recusa (403) pedidos cujo `Host` não seja `127.0.0.1`/`localhost` nas portas 5173/5174 (barra DNS rebinding);
- nos métodos de escrita, exige `Content-Type: application/json` quando há corpo e, se houver `Origin`, que seja uma dessas origens (barra CSRF de outra página aberta no navegador).

### 6. Testes (Vitest, vault temporário de `src/core/teste/vault-temporario.ts`)
- `src/core/diretrizes.test.ts`: ausente → vazio; salvar cria; conflito com hash antigo e com `null` quando o arquivo já existe.
- `src/server/busca.test.ts`: acentos e caixa, todos os termos, pesos, filtros por Coleção (incluindo Sem coleção), Tag e Favorito.
- `src/server/indice.test.ts`: mudanças `criados/alterados/removidos`, evento só quando muda, single-flight.
- `src/server/app.test.ts` com `app.request()`: cada rota no caso feliz; 404, 400 e 409 (conflito com `atual` e `diff`); `copia` sem frontmatter; restaurar; Host e Origin recusados; `.md` sem id criado no disco aparece com id depois de `indice.atualizar()`.
- `src/server/observador.test.ts`: escrever um `.md` no vault temporário e esperar (`vi.waitFor`) o evento `acervo`; editar `_Diretrizes.md` gera `diretrizes`; nada em `.versoes/` dispara releitura.

### 7. Documentação
- `DECISIONS.md`, seção "M3, API do servidor": rotas REST e forma dos erros; índice relido inteiro com single-flight e diff por hash; watcher `chokidar` ignorando dotfiles, debounce 150 ms, `mkdir Prompts/` na partida; eventos SSE `acervo`/`diretrizes`; formato do 409 (diff do corpo enviado contra o disco); Diretrizes com `baseHash` e sem Versões; listagem sem corpo e cópia como `text/plain`; checagem de `Host`/`Origin`/`Content-Type`; `zod` + `@hono/zod-validator`; `normalizar` movido para o núcleo.
- `GLOSSARY.md` não muda (sem termo novo de domínio).

## Fora do escopo
- Interface (M4), Análise e `.analises/` (M5), `npm start` como serviço (M6).
- Versões das Diretrizes.

## Arquivos
- Novos: `src/core/diretrizes.ts`, `src/core/texto.ts`, `src/server/{app,indice,busca,observador,eventos,erros}.ts`, `src/server/rotas/{prompts,colecoes,tags,versoes,diretrizes}.ts` e os testes.
- Alterados: `src/server/main.ts`, `src/core/{tipos,config,erros,index}.ts`, `skills/save/similaridade.ts`, `package.json`, `DECISIONS.md`.

## Verificação
1. `npm run typecheck`, `npm run lint`, `npm test`.
2. `PROMPT_LIBRARY_VAULT=<tmp> npm run dev` e, com `curl`:
   - `curl -N 127.0.0.1:5174/api/eventos` num terminal; noutro, `echo 'oi' > <tmp>/Prompts/Teste.md` → evento `acervo` e o arquivo ganha `id`;
   - `GET /api/prompts?q=oi`, `GET /api/prompts/<id>/copia`;
   - `PUT` com o `hash` atual (200, nova Versão em `.versoes/<id>/`), editar o arquivo com `echo >>` e repetir o `PUT` com o hash antigo → 409 com `atual` e `diff`;
   - o mesmo pela porta 5173 (proxy do Vite);
   - `curl -H 'Host: evil.com' ...` → 403; `curl <ip-da-rede>:5174` → conexão recusada.
3. Commit na branch `feat/milestone-03-api-do-servidor` só quando você pedir.

## Encerramento das pendências

Decidido em 2026-11-04, no encerramento da etapa.

| Pendência | Origem | Destino | Motivo |
|---|---|---|---|
| Interface (M4) | Fora do escopo | Próxima etapa | É o M4 do roadmap, a etapa seguinte, que consome esta API |
| Análise e `.analises/` (M5) | Fora do escopo | Próxima etapa | Já planejada no roadmap como M5 |
| `npm start` como serviço (M6) | Fora do escopo | Próxima etapa | Já prevista no M6 (Acabamento) do roadmap |
| Versões das Diretrizes | Fora do escopo | Descartar | Fora do roadmap; o `baseHash` evita perda e o histórico fica com o git do vault |
