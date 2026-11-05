import fs from 'node:fs/promises';
import path from 'node:path';

import { z } from 'zod';

import { gravarAtomico } from '../arquivos.js';
import { AnaliseInvalidaError } from '../erros.js';
import { idValido } from '../ids.js';
import type { Analise, Pastas } from '../tipos.js';

const esquemaSugestao = z.object({
  id: z.string().min(1),
  justificativa: z.string(),
  trechoOriginal: z.string().min(1),
  trechoNovo: z.string(),
  status: z.enum(['pendente', 'aceita', 'rejeitada', 'desatualizada']),
  inicio: z.number().int().nonnegative().nullable(),
});

const esquemaAnalise = z.object({
  promptId: z.string(),
  baseHash: z.string(),
  corpoOriginal: z.string(),
  rascunho: z.string(),
  instrucao: z.string(),
  modelo: z.enum(['opus', 'sonnet', 'haiku']).nullable(),
  sugestoes: z.array(esquemaSugestao),
  execucao: z
    .object({
      tipo: z.enum(['analise', 'sugestao']),
      sugestaoId: z.string().optional(),
      iniciadaEm: z.string(),
    })
    .nullable(),
  erro: z.string().nullable(),
  ultimaExecucao: z
    .object({
      custoUsd: z.number(),
      duracaoMs: z.number(),
      modelo: z.string(),
      descartadas: z.number().int().nonnegative().default(0),
    })
    .optional(),
  criadaEm: z.string(),
  atualizadaEm: z.string(),
});

/** Remove as chaves `undefined` que o zod deixa nos opcionais (`exactOptionalPropertyTypes`). */
function limpar(dados: z.output<typeof esquemaAnalise>): Analise {
  return JSON.parse(JSON.stringify(dados)) as Analise;
}

/** Análises em andamento, uma por Prompt, em `Prompts/.analises/<promptId>.json` (decisão 18). */
export function criarArmazenamentoAnalises(pastas: Pick<Pastas, 'analises'>) {
  function arquivo(promptId: string): string {
    if (!idValido(promptId)) throw new Error(`Id de Prompt inválido: ${promptId}`);
    return path.join(pastas.analises, `${promptId}.json`);
  }

  /** A Análise do Prompt, ou `null` se não houver. Lança `AnaliseInvalidaError` se ilegível. */
  async function ler(promptId: string): Promise<Analise | null> {
    if (!idValido(promptId)) return null;
    let texto: string;
    try {
      texto = await fs.readFile(arquivo(promptId), 'utf8');
    } catch (erro) {
      if ((erro as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw erro;
    }
    let dados: unknown;
    try {
      dados = JSON.parse(texto);
    } catch {
      throw new AnaliseInvalidaError(promptId, 'JSON inválido');
    }
    const r = esquemaAnalise.safeParse(dados);
    if (!r.success) {
      const problema = r.error.issues[0];
      const onde = problema?.path.map(String).join('.') || 'raiz';
      throw new AnaliseInvalidaError(promptId, `campo ${onde} fora do formato`);
    }
    if (r.data.promptId !== promptId) {
      throw new AnaliseInvalidaError(promptId, 'o promptId não corresponde ao nome do arquivo');
    }
    return limpar(r.data);
  }

  async function gravar(analise: Analise): Promise<void> {
    const destino = arquivo(analise.promptId);
    await fs.mkdir(pastas.analises, { recursive: true });
    await gravarAtomico(destino, `${JSON.stringify(analise, null, 2)}\n`);
  }

  /** Apaga a Análise; devolve se havia uma. */
  async function apagar(promptId: string): Promise<boolean> {
    if (!idValido(promptId)) return false;
    try {
      await fs.rm(arquivo(promptId));
      return true;
    } catch (erro) {
      if ((erro as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw erro;
    }
  }

  return { ler, gravar, apagar };
}

export type ArmazenamentoAnalises = ReturnType<typeof criarArmazenamentoAnalises>;
