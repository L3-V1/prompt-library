---
titulo: "M0: Fundação e investigações (roadmap-01)"
data: 2026-11-04
status: implementado
branch: feat/milestone-00-fundacao-e-investigacoes
encerrado_em: 2026-11-04
tipo: milestone
numero: "00"
pai: roadmaps/roadmap-01
triagem: ok
---

# M0: Fundação e investigações (roadmap-01)

## Contexto

O `prompt-library` hoje só tem documentação (`DECISIONS.md` com 39 decisões, `GLOSSARY.md`, 3 ADRs). O M0 monta o esqueleto do repositório, do qual todos os marcos seguintes dependem, e fecha as pendências que definem o M2 (`/save`) e o M5 (Análise). **Pronto quando:** `npm test` e `npm run dev` rodam vazios e as investigações estão registradas em `DECISIONS.md`.

### O que já foi verificado no planejamento (somente leitura)
- `claude --help` (2.1.318) lista `--json-schema <schema>`, `--output-format`, `--model`, `--allowedTools`, `--add-dir`, `--permission-mode`, `--no-session-persistence` e `--effort`.
- O Bash de uma sessão recebe a variável **`CLAUDE_CODE_SESSION_ID`**, o que resolve "como a skill obtém o id da sessão": transcript = `~/.claude/projects/<cwd-slug>/$CLAUDE_CODE_SESSION_ID.jsonl`, com o `.jsonl` mais recente do cwd como fallback.
- `~/.claude/history.jsonl` grava `display: "[Pasted text #1 +78 lines]"` e `pastedContents: {"1": {type, contentHash}}`, sem o texto. Existe `~/.claude/paste-cache/<hash>.txt`, então o conteúdo colado provavelmente está lá, indexado pelo `contentHash`. Os transcripts antigos que tinham paste já foram limpos, então falta confirmar o que o `.jsonl` guarda.

## Passos

### 1. Repositório e tooling
- `git init` e `.gitignore` (`node_modules`, `dist`, `coverage`, `.env*`).
- Um único `package.json` (`"type": "module"`, `engines.node >=22`) com estas dependências:
  - runtime: `hono`, `@hono/node-server`, `react`, `react-dom`;
  - dev: `typescript`, `vite`, `@vitejs/plugin-react`, `vitest`, `tsx`, `concurrently`, `eslint`, `typescript-eslint`, `eslint-plugin-react-hooks`, `prettier`, `@types/node`, `@types/react`, `@types/react-dom`.
- TypeScript estrito: `tsconfig.base.json` (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `moduleResolution: bundler`) mais `tsconfig.json` com references para `node` (core/server/skills) e `web` (DOM, JSX).
- `eslint.config.js` (flat config) e `.prettierrc`.
- Scripts:
  - `dev`: `concurrently` rodando `tsx watch src/server/main.ts` e `vite`;
  - `build`: `vite build` e `tsc` do servidor;
  - `start`: `node dist/server/main.js`;
  - `test`: `vitest run --passWithNoTests`;
  - `lint`, `format`, `typecheck`.

### 2. Estrutura mínima
- `src/core/index.ts`: export vazio e um teste sanity (`src/core/index.test.ts`).
- `src/server/main.ts`: Hono em `127.0.0.1:5174` (decisão 23) com `GET /api/health` e, em produção, `serveStatic` de `dist/web`.
- `src/web/`: `index.html`, `main.tsx`, `App.tsx` (placeholder em pt-BR). Em `vite.config.ts`, `root: src/web`, `server.host: 127.0.0.1` e proxy de `/api` para `:5174`.
- `skills/save/`: só um `README.md` (placeholder) até o M2.
- `vitest.config.ts` cobrindo `src/**/*.test.ts` e `skills/**/*.test.ts`.

### 3. Investigação 1: texto colado no transcript
1. Numa sessão nova (feita por você, porque precisa de um paste real), colar um texto grande e conhecido e mandar.
2. Eu inspeciono o `.jsonl` da sessão:
   - a `message.content` da linha `type:"user"` contém o texto integral ou só `[Pasted text #N]`?
   - em `history.jsonl`, conferir o `contentHash` e se `paste-cache/<contentHash>.txt` bate byte a byte.
3. Registrar em `DECISIONS.md` como decisão 40. Se o transcript tiver o texto integral, ele é a fonte. Senão, a reconstrução usa `history.jsonl` + `paste-cache` pelo `contentHash`. Registrar também que o id da sessão vem de `CLAUDE_CODE_SESSION_ID`.

### 4. Investigação 2: `claude -p` para a Análise
- Rodar `claude -p` com `--output-format json`, `--json-schema '<schema de Sugestões>'`, `--model sonnet`, `--allowedTools "Read Glob Grep"`, `--permission-mode` (testar `plan`/`default`), `--no-session-persistence` e cwd em uma pasta temporária com `.md` de exemplo.
- Conferir o formato do envelope JSON (onde fica a saída estruturada, `is_error`, custo, duração), se o schema é respeitado e se uma tentativa de escrita é bloqueada.
- Medir a latência com `time` em 3 execuções (sonnet e haiku).
- Registrar como decisão 41: flags definitivas, formato da resposta e latência observada.

### 5. Decisões a registrar em `DECISIONS.md`
- **42:** servidor HTTP é Hono + `@hono/node-server`; Vite com proxy no dev e build estático servido pelo Hono em produção.
- **43:** `.versoes/` versionado no git do vault e `.analises/` no `.gitignore` (recomendação do roadmap; a aplicação no vault fica para o M6).
- Remover os dois itens resolvidos de "Em aberto".

## Arquivos criados/alterados
`package.json`, `tsconfig*.json`, `eslint.config.js`, `.prettierrc`, `.gitignore`, `vite.config.ts`, `vitest.config.ts`, `src/core/index.ts`, `src/server/main.ts`, `src/web/{index.html,main.tsx,App.tsx}`, `skills/save/README.md` e `DECISIONS.md`.

## Verificação
- `npm install`, depois `npm run typecheck`, `npm run lint` e `npm test` (passa com o teste sanity).
- `npm run dev`: abrir `http://127.0.0.1:5173`, ver o placeholder e checar que `curl 127.0.0.1:5173/api/health` responde via proxy.
- `curl` no IP da LAN na porta 5174 deve falhar.
- `DECISIONS.md` com as decisões 40 a 43 e a seção "Em aberto" atualizada.
- Commit inicial (somente quando você pedir).

## Encerramento das pendências

Decidido em 2026-11-04, no encerramento da etapa.

| Pendência | Origem | Destino | Motivo |
|---|---|---|---|
| Investigação 1: texto colado no transcript (decisão 40) | Passo 3 | Próxima etapa | Precisa de um paste real do usuário; o M2 (/save) é o primeiro marco que depende dela |
