---
titulo: "roadmap-02, M2: Variáveis {{nome}}"
data: 2026-11-05
tipo: milestone
roadmap: "02"
numero: "02"
status: implementado
branch: feat/milestone-02-variaveis
encerrado_em: 2026-11-05
pai: roadmaps/roadmap-02
triagem: ok
---

# roadmap-02, M2: Variáveis `{{nome}}`

## Contexto

A decisão 28 tirou as Variáveis do MVP; as decisões 114 a 118 fixaram o escopo: só `{{nome}}`, formulário ao copiar (botão Copiar e Enter da Paleta), memória por Prompt no `localStorage`, destaque no editor e um aviso no prompt da Análise. Este marco implementa isso. Branch: `feat/milestone-02-variaveis`. Decisões novas a partir da 126.

Definido nesta sessão (vira decisão 126):
- nome = `[\p{L}\p{N}_-]+`, com espaços nas pontas aparados (`{{ a }}` = `{{a}}`); `{{nome do cliente}}`, `{{}}` e `{{{a}}}` não são Variáveis;
- campo vazio mantém o `{{nome}}` literal no texto copiado (também é a saída para Prompts que falam de templates);
- vale em qualquer lugar do texto, inclusive em blocos de código.

## 1. Módulo puro `src/web/variaveis.ts`

Fica em `src/web/`: a Análise só precisa de uma instrução no prompt, não de parsing.

- `PADRAO_VARIAVEL = /(?<!\{)\{\{\s*([\p{L}\p{N}_-]+)\s*\}\}(?!\})/gu` (exportado; o editor usa o mesmo).
- `extrairVariaveis(corpo): string[]`: nomes únicos, na ordem da primeira ocorrência, sensível a maiúsculas.
- `preencher(corpo, valores: Record<string, string>): string`: `replace` com função (sem armadilha de `$&`); valor ausente ou vazio mantém a ocorrência original como está.
- Memória (decisão 116), no padrão de `lerModeloSalvo`/`salvarModelo` em `src/web/analise-ui.ts` (try/catch para modo privado):
  - `lerValoresSalvos(id)`: `JSON.parse` de `prompt-library:variaveis:<id>`, só as chaves com string;
  - `salvarValores(id, valores)`.
- `src/web/variaveis.test.ts`: repetição vira um nome; ordem; espaços aparados; nomes com acento, `_` e `-`; rejeita espaço interno, `{{}}`, chaves triplas e quebra de linha; `preencher` com repetição, valor vazio, valor com `$&`/`$1`; memória com `localStorage` falso (JSON inválido e chaves não string ignorados).

## 2. Fluxo de cópia compartilhado

Hoje `copiarPrompt(id)` (`src/web/dados/consultas.ts:141`) busca `/copia` e grava. Ele passa a ter duas etapas:

- `lerTextoCopia(id)` (só o `GET /copia`, verbatim, decisão 25) e `copiarPrompt` continua para quem copia direto.
- Novo `src/web/copia.ts`, um pequeno store de módulo (como `src/web/mover.ts`) + `useSyncExternalStore`:
  - `pedirCopia({ id, titulo, aoCopiar })`: busca o texto; sem Variáveis, grava na área de transferência e chama `aoCopiar()` (o toast de cada chamador fica como está hoje); com Variáveis, publica `{ id, titulo, corpo, variaveis, aoCopiar }` para abrir o formulário. Erros sobem para o chamador, que já mostra o toast de erro.
- `Paleta.tsx`: `copiar(p)` fecha a Paleta e chama `pedirCopia` com `aoCopiar = toast "Copiado: <título>"`.
- `PainelPrompt.tsx` (`copiar`, linha 289): mesma troca, mantendo o aviso "Copiado o texto salvo; há alterações não salvas" no `aoCopiar`.

## 3. Formulário `src/web/componentes/FormularioVariaveis.tsx`

- Montado uma vez em `App.tsx`, ao lado da `Paleta` (linha 80), lendo o store de `copia.ts`.
- `Dialogo` com título "Preencher Variáveis" e o título do Prompt como subtítulo; corpo em `corpo-modal`, botões em `rodape-modal` (padrão do `Confirmacao.tsx`): Cancelar e Copiar (`botao-primario`).
- Um `<textarea>` por Variável, com `<label>` = nome, valores iniciais de `lerValoresSalvos(id)`, o primeiro com `data-autofocus`. Cresce com o texto por JS (`height = scrollHeight` no `input`, com teto e rolagem), sem depender de `field-sizing`.
- Enter quebra linha; Ctrl/⌘+Enter copia (dica no rodapé, como na Paleta, com `TECLA_MOD`).
- Copiar: `navigator.clipboard.writeText(preencher(corpo, valores))` no próprio clique, `salvarValores(id, valores)`, fecha e chama `aoCopiar()`. Falha: toast de erro, formulário fica aberto.
- Sem pré-visualização (descartada na decisão 115).

## 4. Destaque no editor (`src/web/componentes/Editor.tsx`)

- `MatchDecorator` com `PADRAO_VARIAVEL` e `Decoration.mark({ class: 'cm-variavel' })`, num `ViewPlugin` (`decorations: v => v.decoracoes`), adicionado em `extensoes()`. Vale também para o Rascunho da Análise, que usa o mesmo `Editor`.
- Estilo `.cm-variavel` no `EditorView.theme` (junto do `.cm-destaque`): cor `var(--variavel)`, fundo `var(--variavel-fundo)`, `borderRadius: 3px`.
- `src/web/estilos.css`: tokens `--variavel` e `--variavel-fundo` em `:root` e em `[data-tema='escuro']`, num tom distinto da argila (que já marca cursor, seleção e `cm-destaque`), com contraste AA sobre `--fundo` nos dois temas. Destaque leve (decisão 117).

## 5. Análise (`src/server/analise/prompt.ts`)

- Nova regra em "Regras das Sugestões": trechos `{{nome}}` são Variáveis preenchidas pelo usuário ao copiar; preserve-as exatamente (mesmo nome e chaves) e só proponha Variáveis novas, no mesmo formato, quando um valor mudar a cada uso do Prompt.
- `prompt.test.ts`: o texto montado contém a regra.

## 6. Documentação

- `GLOSSARY.md`: termo **Variável** em "Acervo" (`{{nome}}` no corpo, preenchida ao copiar; _Evitar_: placeholder, campo, parâmetro).
- `DECISIONS.md`: seção "2026-11-05: roadmap-02, M2, Variáveis", decisão 126 (regras de nome, campo vazio, código) e as que surgirem na implementação (por exemplo, o store `copia.ts`).
- README: uma linha sobre Variáveis na parte de copiar, se houver.

## Arquivos

Novos: `src/web/variaveis.ts`, `src/web/variaveis.test.ts`, `src/web/copia.ts`, `src/web/componentes/FormularioVariaveis.tsx`.
Alterados: `src/web/dados/consultas.ts`, `src/web/componentes/{Paleta,PainelPrompt,Editor}.tsx`, `src/web/App.tsx`, `src/web/estilos.css`, `src/server/analise/prompt.ts`, `src/server/analise/prompt.test.ts`, `GLOSSARY.md`, `DECISIONS.md`.

## Verificação

1. `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.
2. `npm run build && systemctl --user restart prompt-library`; no navegador (skill `run` + Playwright), num vault de teste (`PROMPT_LIBRARY_VAULT=<tmp>`) com um Prompt "Com variáveis" (`{{a}}` duas vezes, `{{ b }}`, `{{nome do cliente}}`) e um "Sem variáveis":
   - botão Copiar do "Com variáveis": dois campos (`a`, `b`); preencher só `a`; ler a área de transferência (`navigator.clipboard.readText` via `browser_evaluate`) e conferir `a` trocado nas duas ocorrências, `{{ b }}` e `{{nome do cliente}}` intactos;
   - recarregar, copiar de novo: `a` volta preenchido;
   - Ctrl+K, "Sem variáveis", Enter: copia direto com o toast; Ctrl+K, "Com variáveis", Enter: abre o formulário; Ctrl+Enter copia;
   - editor destaca `{{a}}` e `{{ b }}`, não `{{nome do cliente}}`, nos temas claro e escuro (screenshots).
3. Encerramento: `/spec-kit:close-cycle`.
