---
titulo: "roadmap-02, M0: comando prompt-library"
data: 2026-11-05
status: aprovado
tipo: milestone
numero: "00"
pai: roadmaps/roadmap-02
triagem: ok
---

# Plano: roadmap-02, M0, comando `prompt-library`

## Contexto

Primeiro marco do roadmap-02 (`.plans/roadmaps/roadmap-02/roadmap-02-melhorias-pos-mvp.md`), decisões 108, 109 e 110. Hoje, para abrir o app é preciso lembrar `http://127.0.0.1:5174` e, se o serviço estiver parado, subir à mão. O marco cria um comando de terminal `prompt-library` que garante o serviço no ar e abre o navegador, instalado como symlink em `~/.local/bin` pelo `servico:instalar`.

Branch: `feat/milestone-00-comando-prompt-library`, criada a partir de `main` (leva junto as mudanças não commitadas em `DECISIONS.md`, `.plans/TAXONOMY.md` e `.plans/roadmaps/roadmap-02/`). Commit só quando o usuário pedir.

## Mudanças

### 1. `scripts/servico-unidade.mjs` (+ `.d.mts`): extrair o que os dois scripts compartilham
- `export const URL_APP = 'http://127.0.0.1:5174'` (sai de `servico.mjs`).
- `export function caminhoUnidade({ xdgConfigHome, home })` → `<xdgConfigHome || home/.config>/systemd/user/prompt-library.service`. `servico.mjs` passa a usá-la no lugar do cálculo local de `destino`.
- Declarações novas no `servico-unidade.d.mts`.

### 2. Novo `scripts/servico-comando.mjs` (+ `servico-comando.d.mts`): lógica pura, no padrão do `servico-unidade.mjs`
- `ORIGEM_COMANDO = path.join('scripts', 'prompt-library.mjs')` e `comandoNosso(alvo)`: `true` se o alvo (resolvido) termina em `scripts/prompt-library.mjs`.
- `acaoInstalarComando({ existente, origem })`, onde `existente` é `null` | `{ tipo: 'link', alvo }` | `{ tipo: 'outro' }`:
  - `null` → `'criar'`; link com `alvo === origem` → `'nada'`; link nosso com outro alvo → `'refazer'`; o resto → `'conflito'`.
- `acaoRemoverComando({ existente })` → `'ausente'` | `'apagar'` (link nosso) | `'alheio'`.
- `esperarApp({ consultar, agora, dormir, limiteMs = 10_000, intervaloMs = 250 })` → `Promise<boolean>`: consulta, e enquanto `agora() - inicio < limiteMs`, dorme e consulta de novo. Relógio, sono e consulta injetáveis.
- Constantes `LIMITE_ESPERA_MS = 10_000` e `INTERVALO_ESPERA_MS = 250`.

### 3. Novo `scripts/prompt-library.mjs` (executável, `chmod +x`, shebang `#!/usr/bin/env node`)
1. `appResponde()`: `fetch(`${URL_APP}/api/health`, { signal: AbortSignal.timeout(1000) })` → `r.ok`; qualquer erro → `false`. (`/api/health` já existe em `src/server/app.ts:65`.)
2. Se não responde: confere se `caminhoUnidade({ xdgConfigHome: process.env.XDG_CONFIG_HOME, home: os.homedir() })` existe.
   - Não existe: `console.error` com "O serviço não está instalado. No repositório (<repo>), rode `npm run servico:instalar`." e sai com 1.
   - Existe: imprime "Subindo o serviço…", `spawnSync('systemctl', ['--user', 'start', 'prompt-library'], { stdio: 'inherit' })`; status ≠ 0 → erro e sai com 1. Depois `esperarApp(...)` com `Date.now`, `setTimeout` em promessa e `appResponde`; se esgotar, erro sugerindo `journalctl --user -u prompt-library -f` e sai com 1.
3. `spawn('xdg-open', [URL_APP], { detached: true, stdio: 'ignore' }).unref()`; no evento `error` (sem `xdg-open`), imprime a URL para abrir à mão e sai com 1.
- O `<repo>` vem de `import.meta.url` (o Node resolve o symlink do script principal, então os imports relativos e o caminho do repo funcionam chamando pelo `~/.local/bin`).

### 4. `scripts/servico.mjs`
- Novo destino do comando: `path.join(os.homedir(), '.local', 'bin', 'prompt-library')`; origem `path.join(repo, 'scripts', 'prompt-library.mjs')`.
- `lerComando()`: `fs.lstat` + `fs.readlink` (resolvido contra o dir do link) → o `existente` do item 2.
- `instalarComando()` chamado no fim do `instalar()` (depois do serviço): aplica a ação (`criar`/`refazer` com `fs.mkdir` recursivo + `fs.rm` do link antigo + `fs.symlink`; `nada` informa; `conflito` só avisa, sem mudar o status de saída). Avisa também se `~/.local/bin` não estiver no `PATH`.
- `removerComando()` no início do `remover()`, independente da unidade (o retorno antecipado "não está instalado" não pode pular o symlink): `apagar` → `fs.rm`; `alheio` → avisa e não toca; `ausente` → nada.
- A mensagem final do `instalar` troca "App: URL" por "Abra com: prompt-library".

### 5. Testes: novo `scripts/servico-comando.test.ts` (+ casos em `servico.test.ts` para `caminhoUnidade`)
- `acaoInstalarComando`: ausente, igual, nosso em outro repo, link alheio, arquivo comum.
- `acaoRemoverComando`: ausente, nosso, alheio.
- `esperarApp` com relógio falso: responde de cara (sem dormir); responde na 3ª consulta; nunca responde → `false` depois de ~40 consultas, sem passar do limite.
- `caminhoUnidade`: com e sem `XDG_CONFIG_HOME`.

### 6. `README.md`
- Na Instalação: "Depois, abra `http://127.0.0.1:5174`" vira "Depois, rode `prompt-library`"; o item do `servico:instalar` cita o symlink.
- Seção nova "Abrir o app": o que o comando faz (sobe o serviço se preciso, espera até 10 s, abre no navegador) e a mensagem sem a unidade.
- Em "Remover": o `servico:remover` também apaga o symlink, se for nosso.

### 7. `DECISIONS.md`
Nova seção "2026-11-05: roadmap-02, M0, comando `prompt-library`":
- **120.** Espera de até 10 s, consultando `GET /api/health` a cada 250 ms, cada consulta com 1 s de timeout. Resolve o item "Em aberto" do limite de tempo (remover o item da lista).
- **121.** O symlink é "nosso" quando aponta para um `scripts/prompt-library.mjs`; um conflito no `instalar` só avisa e não faz o comando falhar, porque o serviço já foi instalado.

## Verificação
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.
- `npm run servico:instalar` duas vezes: a primeira cria `~/.local/bin/prompt-library`, a segunda diz que nada mudou (`ls -l ~/.local/bin/prompt-library`).
- `systemctl --user stop prompt-library && prompt-library`: sobe o serviço e abre o navegador. Com o serviço rodando, `prompt-library` abre na hora.
- Sem a unidade: `XDG_CONFIG_HOME=$(mktemp -d) prompt-library` com o serviço parado mostra a sugestão do `servico:instalar` (depois, `systemctl --user start prompt-library`).
- `npm run servico:remover` apaga o symlink; `npm run servico:instalar` recria tudo no fim.
- Encerramento com `/spec-kit:close-cycle`.
