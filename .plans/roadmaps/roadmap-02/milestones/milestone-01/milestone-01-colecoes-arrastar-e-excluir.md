---
titulo: "roadmap-02, M1: Coleções (arrastar e excluir)"
data: 2026-11-05
status: aprovado
tipo: milestone
numero: "01"
pai: roadmaps/roadmap-02
triagem: ok
---

# roadmap-02, M1: Coleções (arrastar e excluir)

## Context

Terceira pendência que o M6 deixou para depois (decisões 111 a 113). Hoje a única forma de mudar a Coleção de um Prompt é o seletor no painel, e não há como excluir uma Coleção. Este marco acrescenta duas coisas: arrastar um Prompt da lista para uma Coleção ou para "Sem coleção", e excluir uma Coleção. Na exclusão, os `.md` vão para a raiz e o resto vai para `.trash/`. Se algum nome colidir, nada se move.

Branch: `feat/milestone-01-colecoes` (sai da `main`). Decisões novas a partir da 122.

## Decisões a registrar (DECISIONS.md, seção "2026-11-05: roadmap-02, M1, Coleções")

- **122. A prévia da exclusão vem de `GET /api/colecoes/:nome/exclusao`** → `{ prompts, outros, conflitos: string[] }`. A UI mostra os conflitos antes de pedir confirmação. O `DELETE` confere de novo e responde 409 se surgir colisão entre a prévia e a exclusão.
- **123. O que não é Prompt vai para a lixeira junto, como uma pasta só.** Primeiro os `.md` saem da Coleção. Depois as pastas vazias são removidas, e se ainda restar algo a pasta da Coleção vai inteira para `.trash/<nome>` (com `caminhoLivre`, sem extensão). É o que o Obsidian faz ao excluir uma pasta, e assim a lixeira não fica com arquivos espalhados nem com colisões de nome. "Prompt" aqui é o mesmo que a varredura considera Prompt: `.md` fora de entradas com prefixo `.`/`_`. Um `_rascunho.md` ou uma pasta `_x/` vão para a lixeira.
- **124. Conflito é um nome de arquivo de destino repetido:** um `.md` da Coleção que tem o mesmo nome de um arquivo da raiz de `Prompts/`, ou dois `.md` de subpastas diferentes com o mesmo nome. A lista traz o título de cada Prompt da Coleção envolvido.
- **125. O arrastar usa um MIME próprio (`application/x-prompt-library`), e o item arrastado fica num módulo (`arrastado`).** Assim o `dragover` já sabe a Coleção de origem: ela não é destacada e não aceita a soltura.

## Núcleo (`src/core/`)

- `erros.ts`: `ColecaoComConflitosError(nome, titulos: string[])`, com mensagem em pt-BR que já lista os títulos ("…já existem em Sem coleção Prompts com o mesmo nome de arquivo: "A", "B". Renomeie-os e tente de novo.").
- `acervo.ts`, ao lado de `renomearColecao`:
  - `planoExclusao(nome)` (interno): valida com `listarColecoes()` (lança `ColecaoNaoEncontradaError`, que também barra `../x`). Os Prompts saem do `arquivosMd(dir)` existente e os títulos do `varrer()` (filtrando por `colecao === nome`; para o `.md` ilegível, usa o nome do arquivo). Os outros arquivos vêm de uma caminhada recursiva que conta todo arquivo que não é Prompt. Os conflitos usam o critério da decisão 124, conferido com `fs.access` em `pastas.prompts/<base>`.
  - `previaExclusaoColecao(nome)` → `{ prompts: number; outros: number; conflitos: string[] }`.
  - `excluirColecao(nome)`: monta o plano e lança `ColecaoComConflitosError` se houver conflitos. Depois faz `fs.rename` de cada `.md` para `pastas.prompts/<base>`, remove as pastas vazias de baixo para cima e, se sobrar algo, faz `mkdir` em `pastas.lixeira` e `rename` da pasta para `caminhoLivre(pastas.lixeira, nome, '')`. Se não sobrar nada, faz `fs.rmdir`. Devolve `{ prompts, outros }`.
  - Exporta as duas no objeto do acervo. Também exporta o tipo `PreviaExclusao` em `tipos.ts`/`index.ts`.
- Reaproveita `caminhoLivre` (`src/core/arquivos.ts`), `arquivosMd`, `varrer` e `ehOculto`, que já estão no acervo.

## Servidor

- `src/server/erros.ts`: mapeia `ColecaoComConflitosError` para 409 `colecao_com_conflitos`, com `titulos` no corpo (`CorpoErro & { titulos }`).
- `src/server/rotas/colecoes.ts`:
  - `.get('/:nome/exclusao', …)` → `acervo.previaExclusaoColecao`;
  - `.delete('/:nome', …)` → `acervo.excluirColecao`, depois `indice.atualizar()`, que emite o SSE `acervo` para todas as abas; responde `{ prompts, outros }`.

## Web

- **`src/web/dados/consultas.ts`:** `previaExclusaoColecao(nome)` e `excluirColecao(nome)`. A segunda invalida `chaves.colecoes`, no padrão de `renomearColecao`.
- **`src/web/dados/eventos.ts`:** novo evento local `{ tipo: 'gravado'; dados: Prompt }` no `EventoLocal`, e `avisarGravado(prompt)` repassa aos ouvintes.
- **Novo `src/web/mover.ts`:** a mutação que o seletor e a soltura passam a usar.
  - `moverParaColecao(id, colecao)` chama `moverPrompt`, faz `avisarGravado(novo)` e mostra o toast "Movido para X" ou o de erro (o texto que hoje está em `PainelPrompt.mover`).
  - Guarda também o estado do arrasto: `iniciarArrasto({ id, colecao })`, `arrastado()` e `encerrarArrasto()`, com o MIME da decisão 125.
- **`PainelPrompt.tsx`:**
  - `mover()` passa a chamar `moverParaColecao`;
  - o ouvinte de eventos trata `gravado` com `dados.id === id` usando `aplicar(reagirAMudancaExterna(estadoRef.current, dados))`, e isso faz o `rebasear` (decisão 80);
  - assim, soltar o Prompt aberto troca a base na hora, sem esperar o SSE.
- **`ListaPrompts.tsx`:** o `<button data-item>` ganha `draggable`. O `onDragStart` faz `setData(MIME, id)`, `effectAllowed = 'move'` e `iniciarArrasto`. O `onDragEnd` chama `encerrarArrasto`.
- **`Navegacao.tsx`:**
  - `Item` aceita um `soltar?: string | null` opcional (a Coleção de destino; `null` = "Sem coleção"). Ele vai em "Sem coleção" e em cada Coleção, mas não em Todos, Favoritos e Tags.
  - No `dragover`, se `types` inclui o MIME e `arrastado().colecao !== soltar`, faz `preventDefault` e `dropEffect = 'move'`.
  - `dragenter`/`dragleave` (com `contains(relatedTarget)`) ligam o estado `alvo`, que aplica uma classe nova `item-alvo` em `estilos.css` (anel terracota e fundo `realce`, nos dois temas).
  - O `drop` chama `moverParaColecao`.
- **Excluir Coleção, em `Navegacao.tsx`:**
  - Ao lado do lápis entra um botão lixeira (`Icone nome="lixeira"`, `aria-label="Excluir a Coleção X"`). Os dois ficam num contêiner `absolute` com `flex`, com a mesma regra de opacidade de hover/foco.
  - O clique busca a prévia:
    - **com conflitos:** um `Dialogo` "Não é possível excluir a Coleção" com a lista de títulos, a orientação para renomeá-los e o botão "Entendi";
    - **sem conflitos:** o `Confirmacao` com o rótulo "Excluir Coleção" e o texto das contagens.
  - Ao confirmar, chama `excluirColecao` e mostra um toast de sucesso. Se `nav.colecao === nome`, faz `filtrar({})` (Todos).
  - Um 409 vindo do `DELETE`, ou qualquer outro erro, vira `toast.erro(mensagemDeErro(e))`, e a mensagem já lista os títulos.
- **`src/web/textos.ts`:** a função pura `textoExclusaoColecao({ prompts, outros })`, com os plurais e o caso vazio (ex.: "3 Prompts vão para Sem coleção e 2 arquivos vão para a lixeira do vault." / "A Coleção está vazia."), testada em `textos.test.ts`.

## Testes

- `src/core/acervo.test.ts` (com `vault-temporario.ts`), num `describe('excluirColecao')`:
  - Coleção com `a.md`, `sub/b.md`, `img.png` e `sub/c.pdf`: os `.md` vão para a raiz com os mesmos ids, `.trash/A/img.png` e `.trash/A/sub/c.pdf` existem e `Prompts/A` some;
  - Coleção só com `.md`: a pasta é apagada e nada vai para a lixeira;
  - colisão com a raiz e colisão entre subpastas: lança `ColecaoComConflitosError` com os títulos, e nada muda no disco;
  - `.trash/A` já existe: o destino vira `.trash/A 2`;
  - a prévia devolve as mesmas contagens e conflitos;
  - Coleção inexistente e `../x` dão `ColecaoNaoEncontradaError`.
- `src/server/app.test.ts`: `GET …/exclusao`, `DELETE` 200, 409 com `titulos` e 404.
- `src/web/textos.test.ts`: os plurais de `textoExclusaoColecao`.

## Docs

- `DECISIONS.md`: as decisões 122 a 125.
- `README.md`: uma linha sobre arrastar e excluir Coleção, se o README já tiver a seção de uso das Coleções.
- No encerramento, `/spec-kit:close-cycle`.

## Verificação

1. `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.
2. Um vault de teste `PROMPT_LIBRARY_VAULT=<tmp>` com:
   - a Coleção `A`, contendo `x.md`, `sub/y.md`, `sub/foto.png` e `z.md`;
   - `Prompts/z.md` na raiz, para colidir com o `z.md` da Coleção.
3. Subir o app com a skill `run` e testar no Playwright, em duas abas:
   - arrastar um Prompt para `B` e para "Sem coleção": a lista e os totais mudam nas duas abas, e com o Prompt aberto, editar e dar Ctrl+S não dá 409;
   - excluir `A`: o diálogo de conflito lista "z"; depois de renomear o `z` da raiz, a confirmação mostra as contagens;
   - confirmar a exclusão e conferir no disco que `x.md` e `y.md` estão na raiz e `foto.png` está em `.trash/A/sub/`;
   - com o filtro em `A`, depois de excluir, o filtro volta para Todos.
4. Repetir no tema claro e no escuro, conferindo o destaque do alvo de soltura.
5. `npm run build && systemctl --user restart prompt-library`.
