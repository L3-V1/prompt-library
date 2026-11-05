#!/usr/bin/env node
// Abre a Biblioteca de Prompts no navegador; se o serviço estiver parado, sobe e espera.
// Instalado como `~/.local/bin/prompt-library` por `npm run servico:instalar`.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as dormir } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import { esperarApp, LIMITE_ESPERA_MS } from './servico-comando.mjs';
import { caminhoUnidade, NOME_UNIDADE, URL_APP } from './servico-unidade.mjs';

// O Node resolve o symlink do script principal: `import.meta.url` aponta para o repositório.
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const servico = NOME_UNIDADE.replace(/\.service$/, '');

async function appResponde() {
  try {
    const r = await fetch(`${URL_APP}/api/health`, { signal: AbortSignal.timeout(1000) });
    return r.ok;
  } catch {
    return false;
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

async function garantirServico() {
  if (await appResponde()) return true;

  const unidade = caminhoUnidade({
    xdgConfigHome: process.env.XDG_CONFIG_HOME,
    home: os.homedir(),
  });
  if (!(await existe(unidade))) {
    console.error(
      `O serviço não está instalado. No repositório (${repo}), rode \`npm run servico:instalar\`.`,
    );
    return false;
  }

  console.log('Subindo o serviço…');
  const r = spawnSync('systemctl', ['--user', 'start', servico], { stdio: 'inherit' });
  if (r.error || r.status !== 0) {
    const motivo = r.error ? r.error.message : `status ${r.status}`;
    console.error(`\`systemctl --user start ${servico}\` falhou (${motivo}).`);
    return false;
  }

  const respondeu = await esperarApp({ consultar: appResponde, agora: Date.now, dormir });
  if (!respondeu) {
    console.error(
      `O serviço não respondeu em ${LIMITE_ESPERA_MS / 1000} s. Veja os logs: journalctl --user -u ${servico} -f`,
    );
  }
  return respondeu;
}

function abrir() {
  const filho = spawn('xdg-open', [URL_APP], { detached: true, stdio: 'ignore' });
  filho.on('error', () => {
    console.error(`Não foi possível rodar o xdg-open. Abra à mão: ${URL_APP}`);
    process.exitCode = 1;
  });
  filho.unref();
}

if (await garantirServico()) abrir();
else process.exitCode = 1;
