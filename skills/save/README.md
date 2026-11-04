# /save

Skill global do Claude Code que faz a **Captura** de um prompt digitado numa conversa e o grava em `Prompts/` no vault, exatamente como foi escrito, sem o app estar rodando (decisões 29 a 40 e 55 a 62 em `DECISIONS.md`).

## Instalação

```bash
npm install
npm run save:install
```

O script cria o link `~/.claude/skills/save` → `<repo>/skills/save` (ou dentro de `CLAUDE_CONFIG_DIR`, se definido). Se o link já existe e aponta para cá, não faz nada; se existe outra coisa no lugar, falha sem tocar nela. Como é um link, mudanças no repositório valem na hora; o repositório precisa continuar no mesmo lugar e com `node_modules/` instalado.

## Uso

Numa conversa do Claude Code:

- `/save`: captura a última mensagem digitada antes do `/save`.
- `/save 3`: captura a terceira mais recente.

Slash commands, saídas de comandos locais (`!`), interrupções e mensagens automáticas não contam. Textos colados (`[Pasted text #N]`) são reconstruídos a partir do `~/.claude/history.jsonl` e do `~/.claude/paste-cache/`; se o conteúdo colado não for encontrado, nada é gravado. Imagens anexadas ficam de fora (o `/save` avisa).

O Claude propõe título, Coleção e Tags e confirma numa pergunta. Se já houver um Prompt parecido, pergunta se o texto vira uma nova Versão dele (só o corpo muda) ou um Prompt novo. Um Prompt idêntico não é gravado de novo.

O vault vem de `PROMPT_LIBRARY_VAULT` (padrão `/home/levi/Documentos/vault`). Para testar sem mexer no vault real, exporte a variável antes de abrir o `claude`.

## Como funciona

A skill chama o wrapper `capture`, que roda `capture.ts` com o `tsx` do repositório:

| Comando                                                               | O que faz                                                                                                                                      |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `capture extract [N]`                                                 | Lê o transcript da sessão (`CLAUDE_CODE_SESSION_ID`), guarda o texto numa Captura temporária e devolve só uma prévia, as contagens e a Origem. |
| `capture context <captura>`                                           | Devolve as Coleções, as Tags (mais usadas primeiro) e até 3 Prompts parecidos.                                                                 |
| `capture write <captura> --titulo <t> [--colecao <c>] [--tag <t>]...` | Cria o Prompt com a Origem e uma Versão `captura`.                                                                                             |
| `capture write <captura> --versao-de <id>`                            | Grava o texto como nova Versão do Prompt parecido.                                                                                             |

A Captura temporária fica em `<tmpdir>/prompt-library-capturas/<id>.json` (modo 0600), é apagada depois do `write` e, se abandonada, some depois de 24 h. Assim o texto do prompt nunca passa pelo Claude nem por argumentos de linha de comando.

## Arquivos

- `SKILL.md`: instruções da skill.
- `capture`, `capture.ts`: wrapper e CLI.
- `transcript.ts`: localiza o transcript, filtra as mensagens digitadas e reconstrói os textos colados.
- `similaridade.ts`: Jaccard de palavras para achar Prompts parecidos.
- `capturas.ts`: Capturas temporárias.
- `fixtures/`: transcript, `history.jsonl` e `paste-cache/` anonimizados para os testes.
