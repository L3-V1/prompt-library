// Instala a skill /save: cria o link ~/.claude/skills/save → <repo>/skills/save.
// Se o link já aponta para cá, não faz nada; se existe outra coisa no lugar, falha sem tocar nela.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const origem = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'skills', 'save');
const dirClaude = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
const destino = path.join(dirClaude, 'skills', 'save');

async function instalar() {
  let stat = null;
  try {
    stat = await fs.lstat(destino);
  } catch (erro) {
    if (erro.code !== 'ENOENT') throw erro;
  }

  if (stat) {
    if (stat.isSymbolicLink()) {
      const alvo = path.resolve(path.dirname(destino), await fs.readlink(destino));
      if (alvo === origem) {
        console.log(`A skill /save já está instalada: ${destino} → ${origem}`);
        return 0;
      }
      console.error(`Já existe um link em ${destino} apontando para ${alvo}. Nada foi alterado.`);
      return 1;
    }
    console.error(`Já existe ${destino} e não é um link para este repositório. Nada foi alterado.`);
    return 1;
  }

  await fs.mkdir(path.dirname(destino), { recursive: true });
  await fs.symlink(origem, destino, 'dir');
  console.log(`Skill /save instalada: ${destino} → ${origem}`);
  return 0;
}

process.exitCode = await instalar();
