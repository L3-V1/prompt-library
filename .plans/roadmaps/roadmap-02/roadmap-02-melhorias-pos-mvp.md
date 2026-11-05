---
titulo: "Roadmap: melhorias pós-MVP da Biblioteca de Prompts"
data: 2026-11-05
status: aprovado
tipo: roadmap
numero: "02"
triagem: ok
---

# Roadmap: melhorias pós-MVP da Biblioteca de Prompts

## Contexto

O roadmap-01 (M0 a M6) foi encerrado em 2026-11-05. No encerramento do M6, três pendências ficaram com destino "Plano avulso":
- Variáveis `{{...}}`;
- progresso da Análise com `stream-json`;
- arrastar entre Coleções e excluir Coleção.

Uma sessão de grilling definiu o escopo de cada uma e acrescentou um comando de terminal para abrir o app. As decisões estão em `DECISIONS.md`, seção "2026-11-05: Escopo dos planos avulsos pós-MVP", decisões 107 a 119.

Este roadmap (roadmap-02) reúne esses quatro assuntos num só lugar, assim o `/spec-kit:plan-status` consegue apontar a próxima etapa. A decisão 107 continua valendo: cada marco é um plano separado, com branch e encerramento próprios, na ordem que ela fixou. Cada marco é detalhado no plan mode quando chegar a vez dele. Este documento só fixa o escopo, as dependências e o que conta como "pronto".

Regras que valem para todos os marcos (as mesmas do roadmap-01):
- código e textos em pt-BR, com identificadores sem acento (decisão 44) e sem travessão de ênfase;
- termos do `GLOSSARY.md`;
- uma branch por marco (`feat/milestone-NN-<slug>`);
- commit só quando o usuário pedir;
- `npm run typecheck`, `npm run lint`, `npm test` e `npm run build` passando;
- decisões novas registradas em `DECISIONS.md`, a partir da 120.

## M0: Comando `prompt-library`

Decisões 108, 109 e 110.

- `scripts/prompt-library.mjs` (executável, com shebang `#!/usr/bin/env node`), nesta ordem:
  1. faz um `GET http://127.0.0.1:5174/api/...` curto para ver se o app responde;
  2. se não responder e a unidade `prompt-library.service` existir (no mesmo caminho que o `scripts/servico.mjs` usa, respeitando `XDG_CONFIG_HOME`), roda `systemctl --user start prompt-library` e consulta de novo até a porta responder ou o tempo esgotar;
  3. se a unidade não existir, sai com erro e sugere `npm run servico:instalar`;
  4. abre a URL com `xdg-open`, sem esperar o processo dele.
- **Limite de tempo** (pendência da seção de 2026-11-05): proposta de 10 s, consultando a cada 250 ms. Fica confirmado no plano do marco.
- `scripts/servico.mjs`:
  - `instalar` cria o symlink `~/.local/bin/prompt-library` → `<repo>/scripts/prompt-library.mjs`. Symlink igual: nada muda. Symlink nosso apontando para outro lugar: refaz. Arquivo ou symlink de outra origem: avisa e não toca. A posse segue a ideia da decisão 103, só que aqui "nosso" é um symlink que aponta para um `scripts/prompt-library.mjs`;
  - `remover` só apaga o symlink se for nosso.
- O que for lógica pura (decidir a ação sobre o symlink, o laço de espera com relógio e consulta injetáveis) fica em funções testáveis, no padrão de `scripts/servico-unidade.mjs`, com testes em `scripts/*.test.ts`.
- README: seção "Abrir o app" com o comando `prompt-library`.

**Pronto quando:** com o serviço parado, `prompt-library` sobe o serviço e abre o navegador. Com o serviço rodando, abre na hora. Sem a unidade, a mensagem sugere o `servico:instalar`. Rodar `servico:instalar` duas vezes não muda nada na segunda.

## M1: Coleções (arrastar e excluir)

Decisões 111, 112 e 113.

- **Arrastar:**
  - um Prompt de `ListaPrompts.tsx` pode ser solto numa Coleção ou em "Sem coleção" em `Navegacao.tsx`, com HTML5 drag and drop nativo e sem biblioteca nova;
  - soltar chama a mesma mutação do seletor de Coleção do painel (que usa o `acervo.mover`), com o `rebasear` do editor aberto (decisão 80) e um toast;
  - o seletor de Coleção continua sendo o caminho pelo teclado;
  - o alvo de soltura ganha destaque visual enquanto o Prompt é arrastado.
- **Excluir Coleção:**
  - `acervo.excluirColecao(nome)` em `src/core/acervo.ts`, ao lado do `renomearColecao`:
    1. lista os `.md` de qualquer profundidade e os outros arquivos;
    2. confere colisões de nome em `Prompts/` **antes** de mover qualquer coisa. Havendo colisão, lança um erro novo com a lista de títulos, e a API responde 409 com esses títulos;
    3. move cada `.md` para a raiz;
    4. manda o resto para `.trash/`, usando a mesma lógica de `excluir` (`caminhoLivre` em `pastas.lixeira`);
    5. remove a pasta vazia.
  - Uma prévia (quantos Prompts vão para "Sem coleção", quantos arquivos vão para a lixeira) alimenta a confirmação. Pode ser um `GET /api/colecoes/:nome/exclusao` ou vir junto do próprio `DELETE`; isso é decidido no plano do marco.
  - Rota `DELETE /api/colecoes/:nome` em `src/server/rotas/colecoes.ts`.
  - UI: ação "Excluir Coleção" junto do renomear em `Navegacao.tsx`, abrindo o `Confirmacao.tsx` com as contagens. Uma colisão aparece num modal ou toast de erro com os títulos. Se o filtro ativo for a Coleção excluída, ele volta para "Todos".
- Prompts com Análise aberta ou com o editor aberto continuam funcionando, porque o id não muda e o watcher reindexa.

**Pronto quando:** arrastar move e atualiza a lista em todas as abas (SSE); excluir uma Coleção com subpasta e uma imagem leva os `.md` para a raiz e a imagem para `.trash/`; uma colisão não move nada e mostra os títulos.

## M2: Variáveis `{{nome}}`

Decisões 114 a 118. Detalham a decisão 28.

- Função pura `extrairVariaveis(corpo)` e `preencher(corpo, valores)`:
  - aceita só `{{nome}}`;
  - nomes repetidos viram um campo só, na ordem da primeira ocorrência;
  - os caracteres permitidos no nome (por exemplo, `[\p{L}\p{N}_-]` com espaços nas pontas aparados) ficam definidos no plano do marco;
  - fica num módulo compartilhado (`src/web/variaveis.ts` ou `src/core/`, caso a Análise também precise).
- **Formulário ao copiar:**
  - um diálogo (`Dialogo.tsx`) com um campo por Variável, que cresce com o texto, e o botão Copiar;
  - abre a partir do botão Copiar do `PainelPrompt.tsx` e do Enter da `Paleta.tsx`;
  - um Prompt sem Variáveis segue o `copiarPrompt` direto, como hoje;
  - o texto preenchido é montado no cliente a partir do corpo verbatim (`/copia`, decisão 25).
- **Memória:** `localStorage` com a chave `prompt-library:variaveis:<id>`, gravada ao copiar e lida ao abrir o formulário.
- **Destaque no editor:** uma `Decoration.mark` por `MatchDecorator`/`ViewPlugin` no `Editor.tsx`, com a classe `cm-variavel` e o token de cor no `estilos.css`, claro e escuro.
- **Análise:** `src/server/analise/prompt.ts` ganha uma instrução para preservar os `{{nome}}` e só sugerir Variáveis novas quando fizer sentido, com teste em `prompt.test.ts`.

**Pronto quando:** copiar um Prompt com `{{a}}` repetido duas vezes pede um campo, cola o texto preenchido e lembra o valor na cópia seguinte; um Prompt sem Variáveis copia direto pela Ctrl+K; o editor destaca as Variáveis nos dois temas.

## M3: Progresso da Análise com `stream-json`

Decisão 119. Complementa a decisão 97.

- **Investigação, primeiro passo do marco** (pendência da seção de 2026-11-05): rodar o `claude -p` com `--output-format stream-json --verbose --json-schema ...` num Prompt de teste e confirmar duas coisas:
  - os eventos de `tool_use` (Read/Glob/Grep, com os argumentos) chegam linha a linha;
  - o evento final `result` traz o `structured_output`.
  
  Se não trouxer, o marco para e volta para decisão, sem tentar contornar.
- `src/server/analise/claude.ts`:
  - `argumentosClaude` troca para `stream-json`;
  - o executor lê o stdout por linhas e repassa cada `tool_use` a um callback `aoAtivar(atividade)`;
  - o `lerEnvelope` passa a usar o evento `result`;
  - fixtures novas em `fixtures/` e testes em `claude.test.ts`.
- `servico.ts`: guarda a atividade atual só em memória, sem gravar em `.analises/`, e a emite por SSE (por exemplo, num campo `atividade` do evento `analise` ou num evento próprio).
- `PainelAnalise.tsx`: abaixo de "Gerando Sugestões… N s", mostra uma linha com a última atividade formatada em pt-BR ("Lendo Code review/x.md", "Buscando \"termo\"", "Listando arquivos"), com o caminho relativo a `Prompts/`. A formatação fica numa função pura testada (`analise-ui.ts`).

**Pronto quando:** numa Análise real (pela skill `run` + Playwright), a linha muda conforme o Claude lê os arquivos, e as Sugestões chegam como antes; os testes do executor cobrem stream com e sem `tool_use` e com o `result` faltando.

## Dependências e ordem

M0 → M1 → M2 → M3 (decisão 107). Nenhum marco depende de código de outro. O M2 e o M3 mexem nos dois em `PainelAnalise`/`prompt.ts`, mas em partes diferentes. Se a ordem mudar, basta replanejar o marco seguinte.

## Fora do escopo

- Selecionar vários Prompts e arrastar o grupo; reordenar Coleções (decisão 111).
- Valor padrão ou descrição das Variáveis (decisão 114); memória de valores em todos os Prompts (decisão 116).
- Sugestões aparecendo uma a uma na Análise (decisão 119).
- Linger do systemd (decisão 103).

## Arquivos críticos

- M0: `scripts/servico.mjs`, novo `scripts/prompt-library.mjs`, `scripts/*.test.ts`, `README.md`.
- M1: `src/core/acervo.ts`, `src/core/erros.ts`, `src/server/rotas/colecoes.ts`, `src/web/componentes/{Navegacao,ListaPrompts,Confirmacao}.tsx`, `src/web/dados/consultas.ts`.
- M2: novo módulo de Variáveis, `src/web/componentes/{Paleta,PainelPrompt,Editor,Dialogo}.tsx`, `src/web/estilos.css`, `src/server/analise/prompt.ts`.
- M3: `src/server/analise/{claude,servico}.ts`, `src/web/componentes/PainelAnalise.tsx`, `src/web/analise-ui.ts`, `src/web/dados/analise.ts`.

## Verificação

- Em todo marco: `npm run typecheck`, `npm run lint`, `npm test` e `npm run build`. Depois, `npm run build && systemctl --user restart prompt-library` e uma conferência no navegador (skill `run` + Playwright), nos temas claro e escuro.
- **M0:** `systemctl --user stop prompt-library && prompt-library` abre o app; `servico:instalar` rodado duas vezes; `servico:remover` apaga o symlink.
- **M1:** vault de teste (`PROMPT_LIBRARY_VAULT=<tmp>`) com uma Coleção que tenha subpasta, imagem e um nome que colida; conferir no disco o resultado das duas tentativas.
- **M2:** copiar pela Ctrl+K e pelo botão, colar e conferir o texto; recarregar a página e ver os valores lembrados.
- **M3:** a investigação registrada como decisão; uma Análise real mostrando a atividade.
- **Encerramento de cada marco:** `/spec-kit:close-cycle`. Ao fim do M3, marcar o roadmap-02 como concluído.
