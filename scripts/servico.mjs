// Instala ou remove o serviço `systemd --user` do app (sobe no login, sem linger).
//   node scripts/servico.mjs instalar | remover
// Idempotente; uma unidade que não foi gerada por aqui nunca é regravada nem apagada.
import { spawnSync } from 'node:child_process';
import { constants } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { gerarUnidade, NOME_UNIDADE, unidadeNossa } from './servico-unidade.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dirConfig = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
const destino = path.join(dirConfig, 'systemd', 'user', NOME_UNIDADE);
const servico = NOME_UNIDADE.replace(/\.service$/, '');
const URL_APP = 'http://127.0.0.1:5174';

async function executavel(arquivo) {
  try {
    await fs.access(arquivo, constants.X_OK);
    return (await fs.stat(arquivo)).isFile();
  } catch {
    return false;
  }
}

/** O `claude` absoluto: `PROMPT_LIBRARY_CLAUDE` (caminho ou nome) ou a busca no `PATH`. */
async function acharClaude() {
  const nome = process.env.PROMPT_LIBRARY_CLAUDE || 'claude';
  if (nome.includes('/')) {
    const absoluto = path.resolve(nome);
    return (await executavel(absoluto)) ? absoluto : null;
  }
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    if (!dir) continue;
    const candidato = path.resolve(dir, nome);
    if (await executavel(candidato)) return candidato;
  }
  return null;
}

async function lerSeExistir(arquivo) {
  try {
    return await fs.readFile(arquivo, 'utf8');
  } catch (erro) {
    if (erro.code === 'ENOENT') return null;
    throw erro;
  }
}

async function existe(arquivo) {
  try {
    await fs.access(arquivo);
    return true;
  } catch {
    return false;
  }
}

/** Roda `systemctl --user ...`; devolve o status (com `exigir`, falha se não for 0). */
function systemctl(args, { exigir = true, silencioso = false } = {}) {
  const r = spawnSync('systemctl', ['--user', ...args], {
    stdio: silencioso ? 'ignore' : 'inherit',
  });
  if (r.error) throw new Error(`Não foi possível rodar o systemctl: ${r.error.message}`);
  if (exigir && r.status !== 0) {
    throw new Error(`\`systemctl --user ${args.join(' ')}\` falhou (status ${r.status}).`);
  }
  return r.status;
}

function construir() {
  console.log('Build não encontrado; rodando `npm run build`...');
  const r = spawnSync('npm', ['run', 'build'], { cwd: repo, stdio: 'inherit' });
  if (r.status !== 0) throw new Error('`npm run build` falhou.');
}

async function instalar() {
  const atual = await lerSeExistir(destino);
  if (atual !== null && !unidadeNossa(atual)) {
    console.error(`Já existe ${destino} e não foi gerado por prompt-library. Nada foi alterado.`);
    return 1;
  }

  const faltaBuild = !(
    (await existe(path.join(repo, 'dist', 'server', 'main.js'))) &&
    (await existe(path.join(repo, 'dist', 'web', 'index.html')))
  );
  if (faltaBuild) construir();

  const claude = await acharClaude();
  if (!claude) {
    console.warn(
      'Aviso: o executável `claude` não foi encontrado (nem PROMPT_LIBRARY_CLAUDE, nem no PATH).' +
        ' O serviço será instalado, mas a Análise vai falhar até ele existir; depois, rode de novo.',
    );
  }
  const vault = process.env.PROMPT_LIBRARY_VAULT
    ? path.resolve(process.env.PROMPT_LIBRARY_VAULT)
    : null;
  const texto = gerarUnidade({ repo, node: process.execPath, claude, vault });

  const mudou = atual !== texto;
  if (mudou) {
    await fs.mkdir(path.dirname(destino), { recursive: true });
    await fs.writeFile(destino, texto);
    console.log(`${atual === null ? 'Unidade criada' : 'Unidade atualizada'}: ${destino}`);
    systemctl(['daemon-reload']);
  }

  const habilitado =
    systemctl(['is-enabled', '--quiet', servico], { exigir: false, silencioso: true }) === 0;
  const ativo =
    systemctl(['is-active', '--quiet', servico], { exigir: false, silencioso: true }) === 0;

  if (!mudou && habilitado && ativo) {
    console.log(`Nada mudou: o serviço ${servico} já está instalado e rodando.`);
  } else {
    if (!habilitado) systemctl(['enable', servico]);
    if (ativo) systemctl(['restart', servico]);
    else systemctl(['start', servico]);
    console.log(`Serviço ${servico} ${ativo ? 'reiniciado' : 'iniciado'}.`);
  }
  console.log(`\nApp: ${URL_APP}`);
  console.log(`Logs: journalctl --user -u ${servico} -f`);
  if (vault) console.log(`Vault: ${vault}`);
  return 0;
}

async function remover() {
  const atual = await lerSeExistir(destino);
  if (atual === null) {
    console.log(`O serviço não está instalado (${destino} não existe).`);
    return 0;
  }
  if (!unidadeNossa(atual)) {
    console.error(`${destino} não foi gerado por prompt-library. Nada foi alterado.`);
    return 1;
  }
  systemctl(['disable', '--now', servico], { exigir: false });
  await fs.rm(destino);
  systemctl(['daemon-reload']);
  console.log(`Serviço ${servico} removido (${destino}).`);
  return 0;
}

const comandos = { instalar, remover };
const comando = comandos[process.argv[2]];
if (!comando) {
  console.error('Uso: node scripts/servico.mjs instalar|remover');
  process.exitCode = 2;
} else {
  try {
    process.exitCode = await comando();
  } catch (erro) {
    console.error(erro instanceof Error ? erro.message : erro);
    process.exitCode = 1;
  }
}
