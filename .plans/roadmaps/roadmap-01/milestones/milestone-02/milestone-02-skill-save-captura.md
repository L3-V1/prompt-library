---
titulo: "M2: Skill /save (Captura) (roadmap-01)"
data: 2026-11-04
status: implementado
tipo: milestone
numero: "02"
pai: roadmaps/roadmap-01
triagem: ok
branch: feat/milestone-02-skill-save
encerrado_em: 2026-11-04
---

# M2: Skill `/save` (Captura)

## Contexto

O M1 entregou o núcleo (`src/core/`: `criarAcervo`, `criar`, `salvar`, `listar`, `listarColecoes`, Versões com motivo `captura`). O M2 entrega a skill global `/save`, que faz a Captura do prompt digitado numa conversa do Claude Code e o grava em `Prompts/` sem o app estar rodando (decisões 29 a 39). É o primeiro marco utilizável no dia a dia. **Pronto quando:** `npm run typecheck`, `npm run lint` e `npm test` passam, e um `/save` real numa sessão grava um `.md` idêntico byte a byte ao texto digitado (incluindo um texto colado).

### O que já foi verificado no planejamento (somente leitura)
- **Id da sessão:** o Bash da sessão recebe `CLAUDE_CODE_SESSION_ID` (já é o id pós-`/clear`). O transcript é `~/.claude/projects/<slug-do-cwd>/<id>.jsonl`.
- **Forma das linhas `type:"user"` nos transcripts atuais:**
  - prompt digitado: `message.content` string (ou lista de blocos `text`/`image`), sem `isMeta`, às vezes com `origin.kind: "human"` (não está em todas, então não serve de critério único);
  - slash command: texto começando com `<command-name>` ou `<command-message>` (o próprio `/save 3` aparece assim, com `<command-args>3</command-args>`);
  - ruído a ignorar: `isMeta: true` (caveat, corpo de skill carregada), `<local-command-stdout>`, `<local-command-caveat>`, `<bash-input>`, `<bash-stdout>`, `[Request interrupted by user...]`, `tool_result`, `isCompactSummary`, `isSidechain`.
- **Texto colado (Investigação 1, decisão 40, ainda pendente):** `~/.claude/history.jsonl` grava `display` com `[Pasted text #N +K lines]` e `pastedContents[N]`, que tem `content` inline (pastes menores) **ou** só `contentHash`, com o texto em `~/.claude/paste-cache/<contentHash>.txt` (pastes maiores). Nenhum transcript com paste sobreviveu à limpeza, então falta ver o que o `.jsonl` guarda.
- `${CLAUDE_SKILL_DIR}` é substituído no `SKILL.md` (usado por skills de plugins instalados).
- `~/.claude/skills/` existe e não tem `save`.

## Passos

### 1. Fechar a Investigação 1 (precisa de você)
1. Numa sessão nova neste repositório, você cola um texto grande (mais de 10 linhas) com uma frase digitada antes e depois, e envia.
2. Eu inspeciono o `.jsonl` dessa sessão, o `history.jsonl` e o `paste-cache`: o `message.content` traz o texto integral ou o marcador?
3. Registro a **decisão 40** em `DECISIONS.md` e anonimizo essas linhas como fixture.

O `extract` é escrito para funcionar nos dois cenários (abaixo); a investigação só define qual caminho é o principal e qual é o reserva.

### 2. Código em `skills/save/`

| Arquivo | Conteúdo |
|---|---|
| `SKILL.md` | a skill (seção 3) |
| `capture` | wrapper bash executável: resolve o diretório real com `readlink -f` (a skill é um symlink) e faz `exec <repo>/node_modules/.bin/tsx <dir>/capture.ts "$@"` |
| `capture.ts` | CLI com `node:util parseArgs` e os subcomandos `extract`, `context` e `write`; saída sempre JSON no stdout, erros como `{ "erro": "..." }` e código ≠ 0 |
| `transcript.ts` | localizar o transcript, filtrar as mensagens digitadas, reconstruir textos colados |
| `similaridade.ts` | normalização, tokens e Jaccard |
| `capturas.ts` | arquivo temporário da Captura (decisão 32) |
| `fixtures/` | `.jsonl` anonimizados, `history.jsonl` e `paste-cache/` de teste |

**Configuração:** a pasta do Claude é `CLAUDE_CONFIG_DIR` ou `~/.claude` (os testes apontam para um tmpdir); o vault vem de `resolverPastas()` (`src/core/config.ts`).

#### `transcript.ts`
- `localizarTranscript({ sessao, cwd, dirClaude })`: procura `projects/*/<sessao>.jsonl`. Sem `CLAUDE_CODE_SESSION_ID`, usa como reserva o `.jsonl` mais recente de `projects/<slug(cwd)>/` (slug = cwd com todo caractere fora de `[A-Za-z0-9]` trocado por `-`).
- `mensagensDigitadas(linhas)`: lê o `.jsonl` linha a linha (linhas inválidas são ignoradas) e devolve, em ordem, `{ texto, imagens, timestamp, cwd, sessionId }` das linhas `type:"user"` que passam nos filtros acima. `texto` é o `content` string ou a junção dos blocos `text` (com `\n`); `imagens` conta os blocos `image`.
- `capturar(mensagens, n = 1)`: devolve a N-ésima mais recente (o `/save` em si já é excluído por ser slash command). N fora do intervalo vira erro claro ("só há K mensagens digitadas nesta sessão").
- `reconstruirColagens(texto, sessao, dirClaude)`: se o texto contém `[Pasted text #N ...]`, procura em `history.jsonl` a entrada da mesma `sessionId` cujo `display` é igual ao texto e troca cada marcador por `pastedContents[N].content` ou pelo conteúdo de `paste-cache/<contentHash>.txt`. Marcador sem conteúdo encontrado é **erro** (a skill não grava texto incompleto).
- A Origem (decisão 38): `{ projeto: <cwd absoluto da linha>, data: <timestamp ISO da mensagem>, sessao: <sessionId> }`. O cwd absoluto permite voltar à conversa com `cd <projeto> && claude -r <sessao>`.

#### `similaridade.ts`
- Normaliza (minúsculas, NFD sem acentos), tokeniza em palavras de 2+ caracteres e calcula Jaccard dos conjuntos.
- `parecidos(texto, prompts, { limite: 3, minimo: 0.4 })` → `{ id, titulo, colecao, tags, pontuacao, identico }[]`, ordenado. `identico` quando o corpo é igual ao texto (depois de normalizar só o fim de linha final).

#### `capturas.ts` (decisão 32)
- Guarda `{ texto, origem, imagens, parecidos: { id, hash }[] }` em `<os.tmpdir()>/prompt-library-capturas/<id>.json` (modo 0600, id `novoId()` de `src/core/ids.ts`).
- Apaga a Captura depois do `write` bem-sucedido e, em cada `extract`, as com mais de 24 h.

#### Subcomandos
- `capture extract [N]` → `{ captura, previa (primeiros 500 caracteres), caracteres, linhas, imagens, colagens, origem }`. O texto completo nunca vai para o stdout.
- `capture context <captura>` → `{ colecoes, tags (com contagem, mais usadas primeiro), parecidos }`, usando `listar()` e `listarColecoes()` do acervo. Grava na Captura o `hash` dos parecidos, para o `write` detectar conflito.
- `capture write <captura> --titulo <t> [--colecao <c>] [--tag <t>]...` → `criar({ titulo, corpo: texto, tags, colecao, origem, motivo: 'captura' })`.
- `capture write <captura> --versao-de <id>` → `salvar(id, { corpo: texto }, hashGuardado, 'captura')`. Título, Tags, Favorito, Coleção e Origem originais ficam. `ConflitoError` vira erro "o Prompt mudou desde a análise; rode o /save de novo".
- Saída do `write`: `{ id, titulo, caminho (absoluto), novaVersao: boolean }`.

### 3. `skills/save/SKILL.md`
Frontmatter: `name: save`, `description` curta, `disable-model-invocation: true` (decisão 31), `argument-hint: "[N]"`, `allowed-tools: Bash(${CLAUDE_SKILL_DIR}/capture *), AskUserQuestion`.

Fluxo instruído (em pt-BR):
1. Rodar `${CLAUDE_SKILL_DIR}/capture extract $ARGUMENTS`. Em erro, mostrar a mensagem e parar.
2. Rodar `capture context <captura>`. Se algum parecido for `identico`, avisar que o Prompt já existe e parar.
3. Propor título, Coleção e Tags, reaproveitando as existentes (decisão 35), e confirmar numa única chamada ao AskUserQuestion. Se houver parecidos, incluir a pergunta "nova Versão de *X*" ou "Prompt novo" (decisão 36), com a opção recomendada pela pontuação.
4. Rodar `capture write` com as escolhas. **Nunca** reescrever, resumir ou passar o texto do prompt em argumentos (decisões 32 e 34).
5. Responder com o caminho gravado; se `imagens > 0`, avisar que as imagens ficaram de fora (decisão 39).

### 4. Instalação
- `package.json`: script `"save:install": "node scripts/instalar-save.mjs"`. O script cria o link `~/.claude/skills/save` → `<repo>/skills/save`; se já existe um link para o mesmo destino, não faz nada; se existe outra coisa, falha sem tocar nela.
- Trocar o `README.md` placeholder da skill por instruções de instalação e uso.

### 5. Testes (Vitest)
- `transcript.test.ts`, com fixtures anonimizadas a partir das formas reais:
  - ignora slash commands (incluindo o próprio `/save 3`), `isMeta`, `local-command-*`, `bash-*`, interrupções, `tool_result`, sidechain e linhas inválidas;
  - `N = 1` pega a última e `/save 3` pega a terceira; N grande demais dá erro;
  - texto em blocos com imagem: só o texto e `imagens = 1`;
  - colagem: texto integral no transcript (se a investigação confirmar), reconstrução por `content` inline e por `paste-cache`, e erro com marcador sem conteúdo;
  - localização por id de sessão e pelo `.jsonl` mais recente do cwd;
  - Origem com cwd, data e sessão.
- `similaridade.test.ts`: acentos e caixa, ordem e limite, mínimo, `identico`.
- `capture.test.ts`: `extract` → `context` → `write` ponta a ponta num vault temporário (`src/core/teste/vault-temporario.ts`), checando o `.md` byte a byte, a Origem no frontmatter e a Versão `captura`; `--versao-de` com e sem conflito; a Captura temporária some depois do `write`.

### 6. Documentação
- `DECISIONS.md`, seção "M2, skill /save": decisão 40 (resultado da investigação) e as novas: wrapper `capture` com `tsx`; Captura temporária em tmpdir com id; critérios de filtragem das mensagens digitadas; similaridade por Jaccard de palavras (mínimo 0,4, até 3); Origem com cwd absoluto; Versão por Captura altera só o corpo; colagem não encontrada aborta a Captura; script `save:install`.
- Atualizar a seção "Em aberto" (tirar a pendência do texto colado).

## Fora do escopo
- Capturar o texto de slash commands com argumentos (ex.: `/plan <prompt longo>`): a decisão 33 manda ignorá-los. Fica registrado como possível melhoria.
- Índice, watcher e API (M3).

## Verificação
1. `npm run typecheck`, `npm run lint`, `npm test`.
2. `npm run save:install` e `ls -l ~/.claude/skills/save`.
3. Numa sessão real com `PROMPT_LIBRARY_VAULT` apontando para um vault temporário (exportado antes de abrir o `claude`): digitar um prompt com um texto colado e rodar `/save`; conferir com `cmp` o corpo do `.md` contra o texto original, a Origem no frontmatter e a Versão em `.versoes/<id>/`. Depois ajustar o mesmo prompt, rodar `/save` e escolher "nova Versão"; testar também `/save 2` e um prompt com imagem.
4. Só depois disso, um `/save` no vault real, com a sua confirmação.
5. Commit na branch `feat/milestone-02-skill-save` só quando você pedir.

## Encerramento das pendências

Decidido em 2026-11-04, no encerramento da etapa.

| Pendência | Origem | Destino | Motivo |
|---|---|---|---|
| Capturar o texto de slash commands com argumentos (ex.: `/plan <prompt longo>`) | Fora do escopo | Plano avulso | Melhoria do `/save` que não cabe em nenhum marco de M3 a M6 |
| Índice, watcher e API | Fora do escopo | Próxima etapa | Já é o escopo do M3 no roadmap |
