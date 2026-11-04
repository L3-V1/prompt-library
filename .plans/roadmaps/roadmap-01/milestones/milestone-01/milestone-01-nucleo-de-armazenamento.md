---
titulo: "M1: Núcleo de armazenamento (roadmap-01)"
data: 2026-11-04
status: aprovado
tipo: milestone
numero: "01"
pai: roadmaps/roadmap-01
triagem: ok
branch: feat/milestone-01-nucleo-de-armazenamento
---

# M1: Núcleo de armazenamento (`src/core/`)

## Contexto

O M0 entregou o esqueleto (TS estrito, Vitest, Hono, Vite); `src/core/index.ts` é só `export {}`. O M1 implementa o módulo que lê e grava os Prompts como `.md` em `<vault>/Prompts/`, com Versões em `.versoes/` e detecção de conflito. O servidor (M3) e o `/save` (M2) dependem dele (decisão 30), então ele não pode depender de HTTP. **Pronto quando:** todas as operações abaixo existem, com testes unitários sobre um vault temporário, e `npm run typecheck`, `npm run lint` e `npm test` passam.

Escolhas confirmadas no planejamento:
- identificadores em **pt-BR sem acento** (`titulo`, `colecao`, `listar()`, `ConflitoError`);
- **o nome do arquivo acompanha o título**: criar usa o título como nome; mudar o título no app renomeia o `.md`; sem `titulo` no frontmatter, o título é o nome do arquivo;
- **Coleção de um nível só**: subpasta direta de `Prompts/`; `.md` em níveis mais fundos pertencem à Coleção do primeiro nível.

## Dependências novas

- `yaml` (runtime): API `Document` preserva ordem, comentários e campos desconhecidos no round-trip. Descartado `gray-matter` (re-serializa via js-yaml e perde formatação).
- `diff` (runtime, jsdiff, já traz tipos): `diffLines` para o diff de Versões.
- `nanoid` (runtime): `customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 12)` → id seguro como nome de pasta.

## Formato do arquivo

```md
---
id: k3f9x0a2m7qz
titulo: Revisão de PR
tags: [code-review, git]
favorito: true
origem: { projeto: ..., data: ..., sessao: ... }   # só Capturas (M2)
outro_campo: preservado
---
corpo literal
```
- Frontmatter com chaves em pt-BR, como o resto do vault. `tags` ausente = `[]`, `favorito` ausente = `false`.
- O **corpo** é tudo depois do `---` de fechamento, preservado byte a byte. Ao regravar só o frontmatter, o corpo não é tocado. BOM e `\r\n` do arquivo original são preservados.
- Arquivo sem frontmatter é válido (vira Prompt com id atribuído). Frontmatter com YAML inválido: o arquivo **não** é Prompt, nunca é regravado, e aparece em `problemas` do resultado da listagem.

## Estrutura de `src/core/`

| Arquivo | Conteúdo |
|---|---|
| `tipos.ts` | `Prompt { id, titulo, tags, favorito, colecao: string \| null, corpo, caminho (relativo a Prompts/), mtime, hash, origem? }`, `Origem`, `Versao { id, promptId, criadaEm, motivo, caminho }`, `MotivoVersao = 'criacao' \| 'manual' \| 'analise' \| 'captura' \| 'restauracao'`, `Problema { caminho, mensagem }` |
| `erros.ts` | `ConflitoError` (traz `hashNoDisco` e o conteúdo atual), `PromptNaoEncontradoError`, `VersaoNaoEncontradaError`, `ColecaoInvalidaError`, `ColecaoJaExisteError` |
| `config.ts` | `resolverPastas(env = process.env)`: raiz do vault por `PROMPT_LIBRARY_VAULT` (padrão `/home/levi/Documentos/vault`) → `{ vault, prompts: <vault>/Prompts, versoes: <prompts>/.versoes, lixeira: <vault>/.trash }` |
| `frontmatter.ts` | `separar(texto) → { dados: Document \| null, corpo, bom, eol }` e `juntar(...)`; leitura dos campos conhecidos com validação leve (tags não-lista vira lista de strings etc.) |
| `arquivos.ts` | `gravarAtomico(caminho, conteudo)` (tmp oculto `.<nome>.tmp-<rand>` no mesmo diretório + `rename`), `hashDe(bytes)` (sha256 hex do arquivo cru), `nomeSeguro(titulo)` (remove `/ \ : * ? " < > \| # ^ [ ]`, apara, limita tamanho, vazio vira "Sem título"), `caminhoLivre(dir, nome)` (sufixo " 2", " 3"… em colisão) |
| `ids.ts` | `novoId()` |
| `acervo.ts` | `criarAcervo(pastas)` com as operações sobre Prompts e Coleções |
| `versoes.ts` | operações de Versões, usadas pelo acervo |
| `index.ts` | reexporta a API pública |

## Regras e operações

### Varredura (`listar()` → `{ prompts, problemas }`)
- Lê `Prompts/` recursivamente; se a pasta não existir, devolve vazio (só é criada na primeira escrita).
- Ignora arquivos com prefixo `_` (ex.: `_Diretrizes.md`) e qualquer pasta ou arquivo oculto (`.versoes`, `.analises`, tmp) (decisão 5). Só `.md`.
- `colecao` = primeiro segmento do caminho relativo, ou `null` na raiz ("Sem coleção").
- **Id ausente** (decisão 6): gera um id e regrava só o frontmatter (atomicamente), inserindo `id` como primeiro campo.
- **Id duplicado** (arquivo copiado no Obsidian): o arquivo com `mtime` mais antigo mantém o id; os outros recebem id novo.
- `ler(id)` faz a varredura e devolve o Prompt (o acervo é pequeno; o índice em memória com watcher fica para o M3).

### Escrita
- `criar({ titulo, corpo, tags?, favorito?, colecao?, origem?, motivo? = 'criacao' })`: grava `<colecao>/<nomeSeguro(titulo)>.md` (com `caminhoLivre`) e cria a primeira Versão.
- `salvar(id, alteracoes: { titulo?, tags?, corpo? }, baseHash, motivo = 'manual')` (decisões 9 e 10):
  - relê o arquivo; se `hash !== baseHash`, lança `ConflitoError` com o conteúdo do disco, sem gravar;
  - se o Prompt ainda não tem Versões (veio do Obsidian), registra antes o estado atual do disco como Versão `criacao`, para o diff ter base;
  - aplica as alterações preservando campos desconhecidos, grava atomicamente, renomeia o arquivo se o título mudou e cria a Versão do novo estado;
  - devolve o Prompt atualizado (novo `hash`).
- `favoritar(id, valor)`: regrava só o frontmatter; **não** cria Versão nem exige `baseHash` (mudança de organização, não de conteúdo).
- `mover(id, colecao | null)`: move o arquivo para a subpasta (cria se preciso, `caminhoLivre` em colisão); sem Versão.
- `excluir(id)`: move para `<vault>/.trash/<nome>.md` (com `caminhoLivre`), como faz o Obsidian (decisão 11). As Versões ficam.
- `criarColecao(nome)` / `renomearColecao(antigo, novo)`: `mkdir` / `rename` da pasta. Nome passa por `nomeSeguro`; rejeita nomes com prefixo `_` ou `.` (`ColecaoInvalidaError`) e destino existente (`ColecaoJaExisteError`). `listarColecoes()` inclui pastas vazias.

### Versões (decisões 7 e 8)
- Arquivo `Prompts/.versoes/<id>/<AAAAMMDDTHHmmssSSSZ>-<motivo>.md` contendo o **snapshot verbatim** do `.md` naquele momento; os metadados (data e motivo) ficam no nome, sem arquivo auxiliar. Em colisão de milissegundo, incrementa o timestamp.
- `listarVersoes(id)`: mais recente primeiro.
- `lerVersao(id, versaoId)`: snapshot + metadados.
- `diff(id, deVersaoId, paraVersaoId | 'atual')`: `Change[]` do `diffLines` sobre o texto completo dos dois estados (a UI do M4 renderiza).
- `restaurar(id, versaoId, baseHash)`: aplica `titulo`, `tags` e `corpo` do snapshot por `salvar(..., 'restauracao')`, mantendo `favorito`, Coleção e campos desconhecidos atuais. Por passar por `salvar`, cria uma nova Versão e respeita o conflito.

## Testes (Vitest, um arquivo `*.test.ts` por módulo)

- Helper `src/core/teste/vault-temporario.ts`: cria um vault em `os.tmpdir()` com `mkdtemp`, escreve arquivos a partir de um objeto `{ 'Prompts/x.md': '...' }` e limpa no `afterEach`.
- Cobertura por regra:
  - frontmatter: round-trip preserva campos desconhecidos, comentários, ordem, corpo byte a byte, BOM e CRLF; arquivo sem frontmatter; YAML inválido vira `problema` e o arquivo fica intacto;
  - varredura: ignora `_*.md`, pastas ocultas e não-`.md`; Coleção do primeiro nível; Prompt aninhado; pasta `Prompts/` ausente;
  - id: atribuído só no frontmatter (corpo idêntico), estável entre varreduras, duplicado resolvido pelo `mtime`;
  - escrita: atômica (nenhum tmp sobra), `criar` com colisão de nome, renomear ao mudar título, `mover`, `favoritar` sem Versão, `excluir` para `.trash/` com colisão;
  - conflito: arquivo editado "por fora" entre `ler` e `salvar` → `ConflitoError` e disco inalterado;
  - Versões: criação, Versão-base ao primeiro save de Prompt do Obsidian, ordem, diff contra `'atual'`, `restaurar` cria nova Versão e preserva `favorito`;
  - Coleções: criar, renomear, nomes inválidos, destino existente.
- Remover o teste sanity de `src/core/index.test.ts` (substituído pelos acima).

## Fora do escopo (marcos seguintes)

- Índice em memória, watcher e SSE (M3); `_Diretrizes.md` (M3); leitura de transcripts e similaridade (M2).
- A Investigação 1 (texto colado no transcript, decisão 40) continua pendente para o M2.

## Documentação

- `DECISIONS.md`: nova seção "M1, núcleo de armazenamento" com as decisões tomadas aqui: identificadores em pt-BR; arquivo acompanha o título; Coleção de um nível; formato das chaves do frontmatter; Versão = snapshot verbatim com metadados no nome; Versão-base para Prompts vindos do Obsidian; `favoritar`/`mover` não criam Versão; `restaurar` mantém `favorito` e Coleção; id duplicado resolvido pelo `mtime`; libs `yaml`, `diff`, `nanoid`; variável `PROMPT_LIBRARY_VAULT`.

## Verificação

1. `npm install`, `npm run typecheck`, `npm run lint`, `npm test`.
2. Teste manual com um vault temporário (`PROMPT_LIBRARY_VAULT=$(mktemp -d)`) via um script `tsx` descartável no scratchpad: `echo` de um `.md` sem `id` em `Prompts/Teste/`, rodar `listar()` e conferir que só o frontmatter ganhou `id`; `salvar` com `baseHash` antigo depois de editar o arquivo com `echo` → `ConflitoError`; conferir os arquivos em `.versoes/<id>/` e um `excluir` indo para `.trash/`.
3. Nada é gravado no vault real durante o M1.
4. Commit na branch `feat/milestone-01-nucleo-de-armazenamento` só quando você pedir.
