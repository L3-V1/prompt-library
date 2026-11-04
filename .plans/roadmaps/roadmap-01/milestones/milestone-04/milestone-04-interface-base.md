---
titulo: "M4: Interface base"
data: 2026-11-04
status: aprovado
tipo: milestone
numero: "04"
pai: roadmaps/roadmap-01
triagem: ok
branch: feat/milestone-04-interface-base
---

# M4: Interface base (`src/web/`)

## Contexto

O M3 entregou a API REST em `127.0.0.1:5174` (`criarApp`, `AppType` exportado para o cliente `hc`), com índice em memória, watcher e eventos SSE (`acervo`, `diretrizes`, `ping`), além do 409 de conflito com `atual` e `diff`. Hoje `src/web/` só tem um `App.tsx` "Em construção". O M4 constrói o MVP sem IA: três painéis (decisão 26), editor CodeMirror com Ctrl+S (decisões 9 e 24), modal de conflito (decisão 10), Copiar e paleta Ctrl+K (decisão 25), Versões com diff lado a lado e restauração, e o editor das Diretrizes. Tudo em pt-BR, com tema terracota/creme claro e escuro (decisão 27).

Escolhas desta etapa: **Tailwind v4**, **`<dialog>` nativo + `cmdk`** e **testes de lógica pura + verificação manual com Playwright**.

**Pronto quando:** `npm run typecheck`, `npm run lint`, `npm test` e `npm run build` passam e o roteiro de verificação abaixo funciona no navegador, tanto em `npm run dev` quanto em `npm start`.

## Dependências novas
- `tailwindcss` v4 e `@tailwindcss/vite` (plugin no `vite.config.ts`).
- `@tanstack/react-query`.
- CodeMirror 6: `codemirror` (basicSetup), `@codemirror/lang-markdown`, `@codemirror/language-data` (realce dos blocos de código), `@codemirror/state`, `@codemirror/view`. O wrapper React é nosso, sem `@uiw/react-codemirror`.
- `cmdk` (paleta).
- O `hono/client` já vem com o `hono`.

## Passos

### 0. Tipos compartilhados entre web e servidor
- `import type { AppType } from '../server/app'` no web. O `tsconfig.web.json` só inclui `src/web`, então o caminho é adicionar `references: [{ path: './tsconfig.node.json' }]` e conferir se o `tsc -b --noEmit` aceita a referência.
- Se o `--noEmit` com referências reclamar (TS6305), trocar o `typecheck` para `tsc -b`, que emite em `dist/.tsc/`, já fora do git.
- Também importar `Prompt`, `Versao`, `Change`, `Resumo`, `TotalColecao`, `TotalTag` e `CorpoConflito` como `import type`, sem código de Node no bundle.
- Registrar em `DECISIONS.md` a forma que funcionou.

### 1. Base: tema, layout e infraestrutura (`src/web/`)
- `estilos.css`:
  - `@import "tailwindcss"` e `@theme` com os tokens (terracota `#C96442`/`#D97757`, creme `#F5F4EE`/`#FAF9F5`, cinzas quentes, superfícies e bordas);
  - os tokens viram variáveis CSS trocadas por `[data-tema="escuro"]`;
  - `@custom-variant dark (&:where([data-tema=escuro], [data-tema=escuro] *))`.
- `tema.ts`: preferência `sistema | claro | escuro` no `localStorage`. Em `sistema`, um `matchMedia('(prefers-color-scheme: dark)')` resolve o tema e aplica `data-tema` no `<html>`. Um script inline no `index.html` aplica o tema antes do primeiro paint, sem flash.
- `main.tsx`: `QueryClientProvider` (`staleTime` alto, porque o SSE é quem invalida) e o `Toaster`.
- `api/cliente.ts`: `hc<AppType>('/')` e o helper `pedir(res)`:
  - devolve o JSON quando `ok`;
  - no 409 com `codigo: 'conflito'`, lança `ConflitoApi { atual, diff }`;
  - nos outros erros, lança `ErroApi { status, codigo, erro }`, com a mensagem pt-BR do servidor.
- `api/consultas.ts`: chaves (`['prompts', filtros]`, `['prompt', id]`, `['colecoes']`, `['tags']`, `['versoes', id]`, `['diff', id, versaoId, para]`, `['diretrizes']`) e os hooks de consulta e mutação.
- `api/eventos.ts`: `useEventos()` com `EventSource('/api/eventos')`.
  - `acervo`: invalida `prompts`, `colecoes` e `tags`, e também `prompt`/`versoes` de cada id em `alterados`/`removidos`.
  - `diretrizes`: invalida `['diretrizes']`.
  - A função pura `chavesParaInvalidar(evento)` é testável.
- `navegacao.ts`: estado na URL (`?colecao=&tag=&favoritos=1&q=&p=<id>` e `?vista=diretrizes`), com `pushState`/`popstate` e as funções puras `lerNavegacao`/`escreverNavegacao`. Recarregar a página mantém a seleção. Sem router.
- Componentes comuns:
  - `Dialogo` (sobre `<dialog>` com `showModal`, fecha com Esc e devolve o foco);
  - `Confirmacao` (título, texto, ação destrutiva destacada);
  - `Toaster` (sucesso e erro de toda ação do usuário);
  - `EstadoVazio`.
- Textos sem travessão de ênfase e datas via `Intl.DateTimeFormat('pt-BR')`.

### 2. Três painéis (decisão 26)
`Layout` em grid: painel 1 (~240px), painel 2 (~320px) e painel 3 (o resto). Abaixo de 1024px o painel 1 vira gaveta; abaixo de 768px aparece um painel por vez, com "voltar".
- **Painel 1, `Navegacao`:**
  - "Todos", "Favoritos" e "Sem coleção";
  - Coleções com total (`GET /api/colecoes`), criar Coleção (campo inline) e renomear (menu da Coleção);
  - Tags com total (`GET /api/tags`);
  - no rodapé: "Diretrizes", alternância de tema e o botão "Novo Prompt".
- **Painel 2, `ListaPrompts`:**
  - busca com debounce de 200 ms → `GET /api/prompts?q=&colecao=&tag=&favorito=`;
  - cada item mostra título, Coleção, Tags e estrela do Favorito;
  - setas ↑/↓ e Enter navegam pela lista;
  - estado vazio distinto para "acervo vazio" e "nenhum resultado";
  - aviso discreto dos `problemas` (arquivos ilegíveis), com os caminhos.
- **Painel 3, `PainelPrompt`:**
  - cabeçalho: título editável, Favorito, seletor de Coleção, Tags (chips com sugestão das Tags existentes), Copiar, Versões e Excluir;
  - indicador de "alterações não salvas" e botão Salvar;
  - abaixo, o `Editor`.
- **Novo Prompt:** um diálogo com título e Coleção (pré-selecionada pelo filtro ativo). Faz `POST` com corpo vazio e abre o Prompt criado.

### 3. Editor e modelo de edição
- `Editor.tsx`: wrapper do CodeMirror 6 (`EditorView` criado num `useEffect` e conteúdo trocado por transação quando muda o documento base). Usa `markdown({ codeLanguages: languages })`, quebra de linha, tema ligado aos tokens CSS e keymap `Mod-s` → `onSalvar`.
- `edicao.ts` (puro, testado): estado `{ base: Prompt, rascunho: { titulo, tags, corpo } }`.
  - `pendente(estado)`: o rascunho difere da base.
  - `rebasear(estado, promptDoServidor)`: troca a base e mantém o rascunho. É usado depois de `favoritar`/`mover` (decisão 51), que mudam o hash do arquivo sem criar Versão. Sem isso, o Ctrl+S seguinte daria 409 falso.
  - `reagirAMudancaExterna(estado, promptNovo)`:
    - se o hash é igual à base, foi o próprio app: `ignorar`;
    - sem pendências: `recarregar` (silencioso, com toast "Atualizado fora do app");
    - com pendências: `avisar` (faixa "Este Prompt mudou no disco", com Recarregar e Ver diferenças);
    - Prompt removido: `removido`.
- **Salvar** (Ctrl+S no editor e global no painel, e botão): `PUT /api/prompts/:id { titulo, tags, corpo, baseHash }`. Só os campos alterados; nada a salvar não chama a API. O sucesso cria uma Versão e mostra o toast "Salvo".
- **Sair com pendências** (decisão 9): trocar de Prompt, abrir as Diretrizes, o "Novo Prompt" ou um `popstate` passam por `confirmarSaida()` (diálogo "Descartar alterações?" com Salvar, Descartar e Continuar editando). Fechar a aba usa `beforeunload`.

### 4. Conflito (decisão 10)
`ModalConflito`, aberto quando o salvar lança `ConflitoApi`:
- **Recarregar:** descarta o rascunho e carrega `atual`.
- **Sobrescrever:** repete o `PUT` com `baseHash = atual.hash`.
- **Ver diferenças:** `DiffLadoALado` com o `diff` do 409 (o seu texto à esquerda, o do disco à direita). Se só título ou Tags mudaram, o diff vem vazio, e o modal diz isso e mostra os metadados lado a lado.

O mesmo modal serve às Diretrizes.

### 5. Copiar e paleta Ctrl+K (decisão 25)
- **Copiar:** `GET /api/prompts/:id/copia` → `navigator.clipboard.writeText` (`127.0.0.1` é contexto seguro). Copia o texto **salvo**. Com pendências, o toast avisa "Copiado o texto salvo; há alterações não salvas".
- **`Paleta`** (`cmdk` dentro do `Dialogo`):
  - Ctrl+K global, com listener em captura para funcionar também com o foco no CodeMirror;
  - `shouldFilter={false}` e resultados do `GET /api/prompts?q=`, a mesma ordem da lista;
  - Enter copia e fecha (toast "Copiado: <título>"); Ctrl+Enter abre o Prompt no painel 3;
  - mostra os Favoritos primeiro quando a busca está vazia.

### 6. Excluir, Coleção e Favorito
- **Excluir:** `Confirmacao` ("O arquivo vai para a lixeira do vault") → `DELETE` → toast, e a seleção vai para o próximo item.
- **Favorito e Coleção:** aplicados na hora (otimista no Favorito), seguidos de `rebasear`.
- **Erros de Coleção** (400 e 409): mensagem do servidor no campo.

### 7. Versões
`PainelVersoes`, uma gaveta lateral sobre o painel 3:
- lista as Versões da mais nova para a mais antiga, com data pt-BR e motivo traduzido (Criação, Manual, Análise, Captura, Restauração);
- ao escolher uma, mostra `DiffLadoALado` de `GET .../versoes/:versaoId/diff?para=atual`, com o seletor "comparar com: atual | Versão anterior" (`para=<id anterior>`);
- **Restaurar:** confirmação → `POST .../restaurar { baseHash }`. Fica bloqueado com pendências ("salve ou descarte antes"); o 409 abre o `ModalConflito`.
- `diff-lado-a-lado.ts` (puro, testado): converte `Change[]` em linhas `{ esquerda?: { n, texto }, direita?: { n, texto }, tipo }`, emparelhando remoções e adições consecutivas e tratando a quebra de linha final. O componente só renderiza, com destaque das cores e numeração.

### 8. Diretrizes
`vista=diretrizes` no painel 3:
- o mesmo `Editor`, com `GET`/`PUT /api/diretrizes` e `baseHash` (`null` quando o arquivo não existe);
- Ctrl+S, o indicador de pendências e o `ModalConflito`;
- o evento SSE `diretrizes` aplica a mesma regra do `reagirAMudancaExterna`, por hash;
- uma explicação curta no estado vazio ("Escreva aqui os critérios do que você considera um bom Prompt").

### 9. Testes (Vitest, puros, em `src/web/**/*.test.ts`, já no `include`)
- `diff-lado-a-lado.test.ts`: igual, só adição, só remoção, troca emparelhada, blocos desiguais, sem `\n` final.
- `edicao.test.ts`: `pendente`, `rebasear` mantém o rascunho e troca o hash, e os quatro ramos de `reagirAMudancaExterna`.
- `navegacao.test.ts`: ida e volta URL ↔ estado, incluindo "Sem coleção" (`colecao=`) e acentos.
- `cliente.test.ts`: `pedir` com `Response` falsa (200, 409 conflito, 404, 400).
- `eventos.test.ts`: `chavesParaInvalidar`.

### 10. Documentação
- `DECISIONS.md`, seção "M4, interface base":
  - Tailwind v4 com tokens em variáveis e `data-tema`;
  - TanStack Query invalidado pelo SSE;
  - cliente `hc` e a solução de tipos do passo 0;
  - estado de navegação na URL;
  - CodeMirror com wrapper próprio;
  - `rebasear` depois de Favorito e Coleção;
  - regra da mudança externa (recarregar, avisar ou ignorar por hash);
  - Copiar usa o texto salvo;
  - paleta `cmdk` com a busca do servidor (Enter copia, Ctrl+Enter abre);
  - diff lado a lado a partir do `Change[]` do servidor;
  - restaurar bloqueado com pendências;
  - `<dialog>` nativo.
- `GLOSSARY.md` não muda.

## Fora do escopo
- Análise e painel lateral da Análise (M5).
- `npm start` como serviço, README e revisão com `ui-ux-kit:ui-guidelines` (M6).
- Variáveis `{{...}}` (pós-MVP).
- Arrastar Prompt entre Coleções, excluir Coleção e redimensionar painéis.

## Arquivos
- **Novos:**
  - `src/web/{estilos.css,tema.ts,navegacao.ts,edicao.ts,diff-lado-a-lado.ts}`;
  - `src/web/api/{cliente,consultas,eventos}.ts`;
  - `src/web/componentes/{Layout,Navegacao,ListaPrompts,PainelPrompt,Editor,ModalConflito,PainelVersoes,DiffLadoALado,Paleta,Diretrizes,NovoPrompt,Dialogo,Confirmacao,Toaster,EstadoVazio,CampoTags}.tsx`;
  - os testes.
- **Alterados:** `src/web/{App,main}.tsx`, `src/web/index.html`, `vite.config.ts`, `tsconfig.web.json` (e talvez o `typecheck` no `package.json`), `package.json` e `DECISIONS.md`.
- **Servidor:** sem mudança prevista. Se faltar algo na API, ajustar com teste em `src/server/app.test.ts` e registrar.

## Verificação
1. `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.
2. `PROMPT_LIBRARY_VAULT=<tmp> npm run dev`, guiado pela skill `run` + Playwright em `http://127.0.0.1:5173`:
   - criar um Prompt pelo "Novo Prompt", escrever e salvar com Ctrl+S → toast e um arquivo novo em `<tmp>/Prompts/.versoes/<id>/`;
   - favoritar e mover de Coleção, e depois Ctrl+S → salva sem 409 falso;
   - `echo` no `.md` com o editor limpo → recarrega sozinho; com pendências → faixa de aviso, e o Ctrl+S abre o modal de conflito (testar Ver diferenças, Sobrescrever e Recarregar);
   - `echo 'oi' > <tmp>/Prompts/Novo.md` → aparece na lista sem recarregar a página;
   - Ctrl+K → buscar → Enter, e conferir a área de transferência (`browser_evaluate` com `navigator.clipboard.readText()`, com permissão concedida): corpo sem frontmatter;
   - Versões: diff lado a lado contra o atual e contra a anterior, e restaurar → nova Versão `restauracao`;
   - trocar de Prompt com pendências → confirmação; recarregar a página → a mesma seleção pela URL;
   - Diretrizes: criar, salvar, editar fora → aviso e conflito;
   - tema: `browser_emulate_media` claro/escuro em "sistema" e alternância manual persistida; screenshots dos dois temas e da largura < 768px;
   - excluir → confirmação, e o arquivo vai para `<tmp>/.trash/`.
3. `npm run build && npm start` → a interface em `http://127.0.0.1:5174` funciona igual, com o SSE ativo.
4. Commit na branch `feat/milestone-04-interface-base` só quando você pedir.
