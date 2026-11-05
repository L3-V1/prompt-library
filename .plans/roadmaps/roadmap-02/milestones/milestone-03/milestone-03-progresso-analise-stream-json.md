---
titulo: "roadmap-02, M3: Progresso da Análise com stream-json"
data: 2026-11-05
status: implementado
branch: feat/milestone-03-stream-json
encerrado_em: 2026-11-05
tipo: milestone
numero: "03"
pai: roadmaps/roadmap-02
triagem: ok
---

# roadmap-02, M3: Progresso da Análise com `stream-json`

## Contexto

Hoje a Análise roda o `claude -p --output-format json` e o painel só mostra "Gerando Sugestões… N s" (decisão 97). A decisão 119 pede uma linha a mais com a ferramenta que o Claude está usando ("Lendo Code review/x.md"). Para isso o executor passa a usar `stream-json` e repassa os `tool_use` ao vivo, sem gravar nada em `.analises/`. As Sugestões continuam chegando todas juntas no fim.

Branch: `feat/milestone-03-stream-json`. Decisões novas a partir da 128.

## Investigação (feita no plan mode, 2026-11-05)

Rodei o `claude` 2.1.318 com os argumentos de hoje, trocando para `--output-format stream-json --verbose`, `--model haiku`, num diretório temporário com `Code review/x.md`. Saiu com código 0 e 18 linhas JSONL:
- `system/init`, `system/thinking_tokens`, `rate_limit_event`: ignorados.
- `assistant` com `message.content[]`: um bloco `tool_use` por linha, `{ name, input, id }`, que chega antes do `user/tool_result` correspondente. Os inputs foram `Glob {pattern}`, `Grep {pattern, output_mode, -n}` e `Read {file_path}`, com o **caminho absoluto**.
- O `--json-schema` aparece como um `tool_use` `StructuredOutput` no fim.
- Última linha: `type: "result"`, com `subtype: "success"`, `is_error`, `structured_output`, `total_cost_usd`, `duration_ms` e `modelUsage`, os mesmos campos do envelope de hoje.

Resultado: as duas condições do roadmap valem, e o marco segue. Isso vira a decisão 128.

## Mudanças

### 1. Tipo compartilhado: `src/core/tipos.ts`
`AtividadeClaude = { tipo: 'ler'; caminho: string } | { tipo: 'buscar'; termo: string } | { tipo: 'listar'; padrao: string }`, exportado pelo `core/index`, como o `StatusSugestao`, para o web importar.

### 2. Executor: `src/server/analise/claude.ts`
- `argumentosClaude`: `'stream-json'` e `--verbose`.
- `PedidoClaude` ganha `aoAtivar?: (a: AtividadeClaude) => void`.
- Função pura exportada `atividadeDe(bloco, cwd): AtividadeClaude | null`:
  - `Read`: `file_path` relativo ao `cwd` (`path.relative`). Se o caminho ficar fora (`..` ou absoluto), fica como veio;
  - `Grep`: `pattern`;
  - `Glob`: `pattern`;
  - qualquer outro (`StructuredOutput`, ferramentas desconhecidas) ou input sem o campo esperado: `null`.
- Leitura por linhas: um buffer acumula os chunks do stdout e quebra no `\n`. Cada linha completa passa pelo `JSON.parse` (linha inválida é ignorada):
  - `assistant`: cada `tool_use` → `atividadeDe` → `aoAtivar`, com `try/catch` para um erro no callback não derrubar o executor;
  - `result`: guarda o evento, validado com o `esquemaEnvelope` atual.
  - No `close`, a sobra do buffer também é processada.
- O `stdout` inteiro deixa de ser acumulado. Só o fim (2 000 caracteres, como o stderr) fica guardado, para o `detalhe()`.
- `lerEnvelope(stdout)` dá lugar ao `result` guardado. Sem `result` e com código 0: `ExecucaoClaudeError("Resposta inválida do Claude Code (sem o evento result): …")`. O resto (`is_error`/`subtype`, schema, custo, `modeloUsado`) fica igual.

### 3. Fixtures: `src/server/analise/fixtures/`
- `sucesso`, `erro`, `fora-do-schema` e `eco` passam a escrever JSONL: `system/init`, depois o `result` atual numa linha.
- `atividades.mjs` (nova): escreve `tool_use` de Glob, Grep e Read (com `path.join(process.cwd(), 'Code review/x.md')`), um `StructuredOutput`, uma linha inválida e uma linha partida em dois `write` com `setTimeout` no meio, e termina com o `result` de sucesso.
- `sem-result.mjs` (nova): só linhas `system`/`assistant`, código 0.

### 4. Testes: `claude.test.ts`
- `--output-format stream-json` e `--verbose` no teste das flags.
- Stream com `tool_use`: `aoAtivar` recebe `[listar, buscar, ler 'Code review/x.md']`, nessa ordem, sem o `StructuredOutput`, e a resposta sai como antes.
- Stream sem `tool_use` (`sucesso`): `aoAtivar` não é chamado.
- `result` faltando: erro "sem o evento result".
- Um `aoAtivar` que lança não quebra a execução.
- Testes unitários de `atividadeDe`: caminho fora do cwd, input sem campo, ferramenta desconhecida.

### 5. Serviço: `src/server/analise/servico.ts` e `src/server/eventos.ts`
- Novo evento SSE `{ tipo: 'atividade'; dados: { promptId; atividade: AtividadeClaude | null } }` em `Evento`. A rota `rotas/eventos.ts` já é genérica e não muda.
- Evento próprio, e não um campo do `analise`, porque o `analise` carrega a Análise gravada (com `atualizadaEm`, que o `guardarAnalise` usa para ordenar). A atividade é efêmera e não é gravada. Fica registrado como decisão 129.
- Em `disparar`: emite `atividade: null` ao começar e passa `aoAtivar: (a) => { if (vale()) emitirAtividade(id, a) }` ao executor. O `vale()` descarta a atividade de um job cancelado ou substituído.
- A atividade não fica guardada no servidor: quem abre a página no meio vê a linha a partir do próximo `tool_use`. É uma simplificação de "guarda só em memória" do roadmap. Se preferir que o `GET` também devolva a atividade, entra um `atividade` no `Job`.
- `servico.test.ts`: chamar `chamadas[0].pedido.aoAtivar(...)` emite o evento `atividade`; depois de `cancelar`, não emite mais; `iniciar` emite o `null` inicial.

### 6. Web
- `src/web/dados/eventos.ts`: `atividade` na união `EventoServidor`, `chavesParaInvalidar` devolve `[]` para ele, e entram o `addEventListener('atividade', …)` e, em `emitir`, a gravação no store.
- Novo `src/web/dados/atividade.ts`: um store de módulo (`Map<promptId, AtividadeClaude | null>` com ouvintes) e `useAtividade(id)` via `useSyncExternalStore`, no padrão do `copia.ts`. No `reconectado`, limpa o Map.
- `src/web/analise-ui.ts`: `textoAtividade(a)`:
  - `ler` → `Lendo Code review/x.md`;
  - `buscar` → `Buscando "termo"`;
  - `listar` → `Listando arquivos`.
  
  Testado em `analise-ui.test.ts`.
- `PainelAnalise.tsx`: no cartão do `gerando`, abaixo de "Gerando Sugestões… m:ss", uma linha `text-xs text-suave` com reticências (`truncate`, com o texto inteiro no `title`), mostrada só com atividade presente. Fica dentro do `role="status"` atual. Para o leitor de tela não anunciar cada troca, a linha leva `aria-live="off"`.
- `eventos.test.ts`: o evento `atividade` grava no store e não invalida nada.

### 7. Docs
- `DECISIONS.md`, nova seção "2026-11-05: roadmap-02, M3, progresso com `stream-json`":
  - 128: resultado da investigação, incluindo o caminho absoluto e o `StructuredOutput` ignorado;
  - 129: evento SSE `atividade` à parte, sem gravar, com `null` ao começar.
- `GLOSSARY.md` só ganha um termo se "Atividade" for usado como termo do domínio. Proposta: não, é um detalhe de UI.

## Verificação
1. `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.
2. `npm run build && systemctl --user restart prompt-library`, depois a skill `run` + Playwright: abrir um Prompt e iniciar uma Análise real (Haiku). A linha deve mudar ("Listando arquivos", "Lendo …"), as Sugestões chegar como antes e a linha sumir no fim. Conferir nos temas claro e escuro, e também o Cancelar no meio.
3. Encerramento com `/spec-kit:close-cycle` e roadmap-02 marcado como concluído.
