import { createHash, randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Grava num arquivo temporário oculto no mesmo diretório e faz `rename`, para que
 * leitores (o Obsidian, a varredura) nunca vejam um arquivo pela metade.
 */
export async function gravarAtomico(caminho: string, conteudo: string | Uint8Array): Promise<void> {
  const dir = path.dirname(caminho);
  const tmp = path.join(dir, `.${path.basename(caminho)}.tmp-${randomBytes(6).toString('hex')}`);
  const handle = await fs.open(tmp, 'wx');
  try {
    try {
      await handle.writeFile(conteudo);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.rename(tmp, caminho);
  } catch (erro) {
    await fs.rm(tmp, { force: true });
    throw erro;
  }
}

/** sha256 hex dos bytes crus do arquivo. */
export function hashDe(bytes: string | Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

const PROIBIDOS = /[/\\:*?"<>|#^[\]]/g;
// eslint-disable-next-line no-control-regex
const CONTROLE = /[\u0000-\u001f\u007f]/g;
const TAMANHO_MAXIMO = 120;

/**
 * Limpa um nome para uso como nome de arquivo ou pasta: remove os caracteres que o
 * Obsidian ou o sistema de arquivos não aceitam, os prefixos `.` e `_` (que tornariam o
 * arquivo oculto ou ignorado pela varredura) e limita o tamanho. Pode devolver `''`.
 */
export function limparNome(nome: string): string {
  const limpo = nome
    .replace(CONTROLE, ' ')
    .replace(PROIBIDOS, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[._\s]+/, '');
  return Array.from(limpo)
    .slice(0, TAMANHO_MAXIMO)
    .join('')
    .replace(/[\s.]+$/, '');
}

/** Nome de arquivo (sem extensão) a partir de um título; vazio vira "Sem título". */
export function nomeSeguro(titulo: string): string {
  return limparNome(titulo) || 'Sem título';
}

async function existe(caminho: string): Promise<boolean> {
  try {
    await fs.access(caminho, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Primeiro caminho livre em `dir` para `nome`: `nome.md`, `nome 2.md`, `nome 3.md`…
 * `atual` é tratado como livre (o próprio arquivo que está sendo renomeado).
 */
export async function caminhoLivre(
  dir: string,
  nome: string,
  extensao = '.md',
  atual?: string,
): Promise<string> {
  for (let n = 1; ; n++) {
    const candidato = path.join(dir, n === 1 ? `${nome}${extensao}` : `${nome} ${n}${extensao}`);
    if (candidato === atual || !(await existe(candidato))) return candidato;
  }
}
