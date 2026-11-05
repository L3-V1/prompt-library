---
titulo: "M6: Acabamento"
data: 2026-11-05
status: implementado
tipo: milestone
numero: "06"
pai: roadmaps/roadmap-01
triagem: ok
branch: feat/milestone-06-acabamento
encerrado_em: 2026-11-05
---

# M6: Acabamento

## Contexto

O M5 fechou a Análise. O app funciona em dev, mas ainda não dá para usá-lo no dia a dia sem terminal aberto:
- `npm start` só roda `node dist/server/main.js`, não faz o build, e o `serveStatic({ root: './dist/web' })` de `src/server/main.ts` depende do cwd;
- não há README;
- a decisão 43 (`Prompts/.analises/` no `.gitignore` do vault) ficou para o M6;
- a revisão com `ui-ux-kit:ui-guidelines` (adiada desde o M4) e o **indicador de Análise aberta na lista** (pendência do M5, "próxima etapa") entram aqui.

Escolha desta etapa: **serviço `systemd --user` subindo no login**, sem linger.

**Pronto quando:** `npm run typecheck`, `npm run lint`, `npm test` e `npm run build` passam; `npm start` e o serviço servem o app em `http://127.0.0.1:5174` a partir de qualquer cwd; o README cobre instalação e uso; a auditoria de UI não deixa pendência aberta.

Branch: `feat/milestone-06-acabamento`.

## Passos

### 1. Produção: `npm start` e `main.ts`
- `package.json`:
  - `serve`: `NODE_ENV=production node dist/server/main.js` (o que o `start` faz hoje);
  - `start`: `npm run build && npm run serve` (o "build + servidor" do roadmap);
  - `servico:instalar` e `servico:remover`: `node scripts/servico.mjs instalar|remover`.
- `src/server/main.ts`:
  - resolver `dist/web` a partir do próprio arquivo (`fileURLToPath(new URL('../web/', import.meta.url))`), e não do cwd. Confirmar que o `serveStatic` do `@hono/node-server` 2.x aceita raiz absoluta; se não aceitar, usar caminho relativo calculado com `path.relative(process.cwd(), ...)`;
  - em produção, sem `dist/web/index.html`, sair com "Build não encontrado: rode `npm run build`";
  - `EADDRINUSE` na porta 5174 vira mensagem clara: "Porta 5174 em uso. O serviço já está rodando? (`systemctl --user stop prompt-library`)". Vale também para o `npm run dev`, que usa a mesma porta.

### 2. Serviço `systemd --user`, `scripts/servico.mjs`
Segue o padrão de `scripts/instalar-save.mjs` (idempotente, nunca apaga o que não é dele).
- Função pura `gerarUnidade({ repo, node, claude, vault? })` em `scripts/servico-unidade.mjs`, testável:
  ```ini
  # Gerado por prompt-library (npm run servico:instalar). Não edite à mão.
  [Unit]
  Description=Biblioteca de Prompts (127.0.0.1:5174)

  [Service]
  WorkingDirectory=<repo>
  Environment=NODE_ENV=production
  Environment=PATH=<dir do node>:<dir do claude>:/usr/local/bin:/usr/bin:/bin
  Environment=PROMPT_LIBRARY_CLAUDE=<claude absoluto>
  Environment=PROMPT_LIBRARY_VAULT=<só se estiver definido na instalação>
  ExecStart=<process.execPath> <repo>/dist/server/main.js
  Restart=on-failure

  [Install]
  WantedBy=default.target
  ```
  O node vem de `process.execPath` (`/opt/node-v22.14.0-linux-x64/bin/node`) e o claude de `PROMPT_LIBRARY_CLAUDE` ou da busca no `PATH` (`~/.local/bin/claude`). Sem claude encontrado, instala assim mesmo e avisa que a Análise vai falhar.
- `instalar`:
  - roda `npm run build` se faltar `dist/server/main.js`;
  - grava `~/.config/systemd/user/prompt-library.service` (respeita `XDG_CONFIG_HOME`). Arquivo igual: nada muda; arquivo com o cabeçalho "Gerado por prompt-library": regrava; arquivo de outra origem: falha sem tocar;
  - `systemctl --user daemon-reload` e `enable --now` (ou `restart`, se já ativo) e imprime a URL e o `journalctl --user -u prompt-library -f`.
- `remover`: `disable --now`, apaga a unidade (só se for nossa) e `daemon-reload`.
- Atualizar depois de mudar o código: `npm run build && systemctl --user restart prompt-library` (no README).

### 3. Indicador de Análise aberta na lista
- `src/core/analise/armazenamento.ts`: `listar(): Promise<string[]>` com os `promptId` dos `*.json` de `.analises/` (`ENOENT` → `[]`).
- `src/server/analise/servico.ts`: `listarAbertas()`; rota `GET /api/analises` → `{ ids: string[] }` (em `rotas/analise.ts` ou num `rotas/analises.ts` pequeno, montado em `app.ts`).
- `src/web/dados/analise.ts`: `useAnalisesAbertas()` com chave `['analises']`. O evento SSE `analise` atualiza o conjunto por `setQueryData` (entra com `analise`, sai com `null`); `reconectado` invalida.
- `ListaPrompts.tsx`: ícone ao lado do Favorito (o mesmo do botão Analisar), com `title`/`aria-label` "Análise em andamento". Texto em `textos.ts`.

### 4. `.gitignore` do vault (decisão 43)
- Acrescentar a `/home/levi/Documentos/vault/.gitignore`:
  ```
  # Biblioteca de Prompts: Análises em andamento (estado temporário)
  Prompts/.analises/
  ```
- Sem commit no vault: os commits lá são manuais (ADR 0003). `Prompts/.versoes/` continua versionado, nada a fazer.

### 5. README.md (pt-BR, sem travessão de ênfase)
- O que é (Biblioteca, Captura pelo `/save`, Análise) e os termos do `GLOSSARY.md`.
- Requisitos: Node ≥ 22; Claude Code (para o `/save` e a Análise).
- Instalação: `npm ci`, `npm run save:install`, `npm run servico:instalar` (ou `npm start`); remover.
- Variáveis: `PROMPT_LIBRARY_VAULT`, `PROMPT_LIBRARY_CLAUDE`, `CLAUDE_CONFIG_DIR` (só no `save:install`), `XDG_CONFIG_HOME`.
- O que o app grava no vault: `Prompts/`, `_Diretrizes.md`, `.versoes/`, `.analises/`, `.trash/`, e o trecho do `.gitignore`.
- Desenvolvimento: `npm run dev` (5173 → 5174; parar o serviço antes), `test`, `lint`, `typecheck`, `build`; logs do serviço.
- Segurança: só `127.0.0.1`, sem autenticação (decisões 23 e 71).
- Links para `DECISIONS.md`, `GLOSSARY.md`, `docs/adr/`.

### 6. Revisão de UI com `ui-ux-kit:ui-guidelines`
- Rodar a skill sobre `src/web/` (inclui o indicador novo), corrigir cada achado e reauditar.
- Conferir no navegador (skill `run` + Playwright): claro e escuro, largura ≥ 1280 e < 1024 px (gavetas do Versões e da Análise), estados vazios, modais, toasts.
- Achados que mudem comportamento ou padrão visual viram decisão.

### 7. Testes (Vitest)
- `armazenamento.test.ts`: `listar` com pasta ausente, com JSONs e ignorando o que não é `.json`.
- `app.test.ts`: `GET /api/analises`.
- `eventos.test.ts`: o conjunto de abertas entra e sai com o evento `analise`.
- `scripts/servico.test.ts`: `gerarUnidade` com e sem `vault` e o `PATH` montado (incluir `scripts/` no `vitest.config.ts` se preciso).

### 8. Documentação e encerramento
- `DECISIONS.md`, seção "M6, acabamento" (a partir da 101): `start` = build + `serve`; `dist/web` resolvido pelo arquivo; serviço `systemd --user` sem linger, com caminhos absolutos e cabeçalho de posse; indicador de Análise aberta (`GET /api/analises`); a decisão 43 aplicada; as decisões da revisão de UI.
- Roadmap: marcar o M6 e o roadmap como concluídos no encerramento.

## Fora do escopo
- Linger (`loginctl enable-linger`).
- Variáveis `{{...}}` (pós-MVP, decisão 28), `stream-json`, arrastar entre Coleções e excluir Coleção (planos avulsos).

## Arquivos
- **Novos:** `README.md`, `scripts/servico.mjs`, `scripts/servico-unidade.mjs`, `scripts/servico.test.ts`.
- **Alterados:** `package.json`, `src/server/main.ts`, `src/core/analise/armazenamento.ts`, `src/server/analise/servico.ts`, `src/server/rotas/analise.ts`, `src/server/app.ts`, `src/web/dados/{analise,eventos}.ts`, `src/web/componentes/ListaPrompts.tsx`, `src/web/textos.ts`, os componentes apontados pela auditoria, testes, `DECISIONS.md`; fora do repo, `/home/levi/Documentos/vault/.gitignore`.

## Verificação
1. `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.
2. `cd /tmp && PROMPT_LIBRARY_VAULT=<tmp> npm --prefix <repo> start` → o app abre em `http://127.0.0.1:5174` (prova que não depende do cwd). Com outro processo na 5174 → a mensagem de porta em uso.
3. `PROMPT_LIBRARY_VAULT=<tmp> npm run servico:instalar` → `systemctl --user status prompt-library` ativo; abrir o app; rodar uma Análise real (prova que o `claude` é achado sob o systemd); `journalctl --user -u prompt-library`. Rodar de novo → "nada mudou". `npm run servico:remover` → unidade some. Depois instalar de vez sem `PROMPT_LIBRARY_VAULT` (vault real).
4. Playwright: iniciar uma Análise → o ícone aparece na lista; descartar → some; idem em outra aba via SSE.
5. `git -C ~/Documentos/vault check-ignore Prompts/.analises/x.json` confirma o ignore.
6. `curl http://<IP da rede local>:5174` falha (só loopback).
7. Commit na branch `feat/milestone-06-acabamento` só quando você pedir.

## Encerramento das pendências

Decidido em 2026-11-05, no encerramento da etapa.

| Pendência | Origem | Destino | Motivo |
|---|---|---|---|
| Linger (`loginctl enable-linger`) | Fora do escopo | Descartar | O app só é usado com a sessão aberta (decisão 103) |
| Variáveis `{{...}}` (decisão 28) | Fora do escopo | Plano avulso | Maior funcionalidade pós-MVP; cabe num plano próprio |
| Progresso com `stream-json` | Fora do escopo | Plano avulso | Mantém o destino do M5: melhoria sem urgência |
| Arrastar entre Coleções e excluir Coleção | Fora do escopo | Plano avulso | Excluir Coleção exige decidir o destino dos Prompts dela |
