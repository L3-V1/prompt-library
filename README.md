# Biblioteca de Prompts

Aplicação pessoal, local, para guardar, aprimorar e copiar os prompts usados no desenvolvimento com IA. Os Prompts são arquivos Markdown dentro de um vault do Obsidian, então continuam legíveis e editáveis fora do app (ADR 0001).

Três partes:

- **Biblioteca:** a interface web em `http://127.0.0.1:5174`, com Coleções, Tags, Favoritos, busca, editor Markdown, Versões com diff e a paleta **Ctrl+K** (busca e copia de qualquer lugar).
- **Captura:** o comando `/save` do Claude Code registra na biblioteca, exatamente como foi escrito, um prompt digitado na conversa. Gera um Prompt novo ou uma Versão nova de um parecido.
- **Análise:** o Claude examina um Prompt à luz das suas **Diretrizes** e de uma **Instrução** opcional e propõe **Sugestões** pontuais; você aceita, rejeita ou regenera cada uma, edita o **Rascunho** à vontade e, ao concluir, o Prompt ganha uma única Versão (ADR 0002).

Os termos (Prompt, Coleção, Tag, Favorito, Versão, Captura, Origem, Análise, Rascunho, Sugestão, Diretrizes, Instrução) estão definidos em [`GLOSSARY.md`](GLOSSARY.md).

## Requisitos

- Linux com `systemd` (para o serviço; sem ele, use `npm start`).
- Node.js 22 ou mais novo.
- [Claude Code](https://docs.claude.com/claude-code) instalado e autenticado, para o `/save` e para a Análise. O resto do app funciona sem ele.

## Instalação

```sh
npm ci
npm run save:install       # instala o comando /save no Claude Code
npm run servico:instalar   # build + serviço systemd --user, sobe no login
```

Depois, rode `prompt-library` (ou abra `http://127.0.0.1:5174`).

- `save:install` cria o link `~/.claude/skills/save` → `<repo>/skills/save`. Se o link já aponta para cá, não faz nada; se existe outra coisa no lugar, falha sem tocar nela.
- `servico:instalar` roda o build se faltar, grava `~/.config/systemd/user/prompt-library.service` e faz `enable` e `start`. A unidade guarda caminhos absolutos do `node` e do `claude` encontrados na instalação (o serviço não herda o `PATH` do seu shell). Rodar de novo é seguro: sem mudanças, nada acontece; uma unidade que não foi gerada por aqui nunca é sobrescrita. O serviço sobe quando você faz login (sem linger). Também cria o symlink `~/.local/bin/prompt-library` → `<repo>/scripts/prompt-library.mjs`; se já existir outra coisa no lugar, só avisa e não toca nela.
- Sem serviço: `npm start` faz o build e sobe o servidor em primeiro plano (Ctrl+C para parar). `npm run serve` sobe sem refazer o build.

### Abrir o app

```sh
prompt-library
```

Abre `http://127.0.0.1:5174` no navegador (`xdg-open`). Se o app não responder, roda `systemctl --user start prompt-library` e espera até 10 s pelo `GET /api/health` antes de abrir; se não subir, sugere `journalctl --user -u prompt-library -f`. Sem a unidade instalada, não abre nada e sugere rodar `npm run servico:instalar` no repositório. Precisa de `~/.local/bin` no `PATH`.

### Atualizar depois de mudar o código

```sh
npm run build && systemctl --user restart prompt-library
```

Se o caminho do `node` ou do `claude` mudar (outra versão do Node, por exemplo), rode `npm run servico:instalar` de novo.

### Remover

```sh
npm run servico:remover    # disable --now, apaga a unidade e o symlink prompt-library (só se forem nossos)
rm ~/.claude/skills/save   # remove o /save
```

## Variáveis de ambiente

| Variável                | Para quê                                                                                                                      | Padrão                        |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| `PROMPT_LIBRARY_VAULT`  | Vault onde ficam os Prompts (app e `/save`). No serviço, só entra na unidade se estiver definida ao rodar `servico:instalar`. | `/home/levi/Documentos/vault` |
| `PROMPT_LIBRARY_CLAUDE` | Executável do Claude Code usado na Análise. O `servico:instalar` grava o caminho absoluto dele (ou o achado no `PATH`).       | `claude`                      |
| `CLAUDE_CONFIG_DIR`     | Pasta de configuração do Claude Code; só o `save:install` usa, para achar `skills/`.                                          | `~/.claude`                   |
| `XDG_CONFIG_HOME`       | Base de onde a unidade do systemd é gravada.                                                                                  | `~/.config`                   |

## O que o app grava no vault

Tudo dentro de `Prompts/`, exceto a lixeira:

| Caminho                       | Conteúdo                                                                                                           |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `Prompts/**/*.md`             | Um arquivo por Prompt; cada subpasta é uma Coleção. Metadados (id, título, Tags, Favorito, Origem) no frontmatter. |
| `Prompts/_Diretrizes.md`      | As Diretrizes, sem Versões.                                                                                        |
| `Prompts/.versoes/<id>/`      | As Versões de cada Prompt (ADR 0003).                                                                              |
| `Prompts/.analises/<id>.json` | A Análise em andamento de cada Prompt; some ao concluir ou descartar.                                              |
| `.trash/`                     | Prompts excluídos vão para a lixeira do vault, como no Obsidian.                                                   |

Se o vault for um repositório git, `Prompts/.versoes/` é versionado e as Análises em andamento, que são estado temporário, ficam fora. Acrescente ao `.gitignore` do vault:

```gitignore
# Biblioteca de Prompts: Análises em andamento (estado temporário)
Prompts/.analises/
```

## Desenvolvimento

```sh
npm run dev         # Vite em :5173 (com recarga) + servidor em :5174
npm test            # Vitest
npm run lint
npm run typecheck
npm run build       # dist/web (Vite) + dist/server (tsc)
```

- O `dev` usa a mesma porta 5174 do serviço: pare o serviço antes (`systemctl --user stop prompt-library`). Se esquecer, o servidor avisa que a porta está em uso.
- Em desenvolvimento, abra `http://127.0.0.1:5173`; o Vite repassa `/api` para o servidor.
- Logs do serviço: `journalctl --user -u prompt-library -f`; estado: `systemctl --user status prompt-library`.

## Segurança

O servidor escuta só em `127.0.0.1`, sem autenticação (decisão 23): qualquer processo do seu usuário na máquina pode usar a API. Contra páginas abertas no navegador, a API recusa `Host` fora de `127.0.0.1`/`localhost` nas portas do app (DNS rebinding) e, nas escritas, `Origin` de outro site e corpo que não seja JSON (CSRF) (decisão 71). Não exponha a porta na rede.

## Documentação

- [`DECISIONS.md`](DECISIONS.md): registro das decisões, por etapa.
- [`GLOSSARY.md`](GLOSSARY.md): a linguagem do domínio.
- [`docs/adr/`](docs/adr/): as decisões de arquitetura (Markdown no vault, Claude Code headless, Versões em pasta oculta).
