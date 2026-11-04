# Prompts como arquivos Markdown dentro do vault Obsidian

Cada Prompt é um arquivo `.md` com metadados em frontmatter, guardado numa pasta dentro do vault Obsidian (`/home/levi/Documentos/vault/`), e não num banco de dados. Assim os prompts continuam legíveis, editáveis no Obsidian e versionados pelo git do vault, mesmo sem a aplicação. O custo é que busca, filtros e histórico precisam ser implementados sobre o sistema de arquivos, e a aplicação precisa tolerar edições feitas por fora dela.

## Opções consideradas

- **SQLite**: consultas mais simples, mas o conteúdo fica preso num binário que não dá para ler nem editar fora da aplicação.
- **JSON único**: diffs ruins e risco de corromper todo o acervo de uma vez.
