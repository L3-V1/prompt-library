---
titulo: "M5: Análise (Aprimoramento assistido)"
data: 2026-11-04
status: aprovado
tipo: milestone
numero: "05"
pai: roadmaps/roadmap-01
triagem: ok
---

# M5: Análise (Aprimoramento assistido)

## Contexto

O M4 entregou o MVP sem IA:
- três painéis, editor CodeMirror com `{ base, rascunho }` (`src/web/edicao.ts`);
- `ModalConflito`, Versões e Diretrizes;
- SSE invalidando o TanStack Query.

A API (`criarApp(deps)`, `src/server/app.ts`) já protege o loopback (decisão 71), pensando justamente no M5. A investigação do M0 fixou a chamada do `claude -p` (decisão 41).

O M5 entrega a Análise. O Claude lê as Diretrizes, a Instrução opcional e o Prompt e propõe Sugestões `{ justificativa, trechoOriginal, trechoNovo }`. O usuário aceita, rejeita ou regenera cada uma (decisões 13 e 14), pode editar o Rascunho à mão (17), e as Sugestões afetadas viram desatualizadas (16). Tudo fica persistido em `.analises/<id>.json` (18), e concluir gera uma única Versão `analise` (15).

Escolhas desta etapa:
- **o Rascunho é editado no editor principal**, e o painel lateral só tem as Sugestões;
- **o progresso mostra só a fase** (`--output-format json`, sem stream).

**Pronto quando:** `npm run typecheck`, `npm run lint`, `npm test` e `npm run build` passam, e o roteiro de verificação funciona com o `claude` real.

## Modelo

```ts
type StatusSugestao = 'pendente' | 'aceita' | 'rejeitada' | 'desatualizada';
interface Sugestao {
  id: string;                 // nanoid, gerado pelo servidor
  justificativa: string;
  trechoOriginal: string;     // não vazio
  trechoNovo: string;
  status: StatusSugestao;
  inicio: number | null;      // pista de offset no Rascunho; null se desatualizada
}
interface Analise {
  promptId: string;
  baseHash: string;           // hash do Prompt quando a Análise começou
  corpoOriginal: string;
  rascunho: string;
  instrucao: string;
  modelo: string | null;      // null = padrão do Claude Code (decisão 21)
  sugestoes: Sugestao[];
  execucao: { tipo: 'analise' | 'sugestao'; sugestaoId?: string; iniciadaEm: string } | null;
  erro: string | null;
  ultimaExecucao?: { custoUsd: number; duracaoMs: number; modelo: string };
  criadaEm: string; atualizadaEm: string;
}
```
- A Análise vale só para o **corpo**. Título, Tags, Favorito e Coleção não entram nela.
- `aceita` e `rejeitada` são decisões gravadas. `pendente` e `desatualizada` saem do Rascunho e são recalculadas a cada mudança, então desfazer uma edição faz a Sugestão voltar a pendente.

## Passos

### 1. Regras puras, `src/core/analise/regras.ts` (sem Node)
Usam o `id()` existente de `src/core/ids.ts`.
- `localizar(rascunho, trecho, pista)`: devolve `rascunho.slice(pista, pista + len) === trecho ? pista : ocorrência mais próxima da pista : null`. É a "busca exata com offsets como pista" do roadmap.
- `recalcular(analise, novoRascunho, edicao?)`:
  - para cada Sugestão `pendente` ou `desatualizada`, desloca a `inicio` pela edição `{ pos, removidos, inseridos }` e roda `localizar`. Encontrou → `pendente`; senão → `desatualizada`;
  - sem `edicao` (vem do PUT do Rascunho), ela é inferida pelo prefixo e sufixo comuns entre o Rascunho antigo e o novo.
- `aceitar(analise, sid)`:
  - só aceita Sugestão `pendente`, senão lança `SugestaoIndisponivelError`;
  - troca o trecho em `inicio`, marca `aceita` e chama `recalcular` com a edição conhecida. Uma Sugestão sobreposta perde o trecho e vira desatualizada (decisão 16).
- `rejeitar(analise, sid)`: vale para `pendente` ou `desatualizada`. A desatualizada não pode ser aceita, mas pode ser dispensada.
- `incorporar(analise, geradas, alvo)`:
  - `alvo = 'tudo'` mantém as `aceita` (histórico) e troca o resto;
  - `alvo = sid` troca aquela Sugestão na mesma posição da lista;
  - Sugestões geradas cujo trecho não existe no Rascunho são descartadas, e o total descartado é devolvido para o aviso.

### 2. Persistência, `src/core/analise/armazenamento.ts`
- `Pastas.analises = Prompts/.analises` (em `config.ts`). O arquivo é `<promptId>.json`, gravado com `gravarAtomico` e lido com validação zod.
- Operações: `ler`, `gravar`, `apagar`. Um JSON ilegível vira erro claro e o arquivo nunca é sobrescrito sem aviso.
- O watcher já ignora segmentos com `.` (decisão 67), então nada muda nele.
- Exportar pelo `src/core/index.ts`.

### 3. Execução do Claude, `src/server/analise/`
- `claude.ts` é o adaptador injetável `ExecutorClaude = (p: { prompt, modelo, cwd, sinal, timeoutMs }) => Promise<{ saida: unknown, custoUsd, duracaoMs, modelo }>`.
- A implementação real `criarExecutorClaude({ binario })` faz `spawn` com as flags da decisão 41:
  - stdin `ignore`, cwd `Prompts/` e `--model` só quando houver;
  - `--json-schema` a partir de `z.toJSONSchema` do esquema `{ sugestoes: [{ justificativa, trechoOriginal (min 1), trechoNovo }] }`.
- Lê o envelope e valida `structured_output` com zod. Erros traduzidos para pt-BR:
  - `ENOENT` → "Claude Code não encontrado (instale ou defina `PROMPT_LIBRARY_CLAUDE`)";
  - timeout → SIGTERM e, depois de 5 s, SIGKILL;
  - código ≠ 0, JSON inválido, `is_error` ou `subtype ≠ success` → mensagem com o `result` ou o fim do stderr;
  - saída fora do schema.
- `binario` vem de `PROMPT_LIBRARY_CLAUDE` (padrão `claude`). O timeout é de 300 s.
- Um prompt com mais de 100 KB falha antes do spawn, porque o Linux limita um único argumento a 128 KiB.
- `prompt.ts` traz `montarPrompt({ diretrizes, instrucao, titulo, caminho, rascunho, rejeitadas, alvo? })`:
  - papel e tarefa; Diretrizes (ou "sem Diretrizes"); Instrução; o Prompt entre delimitadores; o caminho dele em `Prompts/`, para o Claude consultar outros Prompts (decisão 20);
  - regras: o `trechoOriginal` é copiado literalmente e é o menor possível; as Sugestões não se sobrepõem; justificativa em pt-BR; não mudar o idioma do Prompt;
  - as Sugestões rejeitadas, para não serem repetidas;
  - em `alvo` (regenerar uma), a Sugestão antiga e o pedido de exatamente uma substituta.
- `servico.ts` traz `criarServicoAnalise({ acervo, diretrizes, armazenamento, eventos, executor, pastas })`:
  - uma fila por `promptId` (cadeia de promises) serializa as escritas de rotas e jobs;
  - `Map` dos jobs em andamento com `AbortController`;
  - `iniciar(id, { instrucao, modelo })` cria a Análise (Rascunho = corpo, `baseHash` = hash) e dispara o job. Devolve a Análise com `execucao` preenchida (202). Se já existir uma, responde 409 `analise_existente`;
  - `regenerar(id, opcoes)` (tudo) e `regenerarSugestao(id, sid)` disparam jobs. Com outro job rodando, 409 `analise_em_execucao`;
  - o job termina com `incorporar` + gravar + evento, ou com `erro` preenchido + evento. Um job que termina depois de descartado ou cancelado é ignorado;
  - `aceitar`, `rejeitar` e `salvarRascunho(texto)` aplicam as regras, gravam e emitem;
  - `cancelar(id)` aborta o job e limpa `execucao`;
  - `concluir(id)`:
    - recusado com job rodando;
    - chama `acervo.salvar(id, { corpo: rascunho }, baseHash, 'analise')`, apaga o JSON e emite;
    - o conflito sobe como `ConflitoError`, para o `comDiffNoConflito` existente;
    - `concluir(id, { baseHash })` permite sobrescrever;
  - `descartar(id)` aborta o job e apaga o JSON;
  - `ler(id)`: uma `execucao` gravada sem job no `Map` é de antes de um reinício, então vira `erro: 'A execução foi interrompida (servidor reiniciado).'`.
- Novo evento SSE `analise`: `{ promptId, analise: Analise | null }` em `eventos.ts`/`rotas/eventos.ts`.

### 4. Rotas, `src/server/rotas/analise.ts` (montada em `/api/prompts`)
- `GET /:id/analise` → `Analise | null`.
- `POST /:id/analise { instrucao?, modelo? }` → 202.
- `POST /:id/analise/regenerar { instrucao?, modelo? }` → 202.
- `POST /:id/analise/sugestoes/:sid/{aceitar,rejeitar,regenerar}`.
- `PUT /:id/analise/rascunho { rascunho }`.
- `POST /:id/analise/cancelar`.
- `POST /:id/analise/concluir { baseHash? }` → Prompt. O conflito vira 409 com `atual` e `diff(rascunho, disco)`.
- `DELETE /:id/analise` → 204.
- `modelo`: `z.enum(['opus','sonnet','haiku']).nullable()`. Os erros novos (`AnaliseNaoEncontradaError` 404, `SugestaoIndisponivelError` e os de execução 409) entram em `tratarErro`.
- `DELETE /api/prompts/:id` passa a apagar a Análise junto.
- `Deps` ganha `analises: ServicoAnalise`. Em `main.ts`, entra o executor real.

### 5. Interface (`src/web/`)
- `dados/analise.ts`:
  - chave `['analise', id]`, `useAnalise(id)` e as mutações, que gravam no cache a Análise devolvida;
  - o `eventos.ts` passa a ouvir `analise` e faz `setQueryData`; o `chavesParaInvalidar` ganha o caso.
- `PainelPrompt` ganha o botão **Analisar** (ícone novo), que fica desabilitado com alterações não salvas ("salve ou descarte antes"). Quando há Análise:
  - o editor principal mostra o Rascunho (`documento = id + ':analise'`), e as edições vão por `PUT .../rascunho` com debounce de 400 ms;
  - antes de aceitar, rejeitar, regenerar ou concluir, o envio pendente é feito (`flush`);
  - Ctrl+S faz o mesmo flush e mostra "Rascunho salvo", sem criar Versão;
  - título, Tags, Versões/restaurar e Salvar ficam travados;
  - uma faixa diz "Análise em andamento". Se o hash do Prompt no disco ficar diferente do `baseHash`, a faixa avisa que o Prompt mudou fora;
  - o `registrarProtecao` não é preciso: o Rascunho é persistido. Só o flush antes de trocar de Prompt.
- `PainelAnalise.tsx` é o painel lateral à direita do editor (~380 px; abaixo de 1024 px vira gaveta sobre o editor, como `PainelVersoes`):
  - **sem Análise:** campo Instrução, seletor de modelo ("Padrão do Claude Code", Opus, Sonnet e Haiku, com o último escolhido no `localStorage`) e o botão Iniciar;
  - **gerando:** "Gerando Sugestões…", o tempo decorrido e Cancelar;
  - **erro:** a mensagem e Tentar de novo;
  - **lista:** os cards (`CartaoSugestao.tsx`), com a contagem por status, o custo e a duração da última execução, Regenerar tudo (reabre Instrução e modelo), **Concluir** e **Descartar**. Os dois pedem confirmação: Concluir avisa as pendentes que serão ignoradas, e Descartar avisa que perde o Rascunho.
- `CartaoSugestao`:
  - justificativa e mini-diff por palavra (`diffWords` do `diff`, já no bundle);
  - os botões Aceitar, Rejeitar e Regenerar, conforme o status (desatualizada mostra o selo e só Regenerar/Rejeitar);
  - aceitas e rejeitadas ficam recolhidas;
  - passar o mouse ou focar o card destaca o trecho no editor e rola até ele. O `Editor` ganha a prop `destaque?: { inicio, fim }`, com uma decoration do CodeMirror.
- O conflito ao concluir reaproveita o `ModalConflito`. "Recarregar" vira "Cancelar", com o `onRecarregar` opcional, e "Sobrescrever" conclui com o hash do disco.
- Os toasts de sucesso e erro cobrem toda ação. Textos em pt-BR, sem travessão de ênfase.
- Puro e testado em `src/web/analise-ui.ts`: `miniDiff(trechoOriginal, trechoNovo)` e `resumoStatus(sugestoes)`.

### 6. Testes (Vitest)
- `src/core/analise/regras.test.ts`:
  - localizar com pista exata, com várias ocorrências (pega a mais próxima) e sem ocorrência;
  - aceitar desloca as outras; a sobreposta fica desatualizada;
  - edição manual dentro do trecho → desatualizada; edição antes do trecho → só desloca; desfazer → volta a pendente;
  - rejeitar uma desatualizada; aceitar uma desatualizada lança;
  - incorporar tudo ou uma só, descartando os trechos inexistentes.
- `armazenamento.test.ts`, com vault temporário: ida e volta, JSON inválido e apagar.
- `prompt.test.ts`: as Diretrizes, a Instrução, as rejeitadas e o alvo aparecem no texto; sem Diretrizes.
- `claude.test.ts`: o executor real com binários falsos (scripts `node` em `src/server/analise/fixtures/`), cobrindo sucesso, `is_error`, saída fora do schema, código ≠ 0, timeout (com o abort matando o processo) e `ENOENT`. Também confere as flags passadas, ecoadas por um dos falsos.
- `servico.test.ts`, com executor mockado: iniciar → evento com `execucao` → pronta; erro; 409 com job em andamento; cancelar; descartar durante o job (o resultado é ignorado); interrompida depois de "reinício" (um serviço novo sobre o mesmo vault); concluir cria exatamente uma Versão `analise` e apaga o JSON; conflito ao concluir.
- `app.test.ts`: as rotas novas (202, 404, 409, 400 do modelo inválido) e o evento SSE.
- `src/web/analise-ui.test.ts` e os casos novos em `eventos.test.ts`.

### 7. Documentação
- `DECISIONS.md`, seção "M5, Análise" (a partir da 88):
  - a Análise vale só para o corpo;
  - o modelo e os status derivados contra os gravados;
  - a localização por busca exata com pista e a regra de desatualizada (inclusive a volta a pendente);
  - Sugestões geradas sem trecho no Rascunho são descartadas;
  - pastas em pt-BR (`analise/`, e não `analysis/` como no roadmap, decisão 44);
  - `PROMPT_LIBRARY_CLAUDE`, o timeout de 300 s e o limite de 100 KB;
  - a fila por Prompt e a execução interrompida no reinício;
  - o evento SSE `analise`;
  - o Rascunho no editor principal, com título e Tags travados e início bloqueado com pendências;
  - o progresso só da fase;
  - concluir com conflito e sobrescrever;
  - rejeitadas enviadas ao regenerar;
  - excluir o Prompt apaga a Análise.
- `GLOSSARY.md` não muda.

## Fora do escopo
- Progresso com `stream-json`.
- Indicador na lista de Prompts com Análise aberta.
- Análise de título e Tags.
- Mais de uma Análise por Prompt.
- `npm start` como serviço, README e `.gitignore` do vault (M6).

## Arquivos
- **Novos:**
  - `src/core/analise/{regras,armazenamento}.ts` (+ testes);
  - `src/server/analise/{claude,prompt,servico}.ts` (+ testes e `fixtures/`);
  - `src/server/rotas/analise.ts`;
  - `src/web/dados/analise.ts`, `src/web/analise-ui.ts` (+ teste);
  - `src/web/componentes/{PainelAnalise,CartaoSugestao}.tsx`.
- **Alterados:**
  - núcleo: `src/core/{tipos,config,index,erros}.ts`;
  - servidor: `src/server/{app,deps,eventos,erros,main}.ts`, `src/server/rotas/{eventos,prompts}.ts`, `src/server/app.test.ts`;
  - interface: `src/web/componentes/{PainelPrompt,Editor,ModalConflito,Icone}.tsx`, `src/web/dados/{eventos,cliente}.ts`, `src/web/textos.ts`;
  - `DECISIONS.md`.

## Verificação
1. `npm run typecheck`, `npm run lint`, `npm test` e `npm run build`.
2. `PROMPT_LIBRARY_VAULT=<tmp> npm run dev`, com a skill `run` + Playwright em `http://127.0.0.1:5173`, usando o `claude` real (sonnet, para ser rápido):
   - criar `_Diretrizes.md` e um Prompt com alguns parágrafos;
   - Analisar com a Instrução "foque em concisão" → "Gerando…" → os cards aparecem;
   - aceitar uma Sugestão → o Rascunho muda no editor e uma sobreposta (se houver) fica desatualizada;
   - editar à mão o trecho de outra → ela fica desatualizada; desfazer → volta a pendente;
   - regenerar uma Sugestão e regenerar tudo;
   - recarregar a página no meio → a Análise continua igual (`.analises/<id>.json`);
   - reiniciar o servidor durante um "Gerando…" → aparece o erro "interrompida" e Tentar de novo funciona;
   - concluir → exatamente um arquivo novo `*-analise.md` em `<tmp>/Prompts/.versoes/<id>/` e o JSON apagado;
   - repetir, editando o `.md` fora antes de concluir → modal de conflito → Sobrescrever;
   - descartar → o JSON some e o Prompt fica intacto;
   - `PROMPT_LIBRARY_CLAUDE=/nao/existe` → mensagem "Claude Code não encontrado".
3. Conferir no `ps` que o processo `claude` morre ao Cancelar.
4. `npm run build && npm start` → o mesmo fluxo em `http://127.0.0.1:5174`.
5. Commit na branch `feat/milestone-05-analise` só quando você pedir.
