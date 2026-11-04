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

- Verificar se o transcript da sessão guarda na íntegra os textos grandes colados (que aparecem na tela como `[Pasted text #N]`); a fidelidade da Captura depende disso.
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
