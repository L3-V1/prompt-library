import { spawn } from 'node:child_process';
import path from 'node:path';

import { z } from 'zod';

import type { AtividadeClaude } from '../../core/index.js';

/** O que o Claude devolve: `{ sugestoes: [{ justificativa, trechoOriginal, trechoNovo }] }`. */
export const esquemaSaida = z.object({
  sugestoes: z.array(
    z.object({
      justificativa: z.string(),
      trechoOriginal: z.string().min(1),
      trechoNovo: z.string(),
    }),
  ),
});

export type SaidaClaude = z.infer<typeof esquemaSaida>;

export interface PedidoClaude {
  prompt: string;
  /** `null` = padrão do Claude Code (sem `--model`). */
  modelo: string | null;
  cwd: string;
  sinal: AbortSignal;
  timeoutMs: number;
  /** Chamado a cada ferramenta que o Claude usa (`tool_use` do `stream-json`, decisão 128). */
  aoAtivar?: (atividade: AtividadeClaude) => void;
}

export interface RespostaClaude {
  saida: unknown;
  custoUsd: number;
  duracaoMs: number;
  modelo: string;
}

/** Adaptador injetável: o real faz `spawn` do `claude`; os testes passam um falso. */
export type ExecutorClaude = (pedido: PedidoClaude) => Promise<RespostaClaude>;

/** Falha ao executar o Claude Code, com a mensagem pt-BR para o usuário. */
export class ExecucaoClaudeError extends Error {
  override name = 'ExecucaoClaudeError';
}

/** A execução foi abortada pelo `sinal` (cancelar, descartar, desligar). */
export class ExecucaoCanceladaError extends Error {
  override name = 'ExecucaoCanceladaError';
  constructor() {
    super('A execução foi cancelada.');
  }
}

export const TIMEOUT_PADRAO_MS = 300_000;
/** O Linux limita um único argumento a 128 KiB (`MAX_ARG_STRLEN`); o prompt vai por argumento. */
export const LIMITE_PROMPT_BYTES = 100 * 1024;
const ESPERA_SIGKILL_MS = 5_000;
const FIM_SAIDA = 2_000;
const FERRAMENTAS = 'Read Glob Grep';

// O validador do `claude` não aceita o `$schema` draft 2020-12 que o zod põe por padrão.
const esquemaSemMeta: Record<string, unknown> = z.toJSONSchema(esquemaSaida, { target: 'draft-7' });
delete esquemaSemMeta['$schema'];
const esquemaJson = JSON.stringify(esquemaSemMeta);

/** Os argumentos da decisão 41. O prompt vem logo depois do `-p`, antes das listas variádicas. */
export function argumentosClaude(prompt: string, modelo: string | null): string[] {
  return [
    '-p',
    prompt,
    '--output-format',
    'stream-json',
    '--verbose',
    '--json-schema',
    esquemaJson,
    '--tools',
    FERRAMENTAS,
    '--allowedTools',
    FERRAMENTAS,
    '--strict-mcp-config',
    '--permission-mode',
    'default',
    '--no-session-persistence',
    ...(modelo ? ['--model', modelo] : []),
  ];
}

const esquemaEnvelope = z.looseObject({
  type: z.string().optional(),
  subtype: z.string().optional(),
  is_error: z.boolean().optional(),
  result: z.unknown().optional(),
  structured_output: z.unknown().optional(),
  total_cost_usd: z.number().optional(),
  duration_ms: z.number().optional(),
  modelUsage: z.record(z.string(), z.unknown()).optional(),
});

type Envelope = z.infer<typeof esquemaEnvelope>;

const texto = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

/**
 * A atividade de um bloco `tool_use` (decisão 128): `Read` vira o caminho relativo ao `cwd` (o
 * Claude manda o absoluto; fora do `cwd`, fica como veio), `Grep` e `Glob`, o `pattern`. Outras
 * ferramentas (`StructuredOutput`) ou input sem o campo: `null`.
 */
export function atividadeDe(bloco: unknown, cwd: string): AtividadeClaude | null {
  if (typeof bloco !== 'object' || bloco === null) return null;
  const { name, input } = bloco as { name?: unknown; input?: unknown };
  const campos = (typeof input === 'object' && input !== null ? input : {}) as Record<
    string,
    unknown
  >;
  switch (name) {
    case 'Read': {
      const arquivo = texto(campos['file_path']);
      if (!arquivo) return null;
      const relativo = path.relative(cwd, arquivo);
      const fora =
        relativo === '' ||
        relativo === '..' ||
        relativo.startsWith(`..${path.sep}`) ||
        path.isAbsolute(relativo);
      return { tipo: 'ler', caminho: fora ? arquivo : relativo.split(path.sep).join('/') };
    }
    case 'Grep': {
      const termo = texto(campos['pattern']);
      return termo ? { tipo: 'buscar', termo } : null;
    }
    case 'Glob': {
      const padrao = texto(campos['pattern']);
      return padrao ? { tipo: 'listar', padrao } : null;
    }
    default:
      return null;
  }
}

/** Os blocos `tool_use` de um evento `assistant` do `stream-json`. */
function blocosToolUse(evento: Record<string, unknown>): unknown[] {
  const mensagem = evento['message'];
  if (typeof mensagem !== 'object' || mensagem === null) return [];
  const conteudo = (mensagem as { content?: unknown }).content;
  if (!Array.isArray(conteudo)) return [];
  return conteudo.filter(
    (b: unknown) =>
      typeof b === 'object' && b !== null && (b as { type?: unknown }).type === 'tool_use',
  );
}

/** O modelo que mais custou na execução, pelo `modelUsage`. */
function modeloUsado(envelope: Envelope, pedido: string | null): string {
  const uso = Object.entries(envelope.modelUsage ?? {});
  const custo = (u: unknown) =>
    typeof u === 'object' && u !== null && typeof (u as { costUSD?: unknown }).costUSD === 'number'
      ? (u as { costUSD: number }).costUSD
      : 0;
  uso.sort((a, b) => custo(b[1]) - custo(a[1]));
  return uso[0]?.[0] ?? pedido ?? 'padrão';
}

const resumir = (texto: string) => {
  const t = texto.trim();
  return t.length > 500 ? `…${t.slice(-500)}` : t;
};

/**
 * Executor real: `spawn` do `claude` com stdin fechado e cwd em `Prompts/` (decisão 41). Lê o
 * stdout em JSONL (`stream-json`, decisão 128): repassa cada `tool_use` ao `aoAtivar` e valida o
 * `structured_output` do evento `result`. Timeout e abort mandam SIGTERM e, 5 s depois, SIGKILL.
 */
export function criarExecutorClaude({ binario }: { binario: string }): ExecutorClaude {
  return (pedido) =>
    new Promise<RespostaClaude>((resolve, reject) => {
      if (pedido.sinal.aborted) return reject(new ExecucaoCanceladaError());
      const tamanho = Buffer.byteLength(pedido.prompt, 'utf8');
      if (tamanho > LIMITE_PROMPT_BYTES) {
        return reject(
          new ExecucaoClaudeError(
            `O pedido ao Claude ficou grande demais (${Math.ceil(tamanho / 1024)} KB; o limite é 100 KB). Encurte o Prompt ou as Diretrizes.`,
          ),
        );
      }

      // Variáveis da sessão do Claude Code que lançou o servidor, se houver, não passam adiante.
      const env = { ...process.env };
      delete env['CLAUDECODE'];
      delete env['CLAUDE_CODE_ENTRYPOINT'];

      const filho = spawn(binario, argumentosClaude(pedido.prompt, pedido.modelo), {
        cwd: pedido.cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        env,
      });

      let buffer = '';
      let fimStdout = '';
      let stderr = '';
      let envelope: Envelope | null = null;
      let terminado = false;
      let motivo: 'timeout' | 'cancelado' | null = null;
      let matar: NodeJS.Timeout | undefined;

      function processarLinha(linha: string) {
        if (linha.trim() === '') return;
        let evento: unknown;
        try {
          evento = JSON.parse(linha);
        } catch {
          return;
        }
        if (typeof evento !== 'object' || evento === null) return;
        const tipo = (evento as { type?: unknown }).type;
        if (tipo === 'assistant') {
          if (!pedido.aoAtivar) return;
          for (const bloco of blocosToolUse(evento as Record<string, unknown>)) {
            const atividade = atividadeDe(bloco, pedido.cwd);
            if (!atividade) continue;
            try {
              pedido.aoAtivar(atividade);
            } catch (erro) {
              console.error('erro no aoAtivar do executor do Claude:', erro);
            }
          }
        } else if (tipo === 'result') {
          const r = esquemaEnvelope.safeParse(evento);
          if (r.success) envelope = r.data;
        }
      }

      filho.stdout.setEncoding('utf8').on('data', (d: string) => {
        fimStdout = (fimStdout + d).slice(-FIM_SAIDA);
        buffer += d;
        let quebra = buffer.indexOf('\n');
        while (quebra !== -1) {
          processarLinha(buffer.slice(0, quebra));
          buffer = buffer.slice(quebra + 1);
          quebra = buffer.indexOf('\n');
        }
      });
      filho.stderr.setEncoding('utf8').on('data', (d: string) => {
        stderr = (stderr + d).slice(-FIM_SAIDA);
      });

      function encerrar(m: 'timeout' | 'cancelado') {
        if (terminado || motivo) return;
        motivo = m;
        filho.kill('SIGTERM');
        matar = setTimeout(() => filho.kill('SIGKILL'), ESPERA_SIGKILL_MS);
      }
      const aoAbortar = () => encerrar('cancelado');
      pedido.sinal.addEventListener('abort', aoAbortar, { once: true });
      const prazo = setTimeout(() => encerrar('timeout'), pedido.timeoutMs);

      function finalizar(erro: Error | null, resposta?: RespostaClaude) {
        if (terminado) return;
        terminado = true;
        clearTimeout(prazo);
        clearTimeout(matar);
        pedido.sinal.removeEventListener('abort', aoAbortar);
        if (erro) reject(erro);
        else resolve(resposta as RespostaClaude);
      }

      filho.on('error', (erro: NodeJS.ErrnoException) => {
        if (erro.code === 'ENOENT') {
          finalizar(
            new ExecucaoClaudeError(
              `Claude Code não encontrado (instale ou defina PROMPT_LIBRARY_CLAUDE). Procurado: ${binario}`,
            ),
          );
        } else {
          finalizar(
            new ExecucaoClaudeError(`Não foi possível executar o Claude Code: ${erro.message}`),
          );
        }
      });

      filho.on('close', (codigo, sinal) => {
        if (motivo === 'cancelado') return finalizar(new ExecucaoCanceladaError());
        if (motivo === 'timeout') {
          return finalizar(
            new ExecucaoClaudeError(
              `O Claude Code não respondeu em ${Math.round(pedido.timeoutMs / 1000)} s e foi encerrado.`,
            ),
          );
        }
        processarLinha(buffer);
        buffer = '';
        const detalhe = () =>
          (typeof envelope?.result === 'string' && envelope.result.trim()) ||
          resumir(stderr) ||
          resumir(fimStdout) ||
          'sem detalhes';
        if (codigo !== 0) {
          const como = codigo === null ? `sinal ${sinal ?? '?'}` : `código ${codigo}`;
          return finalizar(new ExecucaoClaudeError(`O Claude Code falhou (${como}): ${detalhe()}`));
        }
        if (!envelope) {
          return finalizar(
            new ExecucaoClaudeError(
              `Resposta inválida do Claude Code (sem o evento result): ${detalhe()}`,
            ),
          );
        }
        if (envelope.is_error || envelope.subtype !== 'success') {
          return finalizar(
            new ExecucaoClaudeError(
              `O Claude Code terminou com erro (${envelope.subtype ?? 'sem subtype'}): ${detalhe()}`,
            ),
          );
        }
        const saida = esquemaSaida.safeParse(envelope.structured_output);
        if (!saida.success) {
          return finalizar(
            new ExecucaoClaudeError(
              'A resposta do Claude não segue o formato de Sugestões esperado.',
            ),
          );
        }
        finalizar(null, {
          saida: saida.data,
          custoUsd: envelope.total_cost_usd ?? 0,
          duracaoMs: envelope.duration_ms ?? 0,
          modelo: modeloUsado(envelope, pedido.modelo),
        });
      });
    });
}
