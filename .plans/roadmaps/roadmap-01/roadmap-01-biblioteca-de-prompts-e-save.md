---
titulo: Roadmap da Biblioteca de Prompts e do comando /save
data: 2026-11-04
status: implementado
tipo: roadmap
numero: "01"
triagem: ok
encerrado_em: 2026-11-05
---

# Roadmap: Biblioteca de Prompts + comando `/save`

## Contexto

O projeto `prompt-library` hoje só tem a documentação: `DECISIONS.md` (39 decisões), `GLOSSARY.md` e 3 ADRs em `docs/adr/`. Ainda não há código e nem repositório git. O objetivo é um app pessoal (TypeScript: servidor Node e React com Vite) que guarda Prompts como `.md` em `/home/levi/Documentos/vault/Prompts/`, com Versões, uma Análise assistida pelo `claude -p` e uma skill global `/save` para fazer a Captura de prompts digitados no Claude Code.

O roadmap está dividido em marcos que entregam algo usável. A ordem segue as dependências: o **módulo de armazenamento** (núcleo) vem primeiro, porque o servidor e o `/save` dependem dele (decisão 30). O `/save` vem logo depois porque já é útil sem a interface e começa a alimentar o acervo.

Ambiente verificado: Node v22.14, Claude Code 2.1.318, a pasta `Prompts/` ainda não existe no vault e os transcripts ficam em `~/.claude/projects/<cwd-slug>/<sessionId>.jsonl`, uma linha JSON por evento com `type`, `message.content`, `sessionId`, `cwd` e `timestamp`.

---

## M0: Fundação e investigações (spikes)

- `git init`, `package.json` único, TypeScript estrito, ESLint/Prettier, Vitest.
- Estrutura do repositório:
  - `src/core/`: armazenamento, sem dependência de HTTP
  - `src/server/`: API
  - `src/web/`: React + Vite
  - `skills/save/`: skill e script da Captura
- Decidir o servidor HTTP leve (sugestão: **Hono** com `@hono/node-server`). No desenvolvimento, Vite com proxy para a API; em produção, o servidor entrega o build estático.
- **Investigação 1 (pendência em aberto):** colar um texto grande numa sessão e verificar no `.jsonl` se o conteúdo integral aparece ou só `[Pasted text #N]`. Se só aparecer o marcador, procurar onde o Claude Code guarda o conteúdo colado (por exemplo, `~/.claude/paste-cache` ou o campo `pastedContents` no history). O resultado define a M2.
- **Investigação 2:** confirmar as flags do `claude -p` para saída estruturada (`--output-format json`, `--json-schema` se existir, `--model`, `--allowedTools "Read Glob Grep"`, `--add-dir`/cwd na pasta de Prompts, `--permission-mode`) e medir a latência.
- **Pendência em aberto:** decidir se `.versoes/` e `.analises/` entram no `.gitignore` do vault. Recomendação: versionar `.versoes/` (é histórico de valor) e ignorar `.analises/` (é estado transitório).

**Pronto quando:** `npm test` e `npm run dev` rodam vazios e as duas investigações estão registradas em `DECISIONS.md`.

## M1: Núcleo de armazenamento (`src/core/`)

- Ler a pasta `Prompts/` (raiz do vault configurável por env, com o padrão do vault real). Os testes usam um vault temporário.
- Modelo: `Prompt { id, título, tags, favorito, coleção (derivada da subpasta), corpo, caminho, mtime/hash, origem? }`.
- Regras:
  - ignorar arquivos com prefixo `_` e as pastas ocultas (decisão 5);
  - atribuir um `id` estável (ULID/nanoid) aos `.md` sem `id`, regravando só o frontmatter (decisão 6);
  - preservar os campos de frontmatter desconhecidos (`gray-matter` ou `yaml` com round-trip cuidadoso).
- Operações: listar, ler, criar, salvar (gravação atômica: tmp + rename), mover de Coleção (mover o arquivo), favoritar, excluir para `.trash/` do vault (decisão 11) e criar ou renomear Coleção (pasta).
- **Versões** (decisões 7 e 8): `Prompts/.versoes/<id>/<timestamp>.md` com o snapshot completo e metadados (motivo: manual, análise, captura ou restauração). Listar, ler, diff (`diff` / `jsdiff`) e restaurar (restaurar cria uma nova Versão).
- **Detecção de conflito** (decisão 10): `save(id, conteúdo, baseHash)` falha com `ConflictError` quando o hash no disco é diferente.
- Testes unitários cobrindo cada regra acima.

## M2: Skill `/save` (Captura)

- `skills/save/SKILL.md` com `disable-model-invocation: true` (decisão 31), instalada por `ln -s` em `~/.claude/skills/save` (decisão 30), com script de instalação no `package.json`.
- Script `skills/save/capture.ts` (rodado via `tsx` ou compilado), que importa `src/core`:
  - `extract`: localiza o transcript da sessão atual (pelo `sessionId`/cwd; definir no M0 como a skill obtém o id da sessão, por exemplo variável de ambiente ou o `.jsonl` mais recente do cwd). Retorna a N-ésima mensagem digitada pelo usuário, ignorando slash commands, mensagens `isMeta` e tool results (decisão 33). Retorna também a presença de imagens (decisão 39) e a Origem (decisão 38).
  - `context`: lista as Coleções e Tags existentes e os Prompts parecidos (similaridade simples: Jaccard de tokens ou trigramas).
  - `write`: grava um Prompt novo ou uma nova Versão de um existente, com o texto literal (decisões 34 e 37).
- Fluxo da skill: o Claude roda `extract` e `context`, propõe título, Coleção e Tags e, se houver Prompt parecido, pergunta se o texto vira Versão dele ou Prompt novo (decisões 35 e 36). Depois chama `write`. O texto nunca passa pela transcrição do Claude: o script o guarda num arquivo temporário referenciado por id (decisão 32).
- Testes com fixtures de `.jsonl` reais (anonimizados): slash commands, `[Pasted text]`, imagens e `/save 3`.

**Marco utilizável:** a partir daqui já dá para capturar prompts no dia a dia.

## M3: API do servidor (`src/server/`)

- Hono em `127.0.0.1` apenas (decisão 23), sem autenticação.
- Rotas REST sobre o núcleo:
  - Prompts: CRUD, mover, favoritar e copiar (corpo sem frontmatter, decisão 25);
  - Coleções e Tags (agregadas);
  - busca textual (em memória sobre o índice; o acervo é pequeno);
  - Versões: listar, diff e restaurar;
  - Diretrizes: ler e salvar `_Diretrizes.md`.
- Índice em memória atualizado por um *watcher* (`chokidar`) para refletir edições feitas no Obsidian. O frontend recebe os avisos por SSE.
- Conflito ao salvar responde 409, com o conteúdo do disco e o diff.

## M4: Interface base (`src/web/`)

- Vite + React + TanStack Query, tema inspirado no Claude (tons terracota/creme) com claro e escuro seguindo o sistema e alternância manual. Textos em pt-BR (decisão 27).
- Layout de três painéis (decisão 26):
  - painel 1: Coleções, Tags e Favoritos;
  - painel 2: lista com busca;
  - painel 3: Prompt.
- Editor CodeMirror 6 com Markdown (decisão 24), Ctrl+S salva e cria Versão, e confirmação ao sair com alterações pendentes (decisão 9).
- Modal de conflito: recarregar, sobrescrever ou ver o diff (decisão 10).
- Edição de título, Tags, Coleção e Favorito, e exclusão com confirmação.
- Botão Copiar e paleta **Ctrl+K** (busca, Enter copia) (decisão 25).
- Painel de Versões: lista, diff lado a lado e restaurar.
- Editor das Diretrizes.

**Marco utilizável:** MVP sem IA.

## M5: Análise (Aprimoramento assistido)

- **Backend:**
  - módulo `src/server/analysis/` que monta o prompt com as Diretrizes, a Instrução opcional e o Prompt (decisão 19);
  - executa `claude -p` com o modelo escolhido (decisão 21), somente leitura na pasta `Prompts/` (decisão 20) e saída JSON validada por schema (zod);
  - formato da Sugestão: `{ id, justificativa, trechoOriginal, trechoNovo }`.
- **Persistência** em `Prompts/.analises/<id>.json` (decisão 18): Rascunho, Sugestões e status (pendente, aceita, rejeitada ou desatualizada).
- **Regras:**
  - aceitar aplica o `trechoNovo` ao Rascunho;
  - uma Sugestão cujo `trechoOriginal` deixou de existir no Rascunho vira **desatualizada** (decisões 16 e 17). Isso vale tanto para Sugestões aceitas quanto para edição manual. A localização é por busca exata do trecho, com offsets como pista;
  - regenerar uma Sugestão ou a Análise inteira (decisão 14);
  - concluir gera uma única Versão (decisão 15); descartar apaga o `.analises/<id>.json`.
- Execução assíncrona: `POST` inicia a Análise e o progresso chega por SSE. Tratar timeout, erro e `claude` ausente.
- **Frontend:** painel lateral da Análise (decisão 26) com campo de Instrução e seletor de modelo. Cada card de Sugestão mostra a justificativa e um mini-diff, com os botões aceitar, rejeitar e regenerar. O Rascunho continua editável e há os botões concluir e descartar.
- Testes da lógica de aplicar e marcar como desatualizada (puros, em `src/core` ou `analysis/`). Para o `claude -p`, um adaptador injetável e mockado nos testes.

## M6: Acabamento

- Script `npm start` (build + servidor) e, opcionalmente, um serviço `systemd --user`.
- README com instalação (link do `/save`, variáveis de ambiente) e atualização do `.gitignore` do vault conforme o M0.
- Revisão de UI com a skill `ui-ux-kit:ui-guidelines`.

## Pós-MVP (fora do escopo)

- Variáveis `{{...}}` preenchidas antes de copiar (decisão 28).

---

## Arquivos críticos

- `src/core/` (store, frontmatter, versions, conflict): base de tudo; o servidor e o `/save` o reutilizam.
- `skills/save/SKILL.md` e `skills/save/capture.ts`.
- `src/server/analysis/` (execução do claude e regras das Sugestões).
- `DECISIONS.md`: registrar ali as decisões novas (servidor HTTP, resultado das investigações, `.gitignore`).

## Verificação

- **Por marco:** `npm test` com Vitest (o núcleo e as regras da Análise com cobertura alta, usando um vault temporário em tmpdir).
- **M1/M3:** criar um `.md` sem `id` no vault de teste pelo Obsidian ou com `echo`, e confirmar que o app atribui o `id`, que a lista atualiza via watcher e que editar fora e depois salvar no app dispara o conflito (409).
- **M2:** numa sessão real do Claude Code, digitar um prompt longo (com texto colado) e rodar `/save`. Conferir byte a byte o `.md` gerado contra o texto original, a Origem no frontmatter e o fluxo de "nova Versão" com um Prompt parecido.
- **M4/M5:** usar a skill `run` + Playwright para abrir o app em `127.0.0.1`, editar, salvar com Ctrl+S, copiar via Ctrl+K e rodar uma Análise real (aceitar uma Sugestão, editar o trecho de outra até ela ficar desatualizada, concluir) e confirmar uma única Versão nova em `.versoes/<id>/`.
- Confirmar que o servidor não responde pelo IP da rede local.
