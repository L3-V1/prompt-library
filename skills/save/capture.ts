import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { ConflitoError, criarAcervo, resolverPastas } from '../../src/core/index.js';
import {
  apagarCaptura,
  atualizarCaptura,
  DIR_CAPTURAS_PADRAO,
  lerCaptura,
  limparCapturasAntigas,
  salvarCaptura,
} from './capturas.js';
import { parecidos } from './similaridade.js';
import {
  capturar,
  localizarTranscript,
  mensagensDigitadas,
  origemDe,
  reconstruirColagens,
} from './transcript.js';

export interface Ambiente {
  env: NodeJS.ProcessEnv;
  cwd: string;
  /** Pasta das Capturas temporárias (padrão: `<tmpdir>/prompt-library-capturas`). */
  dirCapturas?: string;
}

export interface Resultado {
  codigo: number;
  saida: unknown;
}

const USO =
  'Uso: capture extract [N] | capture context <captura> | ' +
  'capture write <captura> (--titulo <t> [--colecao <c>] [--tag <t>]... | --versao-de <id>)';

const TAMANHO_PREVIA = 500;

function dirClaude(env: NodeJS.ProcessEnv): string {
  return env['CLAUDE_CONFIG_DIR'] || path.join(os.homedir(), '.claude');
}

function contarLinhas(texto: string): number {
  if (texto === '') return 0;
  return texto.replace(/\r?\n$/, '').split(/\r?\n/).length;
}

async function extract(posicionais: string[], amb: Ambiente, dirCapturas: string) {
  if (posicionais.length > 1) throw new Error(`Argumentos demais. ${USO}`);
  const bruto = posicionais[0] ?? '1';
  if (!/^\d+$/.test(bruto) || Number(bruto) < 1) {
    throw new Error(`N deve ser um inteiro positivo (recebido: "${bruto}").`);
  }
  await limparCapturasAntigas(dirCapturas);

  const claude = dirClaude(amb.env);
  const transcript = await localizarTranscript({
    sessao: amb.env['CLAUDE_CODE_SESSION_ID'] || undefined,
    cwd: amb.cwd,
    dirClaude: claude,
  });
  const mensagem = capturar(
    mensagensDigitadas(await fs.promises.readFile(transcript, 'utf8')),
    Number(bruto),
  );
  const { texto, colagens } = await reconstruirColagens(mensagem, claude);
  const origem = origemDe(mensagem);
  const captura = await salvarCaptura(dirCapturas, {
    texto,
    origem,
    imagens: mensagem.imagens,
    colagens,
    parecidos: [],
  });
  const caracteres = Array.from(texto);
  return {
    captura,
    previa: caracteres.slice(0, TAMANHO_PREVIA).join(''),
    caracteres: caracteres.length,
    linhas: contarLinhas(texto),
    imagens: mensagem.imagens,
    colagens,
    origem,
  };
}

function idDaCaptura(posicionais: string[]): string {
  const id = posicionais[0];
  if (!id || posicionais.length > 1) throw new Error(USO);
  return id;
}

async function context(posicionais: string[], amb: Ambiente, dirCapturas: string) {
  const id = idDaCaptura(posicionais);
  const captura = await lerCaptura(dirCapturas, id);
  const acervo = criarAcervo(resolverPastas(amb.env));
  const [{ prompts }, colecoes] = await Promise.all([acervo.listar(), acervo.listarColecoes()]);

  const contagem = new Map<string, number>();
  for (const p of prompts) for (const t of p.tags) contagem.set(t, (contagem.get(t) ?? 0) + 1);
  const tags = [...contagem]
    .map(([tag, quantidade]) => ({ tag, quantidade }))
    .sort((a, b) => b.quantidade - a.quantidade || a.tag.localeCompare(b.tag, 'pt-BR'));

  const lista = parecidos(captura.texto, prompts);
  const hashes = new Map(prompts.map((p) => [p.id, p.hash]));
  captura.parecidos = lista.map((p) => ({ id: p.id, hash: hashes.get(p.id) as string }));
  await atualizarCaptura(dirCapturas, id, captura);
  return { colecoes, tags, parecidos: lista };
}

interface OpcoesWrite {
  titulo?: string | undefined;
  colecao?: string | undefined;
  tag?: string[] | undefined;
  'versao-de'?: string | undefined;
}

async function write(
  posicionais: string[],
  opcoes: OpcoesWrite,
  amb: Ambiente,
  dirCapturas: string,
) {
  const id = idDaCaptura(posicionais);
  const captura = await lerCaptura(dirCapturas, id);
  const pastas = resolverPastas(amb.env);
  const acervo = criarAcervo(pastas);
  const versaoDe = opcoes['versao-de'];

  let prompt;
  if (versaoDe !== undefined) {
    if (opcoes.titulo !== undefined || opcoes.colecao !== undefined || opcoes.tag?.length) {
      throw new Error('--versao-de não aceita --titulo, --colecao nem --tag.');
    }
    const base = captura.parecidos.find((p) => p.id === versaoDe);
    if (!base) {
      throw new Error(
        `O Prompt ${versaoDe} não está entre os parecidos desta Captura; rode "capture context" antes.`,
      );
    }
    try {
      prompt = await acervo.salvar(versaoDe, { corpo: captura.texto }, base.hash, 'captura');
    } catch (erro) {
      if (erro instanceof ConflitoError) {
        throw new Error('O Prompt mudou desde a análise; rode o /save de novo.', { cause: erro });
      }
      throw erro;
    }
  } else {
    const titulo = opcoes.titulo?.trim();
    if (!titulo) throw new Error(`Informe --titulo ou --versao-de. ${USO}`);
    prompt = await acervo.criar({
      titulo,
      corpo: captura.texto,
      tags: opcoes.tag ?? [],
      colecao: opcoes.colecao?.trim() || null,
      origem: captura.origem,
      motivo: 'captura',
    });
  }

  await apagarCaptura(dirCapturas, id);
  return {
    id: prompt.id,
    titulo: prompt.titulo,
    caminho: path.join(pastas.prompts, ...prompt.caminho.split('/')),
    novaVersao: versaoDe !== undefined,
  };
}

/** Executa um subcomando e devolve o JSON de saída e o código de retorno. */
export async function rodar(argv: string[], amb: Ambiente): Promise<Resultado> {
  try {
    const { values, positionals } = parseArgs({
      args: argv,
      allowPositionals: true,
      strict: true,
      options: {
        titulo: { type: 'string' },
        colecao: { type: 'string' },
        tag: { type: 'string', multiple: true },
        'versao-de': { type: 'string' },
      },
    });
    const [comando, ...resto] = positionals;
    const dirCapturas = amb.dirCapturas ?? DIR_CAPTURAS_PADRAO;
    const temOpcoes = Object.keys(values).length > 0;
    switch (comando) {
      case 'extract':
        if (temOpcoes) throw new Error(USO);
        return { codigo: 0, saida: await extract(resto, amb, dirCapturas) };
      case 'context':
        if (temOpcoes) throw new Error(USO);
        return { codigo: 0, saida: await context(resto, amb, dirCapturas) };
      case 'write':
        return { codigo: 0, saida: await write(resto, values, amb, dirCapturas) };
      default:
        throw new Error(USO);
    }
  } catch (erro) {
    return { codigo: 1, saida: { erro: erro instanceof Error ? erro.message : String(erro) } };
  }
}

function ehPrincipal(): boolean {
  const script = process.argv[1];
  if (!script) return false;
  try {
    return fs.realpathSync(script) === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (ehPrincipal()) {
  const { codigo, saida } = await rodar(process.argv.slice(2), {
    env: process.env,
    cwd: process.cwd(),
  });
  process.stdout.write(`${JSON.stringify(saida, null, 2)}\n`);
  process.exitCode = codigo;
}
