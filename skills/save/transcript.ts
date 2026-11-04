import fs from 'node:fs/promises';
import path from 'node:path';

import type { Origem } from '../../src/core/index.js';

/** Uma mensagem digitada pelo usuário numa sessão do Claude Code. */
export interface MensagemDigitada {
  texto: string;
  /** Quantidade de blocos `image` anexados (ficam de fora da Captura, decisão 39). */
  imagens: number;
  /** Data ISO da mensagem. */
  timestamp: string;
  cwd: string;
  sessionId: string;
}

/** Slug que o Claude Code usa para a pasta do projeto em `projects/`. */
export function slugDoCwd(cwd: string): string {
  return cwd.replace(/[^A-Za-z0-9]/g, '-');
}

async function existe(caminho: string): Promise<boolean> {
  try {
    await fs.access(caminho);
    return true;
  } catch {
    return false;
  }
}

/**
 * Caminho do transcript da sessão: `<dirClaude>/projects/<slug>/<sessao>.jsonl`. Sem id de
 * sessão, usa como reserva o `.jsonl` mais recente da pasta do cwd.
 */
export async function localizarTranscript(opcoes: {
  sessao: string | undefined;
  cwd: string;
  dirClaude: string;
}): Promise<string> {
  const projetos = path.join(opcoes.dirClaude, 'projects');
  if (opcoes.sessao) {
    if (!/^[A-Za-z0-9-]+$/.test(opcoes.sessao)) {
      throw new Error(`Id de sessão inválido: ${opcoes.sessao}`);
    }
    const nome = `${opcoes.sessao}.jsonl`;
    const preferido = path.join(projetos, slugDoCwd(opcoes.cwd), nome);
    if (await existe(preferido)) return preferido;
    let pastas: string[] = [];
    try {
      pastas = await fs.readdir(projetos);
    } catch {
      // sem pasta projects/: cai no erro abaixo
    }
    for (const pasta of pastas.sort()) {
      const candidato = path.join(projetos, pasta, nome);
      if (await existe(candidato)) return candidato;
    }
    throw new Error(`Transcript da sessão ${opcoes.sessao} não encontrado em ${projetos}.`);
  }

  const dir = path.join(projetos, slugDoCwd(opcoes.cwd));
  let nomes: string[];
  try {
    nomes = (await fs.readdir(dir)).filter((n) => n.endsWith('.jsonl'));
  } catch {
    nomes = [];
  }
  let maisRecente: { caminho: string; mtime: number } | null = null;
  for (const n of nomes) {
    const caminho = path.join(dir, n);
    const { mtimeMs } = await fs.stat(caminho);
    if (!maisRecente || mtimeMs > maisRecente.mtime) maisRecente = { caminho, mtime: mtimeMs };
  }
  if (!maisRecente) {
    throw new Error(
      `CLAUDE_CODE_SESSION_ID não definido e nenhum transcript encontrado em ${dir}.`,
    );
  }
  return maisRecente.caminho;
}

/** Inícios de texto que não são prompts digitados (comandos, saídas locais, avisos). */
const PREFIXOS_IGNORADOS = [
  '<command-name>',
  '<command-message>',
  '<command-args>',
  '<local-command-stdout>',
  '<local-command-stderr>',
  '<local-command-caveat>',
  '<bash-input>',
  '<bash-stdout>',
  '<bash-stderr>',
  '<task-notification>',
  '[Request interrupted by user',
];

/** Blocos de texto injetados pelo Claude Code junto da mensagem (IDE, lembretes). */
const BLOCOS_INJETADOS = ['<ide_', '<system-reminder>'];

type Registro = Record<string, unknown>;

const ehObjeto = (v: unknown): v is Registro =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function extrairConteudo(conteudo: unknown): { texto: string; imagens: number } | null {
  if (typeof conteudo === 'string') return { texto: conteudo, imagens: 0 };
  if (!Array.isArray(conteudo)) return null;
  const textos: string[] = [];
  let imagens = 0;
  for (const bloco of conteudo) {
    if (!ehObjeto(bloco)) continue;
    if (bloco['type'] === 'tool_result') return null;
    if (bloco['type'] === 'image') imagens++;
    if (bloco['type'] === 'text' && typeof bloco['text'] === 'string') {
      const t = bloco['text'];
      if (!BLOCOS_INJETADOS.some((p) => t.trimStart().startsWith(p))) textos.push(t);
    }
  }
  return { texto: textos.join('\n'), imagens };
}

/**
 * Mensagens digitadas pelo usuário, em ordem, a partir das linhas de um transcript `.jsonl`.
 * Ignora linhas inválidas, metadados (`isMeta`), sidechains, resumos de compactação,
 * resultados de ferramentas, slash commands e saídas de comandos locais.
 */
export function mensagensDigitadas(conteudo: string): MensagemDigitada[] {
  const mensagens: MensagemDigitada[] = [];
  const vistos = new Set<string>();
  for (const linha of conteudo.split('\n')) {
    if (linha.trim() === '') continue;
    let d: unknown;
    try {
      d = JSON.parse(linha);
    } catch {
      continue;
    }
    if (!ehObjeto(d) || d['type'] !== 'user') continue;
    if (d['isMeta'] === true || d['isSidechain'] === true || d['isCompactSummary'] === true) {
      continue;
    }
    const origem = d['origin'];
    if (ehObjeto(origem) && origem['kind'] !== 'human') continue;
    const mensagem = d['message'];
    if (!ehObjeto(mensagem)) continue;
    const extraido = extrairConteudo(mensagem['content']);
    if (!extraido) continue;
    const inicio = extraido.texto.trimStart();
    if (inicio === '') continue;
    if (PREFIXOS_IGNORADOS.some((p) => inicio.startsWith(p))) continue;

    const uuid = typeof d['uuid'] === 'string' ? d['uuid'] : null;
    if (uuid) {
      if (vistos.has(uuid)) continue;
      vistos.add(uuid);
    }
    mensagens.push({
      texto: extraido.texto,
      imagens: extraido.imagens,
      timestamp: typeof d['timestamp'] === 'string' ? d['timestamp'] : '',
      cwd: typeof d['cwd'] === 'string' ? d['cwd'] : '',
      sessionId: typeof d['sessionId'] === 'string' ? d['sessionId'] : '',
    });
  }
  return mensagens;
}

/** A N-ésima mensagem digitada mais recente (`n = 1` é a última). */
export function capturar(mensagens: MensagemDigitada[], n = 1): MensagemDigitada {
  if (!Number.isInteger(n) || n < 1)
    throw new Error(`N deve ser um inteiro positivo (recebido: ${n}).`);
  const total = mensagens.length;
  if (total === 0) throw new Error('Não há mensagens digitadas nesta sessão.');
  const mensagem = mensagens[total - n];
  if (!mensagem) {
    throw new Error(
      `Só há ${total} ${total === 1 ? 'mensagem digitada' : 'mensagens digitadas'} nesta sessão; não dá para pegar a ${n}ª.`,
    );
  }
  return mensagem;
}

export function origemDe(mensagem: MensagemDigitada): Origem {
  return { projeto: mensagem.cwd, data: mensagem.timestamp, sessao: mensagem.sessionId };
}

const MARCADOR = /\[Pasted text #(\d+)(?: \+\d+ lines?)?\]/g;

interface EntradaHistorico {
  display: string;
  timestamp: number;
  project: string;
  sessionId: string;
  pastedContents: Record<string, { content?: string; contentHash?: string; type?: string }>;
}

async function lerHistorico(dirClaude: string): Promise<EntradaHistorico[]> {
  let conteudo: string;
  try {
    conteudo = await fs.readFile(path.join(dirClaude, 'history.jsonl'), 'utf8');
  } catch {
    return [];
  }
  const entradas: EntradaHistorico[] = [];
  for (const linha of conteudo.split('\n')) {
    try {
      const d: unknown = JSON.parse(linha);
      if (!ehObjeto(d) || typeof d['display'] !== 'string') continue;
      entradas.push({
        display: d['display'],
        timestamp: typeof d['timestamp'] === 'number' ? d['timestamp'] : 0,
        project: typeof d['project'] === 'string' ? d['project'] : '',
        sessionId: typeof d['sessionId'] === 'string' ? d['sessionId'] : '',
        pastedContents: ehObjeto(d['pastedContents'])
          ? (d['pastedContents'] as EntradaHistorico['pastedContents'])
          : {},
      });
    } catch {
      // linha inválida
    }
  }
  return entradas;
}

/**
 * Troca cada marcador `[Pasted text #N +K lines]` pelo texto colado, lido de
 * `history.jsonl` (`pastedContents[N].content`) ou de `paste-cache/<contentHash>.txt`.
 * Um marcador sem conteúdo encontrado é erro: a Captura não grava texto incompleto.
 */
export async function reconstruirColagens(
  mensagem: MensagemDigitada,
  dirClaude: string,
): Promise<{ texto: string; colagens: number }> {
  const numeros = [...mensagem.texto.matchAll(MARCADOR)].map((m) => m[1] as string);
  if (numeros.length === 0) return { texto: mensagem.texto, colagens: 0 };

  const historico = (await lerHistorico(dirClaude)).filter((e) => e.display === mensagem.texto);
  let candidatas = historico.filter((e) => e.sessionId === mensagem.sessionId);
  if (candidatas.length === 0) candidatas = historico.filter((e) => e.project === mensagem.cwd);
  const alvo = Date.parse(mensagem.timestamp);
  const entrada = candidatas.sort(
    (a, b) => Math.abs(a.timestamp - alvo) - Math.abs(b.timestamp - alvo),
  )[0];
  if (!entrada) {
    throw new Error(
      'A mensagem tem texto colado, mas o conteúdo não foi encontrado em history.jsonl; nada foi gravado.',
    );
  }

  const conteudos = new Map<string, string>();
  for (const n of new Set(numeros)) {
    const colado = entrada.pastedContents[n];
    let texto: string | undefined;
    if (typeof colado?.content === 'string') texto = colado.content;
    else if (typeof colado?.contentHash === 'string' && /^[A-Za-z0-9]+$/.test(colado.contentHash)) {
      try {
        texto = await fs.readFile(
          path.join(dirClaude, 'paste-cache', `${colado.contentHash}.txt`),
          'utf8',
        );
      } catch {
        texto = undefined;
      }
    }
    if (texto === undefined) {
      throw new Error(
        `O conteúdo do texto colado #${n} não foi encontrado (history.jsonl e paste-cache); nada foi gravado.`,
      );
    }
    conteudos.set(n, texto);
  }
  const texto = mensagem.texto.replace(MARCADOR, (_m, n: string) => conteudos.get(n) as string);
  return { texto, colagens: numeros.length };
}
