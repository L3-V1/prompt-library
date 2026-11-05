# Decisões

Registro cronológico das decisões tomadas no projeto. Seções mais recentes no fim.

## 2026-11-04: Biblioteca de Prompts e comando /save

### Decisões

1. **Cada Prompt é um arquivo Markdown, com metadados (id, título, tags, favorito) em frontmatter.**
   - Por quê: fica legível, editável fora do app e versionável com git (ADR 0001).
   - Descartadas: SQLite; um arquivo JSON único.

2. **Os Prompts ficam numa pasta `Prompts/` dentro do vault Obsidian (`/home/levi/Documentos/vault/`).**
   - Por quê: ficam visíveis e editáveis no Obsidian, junto do restante do conhecimento do usuário.
   - Descartadas: pasta configurável fora do vault; pasta dentro do repositório do app.

3. **Cada Coleção é uma subpasta de `Prompts/`; um Prompt pertence a no máximo uma Coleção, e os que ficam na raiz estão "Sem coleção".**
   - Por quê: é a organização natural no Obsidian, e mover de Coleção é mover o arquivo.
   - Descartadas: Coleção como campo no frontmatter.

4. **A organização combina Tags, busca textual, Coleções e Favoritos.**
   - Por quê: escolha do usuário entre as formas de organizar e encontrar Prompts.
   - Descartadas: contagem de cópias.

5. **Arquivos com prefixo `_` dentro de `Prompts/` não são Prompts; as Diretrizes ficam em `Prompts/_Diretrizes.md`.**
   - Por quê: evita que o app confunda as Diretrizes com um Prompt e mantém o arquivo editável no Obsidian.
   - Descartadas: Diretrizes fora da pasta de Prompts; arquivo oculto `.diretrizes.md`.

6. **Arquivos `.md` criados ou renomeados no Obsidian são aceitos, e o app grava um `id` estável no frontmatter dos que não têm.**
   - Por quê: as Versões são ligadas ao `id`, então renomear ou mover o arquivo não pode desligar o Prompt do histórico.
   - Descartadas: só o app criar Prompts.

7. **Cada Prompt tem histórico de Versões, com diff e restauração.**
   - Por quê: permite perceber se um Aprimoramento piorou o Prompt no uso real.
   - Descartadas: guardar só o estado atual; histórico apenas via git automático.

8. **As Versões ficam em `Prompts/.versoes/<id>/`, geridas pelo app, e não em commits automáticos no git do vault.**
   - Por quê: o vault usa commits manuais com mensagens descritivas; commits automáticos poluiriam o histórico e poderiam levar junto alterações pendentes (ADR 0003).
   - Descartadas: commits automáticos no git do vault; Versões anexadas ao próprio arquivo.

9. **A edição manual salva de forma explícita (Ctrl+S), e cada salvamento cria uma Versão; sair com alterações pendentes pede confirmação.**
   - Por quê: autosave geraria dezenas de Versões por edição.
   - Descartadas: autosave com Versão ao sair ou após tempo ocioso.

10. **Se o arquivo mudou no disco desde que foi aberto, o app avisa ao salvar e oferece recarregar, sobrescrever ou ver o diff.**
    - Por quê: o mesmo Prompt pode ser editado no Obsidian (ou receber uma Captura) enquanto está aberto no app.
    - Descartadas: última escrita vence; recarregar ao vivo.

11. **Excluir um Prompt move o arquivo para a lixeira `.trash/` do vault.**
    - Por quê: é a lixeira que o Obsidian já usa, e as Versões continuam em `.versoes/` para recuperação.
    - Descartadas: exclusão definitiva.

12. **O Aprimoramento por IA usa o Claude Code em modo headless (`claude -p`), chamado pelo servidor do app.**
    - Por quê: aproveita a instalação e a autenticação já existentes na máquina, sem gerenciar chave de API (ADR 0002).

13. **O Claude apresenta o Aprimoramento como uma lista de Sugestões, cada uma com justificativa e trecho alterado, aceitas ou rejeitadas uma a uma.**
    - Por quê: permite decidir sobre cada mudança separadamente.
    - Descartadas: reescrita completa com diff; as duas formas juntas.

14. **Regenerar vale tanto para uma Sugestão específica quanto para a Análise inteira.**
    - Descartadas: só regenerar a Sugestão específica; só regenerar a lista inteira.

15. **Uma Análise concluída gera uma única Versão com o conjunto das Sugestões aceitas.**
    - Por quê: deixa o histórico legível e permite desfazer uma Análise inteira de uma vez.
    - Descartadas: uma Versão por Sugestão aceita.

16. **Uma Sugestão cujo trecho foi alterado por outra aceita vira Sugestão desatualizada: não pode ser aceita, só regenerada sobre o texto atual.**
    - Descartadas: descartar automaticamente; pedir ao Claude Sugestões que nunca se sobreponham.

17. **Durante uma Análise é possível editar manualmente o Rascunho; Sugestões afetadas viram desatualizadas.**
    - Descartadas: bloquear a edição manual até concluir ou descartar a Análise.

18. **Uma Análise em andamento é persistida em disco até ser concluída ou descartada.**
    - Por quê: cada Análise custa uma chamada ao Claude e alguns segundos de espera; fechar a aba ou reiniciar o servidor não deve perdê-la.
    - Descartadas: manter só em memória.

19. **O Claude é orientado pelas Diretrizes em toda Análise e, opcionalmente, por uma Instrução específica daquela Análise.**
    - Descartadas: só Instrução pontual; nenhuma orientação.

20. **Durante a Análise, o Claude tem permissão de leitura na pasta de Prompts, sem escrita.**
    - Por quê: permite consultar outros Prompts para manter consistência.
    - Descartadas: nenhuma ferramenta; leitura da pasta mais busca na web.

21. **O modelo usado na Análise é o padrão do Claude Code, com seletor para trocar.**
    - Descartadas: fixo em Opus; fixo em Sonnet.

22. **A stack é um único projeto TypeScript: backend Node leve e frontend React com Vite.**
    - Descartadas: Next.js; Python (FastAPI) com frontend separado; SvelteKit.

23. **O app escuta apenas em `127.0.0.1`, sem autenticação.**
    - Por quê: uso pessoal; o servidor executa o Claude Code na máquina e não deve ficar exposto na rede.
    - Descartadas: rede local com senha; app desktop (Tauri/Electron).

24. **A edição usa um editor de código com realce de Markdown (CodeMirror).**
    - Descartadas: textarea simples; editor com pré-visualização.

25. **Copiar envia só o corpo do Prompt, sem título nem frontmatter, por um botão Copiar e por uma paleta Ctrl+K que busca e copia com Enter.**
    - Descartadas: só o botão Copiar.

26. **O layout tem três painéis (Coleções e Tags; lista; Prompt), e a Análise abre como painel lateral do editor.**
    - Descartadas: grade de cartões com página dedicada.

27. **O tema é inspirado na identidade visual do Claude, com modos claro e escuro que seguem o sistema e alternância manual, e a interface é em pt-BR.**
    - Descartadas: só claro; só escuro.

28. **Variáveis em Prompts (`{{...}}` preenchidas antes de copiar) ficam fora do MVP.**
    - Descartadas: preencher variáveis antes de copiar já no MVP; nunca suportar variáveis.

29. **O app terá uma skill global `/save` que faz a Captura do último prompt digitado numa conversa do Claude Code.**
    - Por quê: guardar na biblioteca os prompts usados no dia a dia sem sair da conversa.

30. **O código do `/save` fica no repositório `prompt-library`, instalado por link simbólico em `~/.claude/skills/save`, e reaproveita o módulo que o servidor usa para gravar Prompts e Versões.**
    - Por quê: o `/save` evolui junto com o formato dos arquivos, sem duplicar a lógica de gravação.
    - Descartadas: skill independente direto em `~/.claude/skills/save`; plugin do Claude Code.

31. **O `/save` só roda quando invocado manualmente (`disable-model-invocation`).**
    - Descartadas: o Claude também acionar por pedido em linguagem natural.

32. **A Captura lê o texto por um script que lê o transcript da sessão atual, e não pela transcrição do Claude.**
    - Por quê: em prompts longos o Claude pode resumir, corrigir ou truncar; o script copia o texto exato.
    - Descartadas: o Claude transcrever a partir do contexto.

33. **O `/save` pega por padrão a última mensagem digitada pelo usuário antes dele, ignorando slash commands; `/save N` pega a N-ésima mais recente.**
    - Descartadas: sempre a mensagem anterior ao `/save`; listar as últimas para escolher.

34. **O texto capturado é salvo literalmente, sem generalização.**
    - Por quê: generalizar é trabalho de uma Análise no app, não da Captura.
    - Descartadas: oferecer uma versão generalizada.

35. **Na Captura, o Claude propõe título, Coleção e Tags (reaproveitando os existentes) e o usuário confirma numa pergunta.**
    - Descartadas: o Claude decidir sozinho; salvar sem organização e organizar no app.

36. **Se já houver um Prompt parecido, o `/save` pergunta se o texto vira nova Versão dele ou um Prompt novo.**
    - Por quê: é comum usar um Prompt salvo, ajustá-lo na hora e querer guardar o ajuste.
    - Descartadas: sempre criar Prompt novo; só avisar duplicata exata.

37. **O `/save` grava o `.md` direto em `Prompts/` no vault, sem depender do app estar rodando.**
    - Por quê: segue o ADR 0001 e funciona com o app desligado.
    - Descartadas: via API do app; API com fallback para arquivo.

38. **O Prompt capturado registra a Origem (projeto, data e sessão do Claude Code) no frontmatter.**
    - Por quê: ajuda a lembrar o contexto original e a voltar à conversa.
    - Descartadas: registrar só a data.

39. **Se o prompt capturado tiver imagens anexadas, o `/save` grava só o texto e avisa que as imagens ficaram de fora.**
    - Descartadas: copiar a imagem para uma pasta de anexos no vault.

### Em aberto

- Verificar se o transcript da sessão guarda na íntegra os textos grandes colados (que aparecem na tela como `[Pasted text #N]`); a fidelidade da Captura depende disso. O `/save` do M2 funciona nos dois cenários (decisão 61); falta a observação real para registrar a decisão 40.
- Variáveis em Prompts foram adiadas para depois do MVP.

## 2026-11-04: M0, fundação e investigações

### Decisões

41. **A Análise chama `claude -p "<prompt>" --output-format json --json-schema '<schema de Sugestões>' --tools "Read Glob Grep" --allowedTools "Read Glob Grep" --strict-mcp-config --permission-mode default --no-session-persistence`, com cwd na pasta `Prompts/`, `--model` só quando o usuário trocar no seletor, e stdin fechado.**
    - Envelope (um objeto JSON no stdout): `type: "result"`, `subtype` (`"success"` no caso feliz), `is_error`, `structured_output` (objeto já validado pelo schema; o modelo responde chamando uma ferramenta interna `StructuredOutput`), `result` (o mesmo JSON serializado como string), `total_cost_usd`, `duration_ms`, `duration_api_ms`, `num_turns`, `permission_denials`, `session_id` e `modelUsage`. O app lê `structured_output` e trata `is_error`/`subtype` diferente de `success` como falha. O formato do envelope de erro ainda não foi observado.
    - Restrição de escrita, testada com um pedido explícito para criar arquivo: só `--allowedTools` já negava `Write`, mas as ferramentas MCP do usuário (ex.: Playwright, que executa código) continuavam visíveis e só eram barradas pelo modo `default`. Com `--tools` mais `--strict-mcp-config`, o modelo enxerga apenas `Read`, `Glob`, `Grep` e `StructuredOutput`. O `--permission-mode default` fica como segunda barreira: sem TTY, qualquer ferramenta fora da allowlist é negada e aparece em `permission_denials`.
    - Descartado: `--permission-mode plan`. Nele o modelo deixa de escrever por instrução, não por bloqueio, e o modo permite gravar o arquivo de plano.
    - Sem stdin fechado, o CLI espera 3 s por dados ("no stdin data received in 3s"). O servidor deve fazer o spawn com stdin `ignore`.
    - Latência com a configuração final (Prompt curto, 3 execuções cada): sonnet de 8,7 a 9,7 s (`duration_ms`; 10,4 a 11,4 s de parede, 4 turnos, US$ 0,012 a 0,022); haiku de 18 a 25 s (5 turnos, US$ 0,003 a 0,007). O haiku sai mais barato, mas é mais lento por usar mais turnos. A primeira chamada fica mais cara por criar o cache.

42. **O servidor HTTP é Hono com `@hono/node-server`. No dev, o Vite (`127.0.0.1:5173`) faz proxy de `/api` para o servidor (`127.0.0.1:5174`); em produção, o Hono serve o build estático de `dist/web`.**
    - Por quê: é leve, tipado e tem servidor Node oficial; um único processo em produção.

43. **No git do vault, `Prompts/.versoes/` é versionado e `Prompts/.analises/` vai para o `.gitignore`.**
    - Por quê: as Versões são histórico do usuário e entram nos commits manuais (sem conflito com o ADR 0003, que só exclui commits automáticos); as Análises em andamento são estado temporário.
    - A aplicação no vault fica para o M6.

## 2026-11-04: M1, núcleo de armazenamento

### Decisões

44. **Identificadores do código em pt-BR sem acento (`titulo`, `colecao`, `listar()`, `ConflitoError`).**
    - Por quê: acompanham a linguagem do domínio (GLOSSARY.md) e as chaves do frontmatter.

45. **O nome do arquivo acompanha o título: criar usa o título como nome, mudar o título no app renomeia o `.md` e mover de Coleção também usa o título. Sem `titulo` no frontmatter, o título é o nome do arquivo.**
    - O nome passa por `nomeSeguro`: remove `/ \ : * ? " < > | # ^ [ ]` e os prefixos `.` e `_` (que deixariam o arquivo oculto ou fora da varredura), limita a 120 caracteres e usa "Sem título" se ficar vazio. Em colisão, sufixo " 2", " 3"…
    - Descartadas: nome de arquivo pelo id; nome fixo na criação.

46. **Coleção tem um nível só: é a subpasta direta de `Prompts/`; `.md` em níveis mais fundos pertencem à Coleção do primeiro nível.** Pastas com prefixo `_` ou `.` não são Coleções e são ignoradas pela varredura.
    - Descartadas: Coleções aninhadas.

47. **Frontmatter com chaves em pt-BR: `id`, `titulo`, `tags`, `favorito` e `origem` (`projeto`, `data`, `sessao`). `tags` ausente vale `[]` e `favorito` ausente vale `false`.**
    - O corpo é tudo depois do `---` de fechamento e é preservado byte a byte, assim como BOM e `\r\n`. Campos desconhecidos, comentários e ordem são preservados (lib `yaml`, API `Document`).
    - Arquivo sem frontmatter é Prompt. Frontmatter com YAML inválido (ou que não é um mapa) torna o arquivo um problema da listagem, nunca regravado.
    - `id` fora do formato `[A-Za-z0-9_-]{1,64}` é tratado como ausente e substituído, porque vira nome de pasta em `.versoes/`.

48. **Id duplicado (arquivo copiado no Obsidian): o arquivo com `mtime` mais antigo mantém o id; os outros recebem id novo.**

49. **Versão é o snapshot verbatim do `.md` em `Prompts/.versoes/<id>/<AAAAMMDDTHHmmssSSSZ>-<motivo>.md`, com data e motivo só no nome do arquivo.** Motivos: `criacao`, `manual`, `analise`, `captura`, `restauracao`. Em colisão de milissegundo, o carimbo avança.
    - Descartadas: arquivo auxiliar de metadados; guardar só o corpo.

50. **No primeiro save de um Prompt sem Versões (vindo do Obsidian), o estado atual do disco é registrado antes como Versão `criacao`, para o diff ter base.** Um save que não muda nada não cria Versão.

51. **`favoritar` e `mover` não criam Versão nem exigem `baseHash`: são mudanças de organização, não de conteúdo.**

52. **`restaurar` aplica `titulo`, `tags` e `corpo` da Versão por meio de `salvar` (motivo `restauracao`), mantendo Favorito, Coleção e campos desconhecidos atuais.** Por isso cria uma nova Versão e respeita o conflito.

53. **Dependências do núcleo: `yaml` (frontmatter), `diff` (`diffLines` das Versões) e `nanoid` (id de 12 caracteres `[0-9a-z]`).**
    - Descartada: `gray-matter`, que re-serializa via js-yaml e perde a formatação.

54. **A raiz do vault vem de `PROMPT_LIBRARY_VAULT`, com padrão `/home/levi/Documentos/vault`.** Os testes usam vaults temporários.

## 2026-11-04: M2, skill /save

### Decisões

55. **A skill chama um wrapper bash `skills/save/capture`, que resolve o caminho real com `readlink -f` (a skill é um symlink) e faz `exec` do `tsx` do repositório em `capture.ts`, com `--tsconfig` do próprio repositório.**
    - O CLI tem os subcomandos `extract`, `context` e `write`, sempre com JSON no stdout; erros saem como `{ "erro": "..." }` e código 1.
    - Por quê: reaproveita o núcleo em TypeScript sem passo de build; o `--tsconfig` evita que o `tsconfig.json` do projeto aberto interfira.
    - Descartadas: compilar a skill para JS; duplicar a gravação num script independente.

56. **O texto capturado fica numa Captura temporária em `<tmpdir>/prompt-library-capturas/<id>.json` (modo 0600), entre o `extract` e o `write`. O `extract` devolve só uma prévia de 500 caracteres; a Captura é apagada depois do `write` e as abandonadas somem depois de 24 h.**
    - Por quê: o texto completo nunca passa pelo Claude nem por argumentos de linha de comando (decisões 32 e 34).

57. **Mensagem digitada é a linha `type: "user"` do transcript que não é `isMeta`, `isSidechain` nem `isCompactSummary`, não tem `origin.kind` diferente de `human`, não contém `tool_result` e não começa com `<command-name>`, `<command-message>`, `<local-command-*>`, `<bash-*>`, `<task-notification>` nem `[Request interrupted by user`.** O texto é o `content` string ou a junção (com `\n`) dos blocos `text`, sem os blocos injetados pela IDE (`<ide_…>`) e `<system-reminder>`; os blocos `image` só são contados. Linhas inválidas e `uuid` repetido são ignorados.
    - O transcript é `projects/<slug>/<CLAUDE_CODE_SESSION_ID>.jsonl` (procurado em todas as pastas de `projects/` se não estiver na do cwd); sem o id de sessão, usa o `.jsonl` mais recente da pasta do cwd.
    - `origin.kind: "human"` não está em todas as linhas digitadas, então não serve de critério único.

58. **Prompt parecido é o que tem Jaccard de palavras (minúsculas, sem acentos, 2+ caracteres) de pelo menos 0,4 com o texto; o `context` devolve até 3, do mais para o menos parecido. Corpo igual ao texto (ignorando quebras de linha no fim) é `identico` e faz o `/save` parar sem gravar.** A skill recomenda "nova Versão" a partir de 0,7.
    - Descartadas: similaridade por embeddings ou pelo Claude; distância de edição.

59. **A Origem grava o cwd absoluto da mensagem em `projeto`, a data ISO da mensagem e o id da sessão.**
    - Por quê: permite voltar à conversa com `cd <projeto> && claude -r <sessao>`.

60. **A nova Versão por Captura (`write --versao-de`) troca só o corpo; título, Tags, Favorito, Coleção e Origem do Prompt existente ficam. Usa o hash guardado no `context` e, se o arquivo mudou depois disso, falha com "o Prompt mudou desde a análise; rode o /save de novo".**
    - `--versao-de` só aceita um dos parecidos daquela Captura e não aceita `--titulo`, `--colecao` nem `--tag`.

61. **Marcadores `[Pasted text #N …]` no texto são trocados pelo conteúdo colado, lido da entrada de `history.jsonl` com o mesmo `display` (da mesma sessão; na falta, do mesmo projeto; a de timestamp mais próximo): `pastedContents[N].content` ou `paste-cache/<contentHash>.txt`. Marcador sem conteúdo encontrado aborta a Captura.**
    - Por quê: a skill não grava texto incompleto. Se o transcript já trouxer o texto integral, não há marcador e nada é trocado.

62. **A instalação é `npm run save:install`, que cria o link `~/.claude/skills/save` → `<repo>/skills/save` (respeitando `CLAUDE_CONFIG_DIR`). Se o link já aponta para o repositório, não faz nada; se existe outra coisa no lugar, falha sem tocar nela.**

## 2026-11-04: M3, API do servidor

### Decisões

63. **A API REST fica sob `/api` (Hono, `127.0.0.1:5174`): `prompts` (listar, ler, criar, salvar, Coleção, Favorito, excluir, `copia`), `prompts/:id/versoes` (listar, ler, `diff`, `restaurar`), `colecoes`, `tags`, `diretrizes` e `eventos`.** `criarApp(deps)` monta o app sem rede (testes com `app.request()`) e exporta `AppType` para o cliente `hc` do M4; `main.ts` só monta as dependências, liga o watcher e chama `serve`.

64. **Todo erro responde `{ erro, codigo }` em pt-BR, por um único `app.onError`.** 404 para Prompt, Versão, Coleção ou rota inexistentes; 400 para validação (`codigo: 'validacao'`), JSON malformado e Coleção inválida; 409 para Coleção repetida e conflito; 415 para escrita sem JSON; 403 para Host ou Origin recusados; 500 com log no console para o resto.

65. **O 409 de conflito traz `atual` (o Prompt, ou `{ conteudo, hash }` das Diretrizes, como está no disco) e `diff = diffLines(texto enviado, texto no disco)`.** Para Prompts, o texto é o corpo; sem corpo no pedido (só título ou Tags, ou `restaurar`), o diff vem vazio.
    - Por quê: dá à interface o que a decisão 10 pede (recarregar, sobrescrever ou ver o diff) sem outra ida ao servidor.

66. **O índice em memória é relido inteiro a cada mudança (o acervo é pequeno), com single-flight: uma releitura por vez, e os pedidos feitos durante ela compartilham uma única rodada seguinte.** As mudanças são calculadas por id, comparando hash e caminho: `{ criados, alterados, removidos }`. Só emite evento se algo mudou (Prompts, conjunto de Coleções ou problemas).
    - As rotas de escrita chamam o acervo e depois `await indice.atualizar()`, então a resposta e a leitura seguinte já veem o novo estado e a releitura disparada pelo watcher não gera evento repetido.
    - As leituras (`GET`) vêm do índice; a escrita sempre confere o hash no disco, então um índice atrasado nunca sobrescreve uma edição externa.
    - Descartadas: atualização incremental por arquivo.

67. **O watcher é o `chokidar` sobre `Prompts/`, ignorando qualquer segmento que comece com `.` (`.versoes`, `.analises`, temporários do `gravarAtomico`), com `awaitWriteFinish` de 100 ms e debounce de 150 ms antes de reler.** Reage a `.md` e a pastas; `_Diretrizes.md` gera o evento `diretrizes` (só quando o hash muda). Na partida, cria `Prompts/` se faltar.

68. **Eventos por SSE em `GET /api/eventos`: `acervo` (`{ criados, alterados, removidos }`), `diretrizes` (`{ hash }`) e `ping` (na conexão e a cada 30 s).** O M4 invalida as queries a partir deles e detecta quando o Prompt aberto mudou fora.
    - Descartada: WebSocket (só há tráfego do servidor para o navegador).

69. **A listagem devolve Resumos (Prompt sem `corpo`); a cópia é `GET /api/prompts/:id/copia` em `text/plain` com o corpo verbatim (decisão 25).** A busca normaliza caixa e acentos, exige todos os termos em título, Tags ou corpo e ordena por pontuação (título 3, Tag 2, corpo 1 por termo), depois Favoritos e título; sem `q`, por título. O filtro `colecao=` vazio é "Sem coleção"; o filtro de Tag ignora caixa e acentos.

70. **Diretrizes têm `baseHash` (`null` = o arquivo não existia) e não têm Versões.** Arquivo ausente vale `{ conteudo: '', hash: null }`.

71. **Proteção do loopback, além da decisão 23: o `Host` precisa ser `127.0.0.1` ou `localhost` nas portas 5173 ou 5174 (barra DNS rebinding); `POST`, `PUT` e `PATCH` exigem `Content-Type: application/json` (e `DELETE` também, se tiver corpo), e, se houver `Origin`, ela precisa ser uma dessas origens (barra CSRF de outra página aberta no navegador).**
    - Por quê: o M5 vai executar o `claude` a partir desta API.

72. **Validação com `zod` (dependência direta, também usada no M5) e `@hono/zod-validator`, com as mensagens do locale `pt-BR` do zod.**

73. **`normalizar` (minúsculas, sem acentos) foi para o núcleo (`src/core/texto.ts`), compartilhada pela busca do servidor e pela similaridade do `/save`.**

## 2026-11-04: M4, interface base

### Decisões

74. **Os tipos da API chegam ao navegador pelo cliente `hc<AppType>` do Hono, importado com `import type` de `src/server/app.ts`; o `tsconfig.web.json` referencia o `tsconfig.node.json`, e o `typecheck` passou de `tsc -b --noEmit` para `tsc -b`.**
    - O `--noEmit` com referência entre projetos falha (TS6310: projeto referenciado não pode desligar a emissão). O `tsc -b` emite em `dist/.tsc/`, fora do git.
    - O tipo do Prompt no navegador é o inferido pelo `hc` (`InferResponseType`), não o `Prompt` do núcleo, porque o JSON torna `origem` `?: … | undefined`, que o `exactOptionalPropertyTypes` não aceita como `Prompt`. `Change`, `Versao`, `Mudancas`, `CorpoConflito` e afins vêm do núcleo e do servidor como `import type`; nada de código de Node entra no bundle.
    - `pedir(res)` devolve o JSON, lança `ConflitoApi { atual, diff }` no 409 de conflito e `ErroApi { status, codigo }` com a mensagem pt-BR do servidor nos outros erros.

75. **Os módulos de dados do navegador ficam em `src/web/dados/`, não em `src/web/api/`.**
    - Por quê: no dev, o proxy `/api` do Vite capturava os próprios módulos (`/api/consultas.ts` dava 404).

76. **Estilo com Tailwind v4 (`@tailwindcss/vite`): os tokens do tema são variáveis CSS em `:root`, trocadas por `[data-tema="escuro"]` e expostas ao Tailwind com `@theme inline`; a variante `dark` segue `data-tema`.** A preferência (`sistema | claro | escuro`) fica no `localStorage`; em `sistema`, um `matchMedia` resolve o tema. Um script inline no `index.html` aplica o tema antes do primeiro paint.
    - O terracota de marca (`#C96442`/`#D97757`) fica em ícones, foco e realces; texto e fundo de botão no claro usam `#B05535`, que tem contraste AA com branco e com o creme.

77. **Dados do servidor com TanStack Query, `staleTime: Infinity` e sem refetch por foco: quem invalida é o SSE.** O evento `acervo` invalida `prompts`, `colecoes` e `tags`, e `prompt`, `versoes` e `diff` de cada id alterado ou removido; `diretrizes` invalida `['diretrizes']`. Ao reconectar o `EventSource`, tudo é invalidado e o editor aberto confere o próprio Prompt.

78. **O estado de navegação fica na URL (`?colecao=&tag=&favoritos=1&q=&p=<id>` e `?vista=diretrizes`), com `pushState`/`popstate` e sem router.** `colecao=` vazio é "Sem coleção". A busca usa `replaceState`, para não encher o histórico.

79. **O editor é o CodeMirror 6 com wrapper próprio: o `EditorView` é criado por documento e o conteúdo trocado por fora entra como transação.** `basicSetup`, Markdown com `language-data` para os blocos de código, quebra de linha, tema e realce ligados aos tokens CSS, e `Mod-s` salvando.

80. **O editor aberto guarda `{ base, rascunho }` e reage às versões do Prompt vindas do servidor (SSE, Favorito, Coleção) por hash e conteúdo: hash igual à base é ignorado; conteúdo igual ao rascunho ou à base troca só a base (é o próprio salvar, ou só Favorito e Coleção mudaram); sem pendências, recarrega com o aviso "Atualizado fora do app"; com pendências, mostra a faixa "Este Prompt mudou no disco".**
    - Depois de Favorito e Coleção (decisão 51) a base é trocada pelo Prompt devolvido (o `rebasear`), senão o Ctrl+S seguinte daria 409 falso. A comparação de conteúdo também cobre o evento SSE que chega antes da resposta do próprio `PUT`.
    - Salvar manda só os campos alterados; sem alterações, não chama a API. Se o rascunho não mudou durante o pedido, adota o título e as Tags normalizados pelo servidor.
    - As Diretrizes seguem a mesma regra, por hash.

81. **O conflito (decisão 10) abre um modal com Recarregar, Sobrescrever (repete o pedido com o hash do disco) e Ver diferenças (o seu texto à esquerda, o do disco à direita).** Quando só título ou Tags diferem, o diff vem vazio e o modal mostra os metadados lado a lado. A faixa de mudança externa usa o mesmo modal, com o diff calculado no navegador.

82. **Sair com pendências (trocar de Prompt, abrir Diretrizes ou "Novo Prompt", voltar no navegador) passa por "Descartar alterações?" com Salvar, Descartar e Continuar editando; fechar a aba usa `beforeunload`.** No `popstate`, a URL anterior é reposta antes de perguntar.

83. **Copiar (botão e paleta) usa o texto salvo, por `GET /api/prompts/:id/copia`; com pendências, o aviso diz "Copiado o texto salvo; há alterações não salvas".**

84. **A paleta Ctrl+K é o `cmdk` dentro de um `<dialog>`, com `shouldFilter={false}` e os resultados da busca do servidor (a mesma ordem da lista); sem busca, os Favoritos vêm primeiro. Enter copia e fecha; Ctrl+Enter abre o Prompt.** O atalho é ouvido em captura, para funcionar com o foco no CodeMirror. A seleção é controlada e volta ao primeiro item quando a lista muda, porque o `cmdk` não reescolhe sozinho com a lista vinda de fora.

85. **O diff lado a lado é montado no navegador a partir do `Change[]` do servidor: remoções e adições consecutivas são emparelhadas linha a linha, e a última linha sem `\n` é marcada.** Nas Versões, a esquerda é sempre a mais antiga: "comparar com atual" é Versão → atual, e "com a Versão anterior" é anterior → escolhida.

86. **Restaurar uma Versão fica bloqueado enquanto há alterações não salvas ("salve ou descarte antes"); o 409 abre o mesmo modal de conflito.**

87. **Diálogos são o `<dialog>` nativo com `showModal()` (foco preso, Esc, backdrop), e o foco inicial vem de `data-autofocus`, aplicado depois do `showModal`.**
    - Por quê: o `autoFocus` do React roda antes do `showModal` do efeito e se perde.
    - Descartadas: bibliotecas de diálogo (Radix, Headless UI).

## 2026-11-04: M5, Análise

### Decisões

88. **A Análise vale só para o corpo do Prompt.** Título, Tags, Favorito e Coleção ficam de fora; durante a Análise, título, Tags, Versões/restaurar e Salvar ficam travados, enquanto Favorito, Coleção, Copiar e Excluir continuam livres.

89. **Modelo: `Analise { promptId, baseHash, corpoOriginal, rascunho, instrucao, modelo, sugestoes, execucao, erro, ultimaExecucao?, criadaEm, atualizadaEm }` e `Sugestao { id, justificativa, trechoOriginal, trechoNovo, status, inicio }`, persistidos em `Prompts/.analises/<promptId>.json` (gravação atômica, leitura validada com zod).** Uma Análise por Prompt.
    - `aceita` e `rejeitada` são decisões gravadas; `pendente` e `desatualizada` saem do Rascunho e são recalculadas a cada mudança dele.
    - Um JSON ilegível vira erro claro (409 `analise_invalida`) e nunca é sobrescrito; só Descartar o apaga.

90. **A Sugestão é localizada por busca exata, usando o offset `inicio` como pista: se o trecho está na pista, fica; senão, vale a ocorrência mais próxima dela; sem ocorrência, a Sugestão fica `desatualizada` (`inicio: null`).** A cada edição, a pista é deslocada pela edição `{ pos, removidos, inseridos }` (conhecida ao aceitar; inferida pelo prefixo e sufixo comuns no `PUT` do Rascunho). Uma edição dentro do trecho o desatualiza; desfazer a edição faz a Sugestão voltar a `pendente`.
    - Aceitar só vale para `pendente`; uma Sugestão sobreposta à aceita perde o trecho e fica desatualizada. Rejeitar vale para `pendente` e `desatualizada`.

91. **Sugestões geradas cujo trecho não existe no Rascunho são descartadas, assim como as que não mudam nada e as que repetem uma rejeitada; o total aparece no painel.** Regenerar tudo mantém as aceitas e as rejeitadas e troca as pendentes e desatualizadas; regenerar uma troca só ela, na mesma posição da lista.
    - As rejeitadas vão no texto mandado ao Claude ao regenerar, para não serem repetidas. Por isso ficam na lista depois de regenerar tudo (o plano previa manter só as aceitas).

92. **Pastas e identificadores da Análise em pt-BR: `src/core/analise/`, `src/server/analise/`, `rotas/analise.ts` (e não `analysis/`, como no roadmap; decisão 44).**

93. **O executor é um adaptador injetável (`ExecutorClaude`); o real faz `spawn` do binário de `PROMPT_LIBRARY_CLAUDE` (padrão `claude`) com as flags da decisão 41, o `--json-schema` gerado por `z.toJSONSchema` e o prompt logo depois do `-p`.**
    - Timeout de 300 s: SIGTERM e, 5 s depois, SIGKILL; o mesmo ao cancelar ou descartar. Ao desligar o servidor, os jobs são abortados.
    - Um pedido acima de 100 KB falha antes do spawn: o Linux limita um único argumento a 128 KiB.
    - O `--json-schema` é gerado em draft-07 e sem a chave `$schema`: o `claude` recusa o `$schema` draft 2020-12 que o zod põe por padrão ("no schema with key or ref").
    - `CLAUDECODE` e `CLAUDE_CODE_ENTRYPOINT` não passam ao processo filho, para o servidor funcionar mesmo iniciado de dentro de uma sessão do Claude Code.
    - Erros em pt-BR: binário ausente ("Claude Code não encontrado…"), timeout, código diferente de 0 (com o `result` ou o fim do stderr), JSON inválido, `is_error`/`subtype` diferente de `success` e saída fora do schema.

94. **As escritas de cada Prompt (rotas e fim de job) passam por uma fila própria (cadeia de promises), e os jobs vivos ficam num `Map` com `AbortController`.** Um job que termina depois de cancelado ou descartado é ignorado. Uma `execucao` gravada sem job vivo é de antes de um reinício e vira o erro "A execução foi interrompida (servidor reiniciado).", com Tentar de novo.
    - Com um job rodando, regenerar e concluir respondem 409 `analise_em_execucao`; iniciar com uma Análise já existente, 409 `analise_existente`.

95. **Novo evento SSE `analise`: `{ promptId, analise }` (`null` ao concluir ou descartar), emitido a cada gravação.** O navegador grava o estado no cache do TanStack Query (`['analise', id]`) em vez de invalidar, ignorando um evento mais antigo que o do cache.

96. **O Rascunho é editado no editor principal (documento `id:analise`), e o painel lateral só tem as Sugestões.** A tela é a dona do texto: as edições vão por `PUT .../rascunho` com espera de 400 ms; antes de cada ação (e no Ctrl+S, que mostra "Rascunho salvo" sem criar Versão) o envio pendente é feito. O texto do servidor só entra ao abrir a Análise e com a resposta das ações. Trocar de Prompt ou fechar a aba manda o que faltar (`fetch` com `keepalive`).
    - Iniciar fica bloqueado com alterações não salvas no Prompt ("salve ou descarte antes").
    - Passar o mouse ou focar um card destaca o trecho no editor (decoration do CodeMirror) e rola até ele.

97. **O progresso mostra só a fase ("Gerando Sugestões…" com o tempo decorrido), com `--output-format json`.** O streaming (`stream-json`) ficou fora do M5.

98. **Concluir grava o Rascunho como corpo por `acervo.salvar(..., baseHash, 'analise')`: uma única Versão `analise`, e o JSON é apagado.** Se o Prompt mudou fora desde o início, responde o 409 de conflito com `diff(rascunho, disco)`, e o modal oferece Ver diferenças, Cancelar (a Análise continua) e Sobrescrever (conclui com o hash do disco). Se só os metadados mudaram (corpo igual ao `corpoOriginal`, por exemplo Favorito), conclui sem conflito. Uma faixa avisa quando o corpo no disco mudou durante a Análise.

99. **Excluir um Prompt descarta a Análise dele.**

100.  **O SSE se recupera de um reinício do servidor: o `ping` passou de 30 s para 15 s (revê a decisão 68), e o navegador recria o `EventSource` quando ele fecha de vez ou quando fica 25 s sem nada.** Por quê: no dev, o proxy do Vite segura a conexão depois que o servidor cai (o navegador não vê erro) e responde 502 às reconexões (o `EventSource` desiste com erro HTTP); sem isso, a tela ficava em "Gerando…" e nunca mostrava a execução interrompida.

## 2026-11-05: M6, acabamento

### Decisões

101. **`npm start` é build + servidor (`npm run build && npm run serve`); o `serve` é o antigo `start` (`NODE_ENV=production node dist/server/main.js`).**
     - Por quê: o roadmap pedia "build + servidor", e o `serve` fica para quem já tem o build (o serviço chama o `main.js` direto).

102. **Em produção, o servidor acha `dist/web` a partir do próprio arquivo (`new URL('../web/', import.meta.url)`), e não do cwd.** O `serveStatic` do `@hono/node-server` 2.x aceita raiz absoluta (faz `path.join`).
     - Sem `dist/web/index.html`, sai com "Build não encontrado (…): rode `npm run build`".
     - `EADDRINUSE` na 5174 vira "Porta 5174 em uso. O serviço já está rodando? (`systemctl --user stop prompt-library`)", no `serve` e no `dev`.

103. **O app roda como serviço `systemd --user` (`prompt-library.service`), que sobe no login, sem linger.** `npm run servico:instalar` e `servico:remover` (`scripts/servico.mjs`), no padrão do `save:install` (decisão 62).
     - A unidade usa caminhos absolutos: `ExecStart` com o `process.execPath` da instalação, `PATH` com o dir do node, o do claude e os do sistema, e `PROMPT_LIBRARY_CLAUDE` absoluto (de `PROMPT_LIBRARY_CLAUDE` ou da busca no `PATH`). Por quê: o systemd não herda o `PATH` do shell, e o node e o claude ficam fora dos dirs do sistema (`/opt/node-…`, `~/.local/bin`).
     - Sem claude encontrado, instala assim mesmo e avisa que a Análise vai falhar. `PROMPT_LIBRARY_VAULT` só entra na unidade se estiver definida na instalação.
     - Posse pelo cabeçalho "# Gerado por prompt-library": unidade igual não muda nada; nossa, regrava (`daemon-reload` e `restart`); de outra origem, falha sem tocar. O `remover` só apaga a nossa.
     - A geração é uma função pura (`scripts/servico-unidade.mjs`, com tipos em `.d.mts`) e testada; `scripts/` entrou no Vitest e no `tsconfig.node.json`. Valores com `%` viram `%%`; com espaço, vão entre aspas.
     - Descartada: linger (`loginctl enable-linger`), desnecessário para um app usado só com a sessão aberta.

104. **A lista de Prompts mostra um ícone (o mesmo do botão Analisar) nos Prompts com Análise aberta, com `title`/`aria-label` "Análise em andamento".** `GET /api/analises` → `{ ids }` (os `*.json` de `.analises/`), em cache na chave `['analises']`.
     - O conjunto é acertado no `guardarAnalise`, que recebe tanto o evento SSE `analise` quanto as respostas das ações locais: entra com a Análise e sai com `null`. Sem a lista no cache, nada é criado. O `reconectado` já invalida tudo.
     - Uma Análise com erro ou interrompida também conta: ela continua aberta até concluir ou descartar.

105. **A decisão 43 foi aplicada: `Prompts/.analises/` está no `.gitignore` do vault, com um comentário.** Sem commit no vault (os commits lá são manuais, ADR 0003); `Prompts/.versoes/` segue versionado.

106. **Revisão de UI com `ui-ux-kit:ui-guidelines`.**
     - Os botões (`.botao`, `.botao-primario`, `.botao-perigo`) não quebram linha, e o `.botao-perigo` ganhou o estado desabilitado dos outros.
     - Nova classe `.selo` para selos e chips curtos (status da Sugestão, "mais recente", Tags na lista): uma linha, com reticências se não couber. As Tags do editor também cortam com reticências, com o nome inteiro no `title`.
     - As faixas abaixo do cabeçalho (removido, mudou no disco, Análise em andamento, Diretrizes vazias) usam o padding do cabeçalho (`px-4 md:px-6`), e os cabeçalhos das gavetas (Versões, Análise) usam `px-4`.
     - Sem Versões, a gaveta mostra o estado vazio "Ainda não há Versões" (com ícone) no lugar de "Escolha uma Versão", e a lista some.
     - O botão de fechar o aviso (toast) virou `botao-icone` de 28 px, um alvo de toque maior.
     - O Favorito na lista ganhou nome acessível ("Favorito"), como o indicador de Análise.

## 2026-11-05: Escopo dos planos avulsos pós-MVP

### Decisões

107. **As pendências que ficaram para planos avulsos viram planos separados em `.plans/`, um por assunto, implementados nesta ordem: comando `prompt-library`, Coleções, Variáveis, progresso com `stream-json`.**
     - Por quê: os assuntos não dependem um do outro, e cada um ganha branch e encerramento próprios. O comando vem primeiro por ser o menor, e as Coleções em seguida porque são o menor dos outros três e o mais usado no dia a dia. O `stream-json` fica por último porque é o menos urgente.
     - Descartadas: dois planos (Coleções e `stream-json` juntos); um plano único; não fixar ordem; Variáveis antes das Coleções.

108. **Um comando de terminal `prompt-library` abre o app (`http://127.0.0.1:5174`) no navegador com `xdg-open`.** Está fora das pendências do M6 e foi incluído nesta conversa, num plano próprio.
     - Por quê: abrir o app sem precisar lembrar a URL.
     - Descartados: os nomes `prompts` e `biblioteca`; incluir o comando no plano das Coleções; deixá-lo para o fim.

109. **Se o app não responder, o comando `prompt-library` roda `systemctl --user start prompt-library` quando a unidade existe e espera a porta responder, com limite de tempo, antes de abrir. Sem a unidade, sugere `npm run servico:instalar`.**
     - Descartadas: só avisar sem abrir; abrir sem checar.

110. **O `npm run servico:instalar` cria o symlink `~/.local/bin/prompt-library`, que aponta para um script do repositório, e o `servico:remover` o apaga. Os dois são idempotentes e só mexem no symlink que é deles, como na unidade (decisão 103).**
     - Por quê: `~/.local/bin` já está no `PATH`, e o comando acompanha o serviço.
     - Descartadas: um script npm próprio (`comando:instalar`); só documentar o `ln -s` no README.

111. **Arrastar entre Coleções: arrasta-se um Prompt por vez da lista para uma Coleção ou para "Sem coleção" no painel de navegação, usando a operação de mover que já existe.**
     - Descartadas: arrastar vários Prompts com seleção múltipla; reordenar Coleções arrastando, o que exigiria guardar a ordem.

112. **Ao excluir uma Coleção, todos os `.md` dela, inclusive os de subpastas (decisão 46), vão para "Sem coleção", e o resto (imagens, outros arquivos) vai para `.trash/` do vault. A confirmação diz quantos itens são afetados.**
     - Por quê: era o ponto que impedia a exclusão no M6, porque faltava decidir o destino dos Prompts da Coleção.
     - Descartadas: só permitir excluir uma Coleção vazia; mandar os Prompts para a lixeira junto; bloquear se houver arquivos extras; mover os extras para a raiz de `Prompts/`.

113. **Se algum Prompt da Coleção excluída tiver o mesmo nome de arquivo que um Prompt de "Sem coleção", a exclusão confere tudo antes, não move nada e lista os títulos em conflito para o usuário renomear.**
     - Descartadas: renomear com sufixo " (2)"; mover só os que não colidem.

114. **As Variáveis usam só a sintaxe `{{nome}}`, sem valor padrão nem descrição. O mesmo nome repetido no texto vira um campo só.** Detalha a decisão 28, que tirou as Variáveis do MVP.
     - Por quê: é simples e continua legível no Obsidian.
     - Descartadas: `{{nome|padrão}}`; padrões e descrições declarados no frontmatter.

115. **O formulário das Variáveis abre ao copiar, tanto na Paleta Ctrl+K quanto no botão Copiar do painel do Prompt. Um Prompt sem Variáveis continua copiando direto.**
     - Descartadas: o formulário só no painel do Prompt, com a Paleta copiando o texto cru; um painel lateral fixo com pré-visualização.

116. **O formulário lembra os valores da última cópia de cada Prompt no `localStorage` do navegador, com a chave pelo id do Prompt. Nada é gravado no vault.**
     - Descartadas: não lembrar; lembrar por nome de Variável em todos os Prompts.

117. **O editor destaca levemente os `{{nome}}` no corpo do Prompt.**
     - Por quê: deixa visível que o Prompt pede preenchimento.
     - Descartada: manter o editor sem destaque.

118. **O prompt da Análise avisa que `{{nome}}` são Variáveis: as Sugestões devem preservá-las e só sugerir novas quando fizer sentido.**
     - Descartada: tratar `{{...}}` como texto comum na Análise.

119. **Com o `stream-json`, o progresso da Análise ganha uma linha abaixo da fase e do tempo com a ferramenta que o Claude está usando no momento (por exemplo, "Lendo Code review/x.md"). As Sugestões continuam chegando juntas no fim.** Complementa a decisão 97.
     - Descartadas: Sugestões aparecendo uma a uma, o que exigiria trocar o `--json-schema`; descartar o `stream-json` de vez; uma lista com todas as ações; uma lista recolhível.

### Em aberto

- Confirmar que `--output-format stream-json` funciona junto com `--json-schema` e devolve a saída estruturada no evento final, antes de planejar o `stream-json`.
- O limite de tempo que o comando `prompt-library` espera o serviço responder.
