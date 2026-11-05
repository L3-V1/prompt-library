// Unidade `systemd --user` do app, gerada por `scripts/servico.mjs`. Funções puras, testáveis.
import path from 'node:path';

export const NOME_UNIDADE = 'prompt-library.service';
export const URL_APP = 'http://127.0.0.1:5174';
export const CABECALHO = '# Gerado por prompt-library (npm run servico:instalar). Não edite à mão.';

/** Onde fica a unidade: `<XDG_CONFIG_HOME ou ~/.config>/systemd/user/prompt-library.service`. */
export function caminhoUnidade({ xdgConfigHome, home }) {
  const dirConfig = xdgConfigHome || path.join(home, '.config');
  return path.join(dirConfig, 'systemd', 'user', NOME_UNIDADE);
}

/** Diretórios de sistema que fecham o `PATH` do serviço. */
const PATH_SISTEMA = ['/usr/local/bin', '/usr/bin', '/bin'];

/** Se a unidade foi gerada por este script (e pode ser regravada ou apagada). */
export function unidadeNossa(texto) {
  return texto.startsWith('# Gerado por prompt-library');
}

/** No systemd, `%` abre um especificador; o literal é `%%`. */
function escapar(valor) {
  return valor.replaceAll('%', '%%');
}

/** Um argumento de `ExecStart=` ou um `Environment=`, entre aspas se tiver espaço ou aspas. */
function citar(valor) {
  const v = escapar(valor);
  return /[\s"'\\]/.test(v) ? `"${v.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"` : v;
}

/** O `PATH` do serviço: o dir do node, o do claude e os do sistema, sem repetir. */
export function montarPath({ node, claude }) {
  const dirs = [path.dirname(node), ...(claude ? [path.dirname(claude)] : []), ...PATH_SISTEMA];
  return [...new Set(dirs)].join(':');
}

/**
 * O texto da unidade. `node` e `claude` são caminhos absolutos (o serviço não herda o `PATH`
 * do shell); `claude` nulo deixa a variável de fora, e a Análise falha até ser instalado.
 * `vault` só entra se estava definido na instalação.
 */
export function gerarUnidade({ repo, node, claude = null, vault = null }) {
  const ambiente = [
    'NODE_ENV=production',
    `PATH=${montarPath({ node, claude })}`,
    ...(claude ? [`PROMPT_LIBRARY_CLAUDE=${claude}`] : []),
    ...(vault ? [`PROMPT_LIBRARY_VAULT=${vault}`] : []),
  ];
  return [
    CABECALHO,
    '[Unit]',
    'Description=Biblioteca de Prompts (127.0.0.1:5174)',
    '',
    '[Service]',
    `WorkingDirectory=${escapar(repo)}`,
    ...ambiente.map((v) => `Environment=${citar(v)}`),
    `ExecStart=${citar(node)} ${citar(path.join(repo, 'dist', 'server', 'main.js'))}`,
    'Restart=on-failure',
    '',
    '[Install]',
    'WantedBy=default.target',
    '',
  ].join('\n');
}
