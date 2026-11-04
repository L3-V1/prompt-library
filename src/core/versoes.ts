import fs from 'node:fs/promises';
import path from 'node:path';

import { gravarAtomico } from './arquivos.js';
import { VersaoNaoEncontradaError } from './erros.js';
import { idValido } from './ids.js';
import {
  MOTIVOS_VERSAO,
  type MotivoVersao,
  type Pastas,
  type Versao,
  type VersaoComConteudo,
} from './tipos.js';

/** `<AAAAMMDDTHHmmssSSSZ>-<motivo>` */
const NOME_VERSAO = /^(\d{8}T\d{9}Z)-([a-z]+)$/;

function carimbo(ms: number): string {
  // 2026-11-04T16:30:12.123Z → 20261104T163012123Z
  return new Date(ms).toISOString().replace(/[-:.]/g, '');
}

function msDoCarimbo(c: string): number {
  const iso = `${c.slice(0, 4)}-${c.slice(4, 6)}-${c.slice(6, 8)}T${c.slice(9, 11)}:${c.slice(11, 13)}:${c.slice(13, 15)}.${c.slice(15, 18)}Z`;
  return Date.parse(iso);
}

function analisarNome(nome: string): { ms: number; motivo: MotivoVersao } | null {
  const m = NOME_VERSAO.exec(nome);
  if (!m?.[1] || !m[2]) return null;
  const motivo = m[2] as MotivoVersao;
  if (!MOTIVOS_VERSAO.includes(motivo)) return null;
  const ms = msDoCarimbo(m[1]);
  return Number.isNaN(ms) ? null : { ms, motivo };
}

/**
 * Versões em `Prompts/.versoes/<id>/<carimbo>-<motivo>.md`, cada uma com o snapshot
 * verbatim do `.md` (decisões 7 e 8). Os metadados ficam só no nome do arquivo.
 */
export function criarVersoes(pastas: Pastas) {
  const dirDe = (promptId: string) => path.join(pastas.versoes, promptId);

  function paraVersao(promptId: string, nome: string): Versao | null {
    const info = analisarNome(nome);
    if (!info) return null;
    return {
      id: nome,
      promptId,
      criadaEm: new Date(info.ms).toISOString(),
      motivo: info.motivo,
      caminho: path
        .relative(pastas.prompts, path.join(dirDe(promptId), `${nome}.md`))
        .split(path.sep)
        .join('/'),
    };
  }

  /** Versões do Prompt, a mais recente primeiro. */
  async function listar(promptId: string): Promise<Versao[]> {
    if (!idValido(promptId)) return [];
    let nomes: string[];
    try {
      nomes = await fs.readdir(dirDe(promptId));
    } catch (erro) {
      if ((erro as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw erro;
    }
    return nomes
      .filter((n) => n.endsWith('.md') && !n.startsWith('.'))
      .map((n) => paraVersao(promptId, n.slice(0, -3)))
      .filter((v): v is Versao => v !== null)
      .sort((a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
  }

  /** Registra um snapshot. Em colisão de milissegundo, avança o carimbo além da última Versão. */
  async function registrar(
    promptId: string,
    conteudo: string | Uint8Array,
    motivo: MotivoVersao,
  ): Promise<Versao> {
    if (!idValido(promptId)) throw new Error(`Id de Prompt inválido: ${promptId}`);
    const existentes = await listar(promptId);
    const ultima = existentes[0] ? Date.parse(existentes[0].criadaEm) : -Infinity;
    const ms = Math.max(Date.now(), ultima + 1);
    const nome = `${carimbo(ms)}-${motivo}`;
    await fs.mkdir(dirDe(promptId), { recursive: true });
    await gravarAtomico(path.join(dirDe(promptId), `${nome}.md`), conteudo);
    const versao = paraVersao(promptId, nome);
    if (!versao) throw new Error(`Nome de Versão inesperado: ${nome}`);
    return versao;
  }

  async function ler(promptId: string, versaoId: string): Promise<VersaoComConteudo> {
    const versao = idValido(promptId) ? paraVersao(promptId, versaoId) : null;
    if (!versao) throw new VersaoNaoEncontradaError(promptId, versaoId);
    try {
      const conteudo = await fs.readFile(path.join(dirDe(promptId), `${versaoId}.md`), 'utf8');
      return { ...versao, conteudo };
    } catch (erro) {
      if ((erro as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new VersaoNaoEncontradaError(promptId, versaoId);
      }
      throw erro;
    }
  }

  return { listar, registrar, ler };
}

export type Versoes = ReturnType<typeof criarVersoes>;
