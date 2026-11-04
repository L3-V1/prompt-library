import { Document, isMap, isNode, isScalar, isSeq, parseDocument, YAMLMap, YAMLSeq } from 'yaml';

import { FrontmatterInvalidoError } from './erros.js';
import type { Origem } from './tipos.js';

export type Eol = '\n' | '\r\n';

export interface ArquivoSeparado {
  /** Frontmatter como `Document` do `yaml` (preserva ordem, comentários e campos), ou `null` se não houver. */
  dados: Document | null;
  /** Tudo depois do `---` de fechamento (ou o arquivo inteiro, sem frontmatter). */
  corpo: string;
  bom: boolean;
  eol: Eol;
}

const BOM = '﻿';
const ABERTURA = /^---[ \t]*(\r?\n)/;
const FECHAMENTO = /^---[ \t]*(?:\r?\n|$)/m;

/**
 * Separa frontmatter e corpo. Lança `FrontmatterInvalidoError` se o frontmatter tiver
 * YAML inválido ou não for um mapa: nesse caso o arquivo não é Prompt e não deve ser regravado.
 */
export function separar(texto: string): ArquivoSeparado {
  const bom = texto.startsWith(BOM);
  const semBom = bom ? texto.slice(1) : texto;
  const abertura = ABERTURA.exec(semBom);

  if (!abertura) {
    const i = semBom.indexOf('\n');
    const eol: Eol = i > 0 && semBom[i - 1] === '\r' ? '\r\n' : '\n';
    return { dados: null, corpo: semBom, bom, eol };
  }

  const eol: Eol = abertura[1] === '\r\n' ? '\r\n' : '\n';
  const resto = semBom.slice(abertura[0].length);
  const fechamento = FECHAMENTO.exec(resto);
  if (!fechamento) {
    // Sem `---` de fechamento não há frontmatter (como no Obsidian).
    return { dados: null, corpo: semBom, bom, eol };
  }

  const yaml = resto.slice(0, fechamento.index);
  const corpo = resto.slice(fechamento.index + fechamento[0].length);
  const dados = parseDocument(yaml);
  if (dados.errors.length > 0) {
    throw new FrontmatterInvalidoError(`YAML inválido no frontmatter: ${dados.errors[0]?.message}`);
  }
  if (dados.contents !== null && !isMap(dados.contents)) {
    throw new FrontmatterInvalidoError('O frontmatter não é um mapa de campos.');
  }
  return { dados, corpo, bom, eol };
}

/** Monta o arquivo de volta. O corpo é concatenado sem nenhuma alteração. */
export function juntar({ dados, corpo, bom, eol }: ArquivoSeparado): string {
  let cabecalho = '';
  if (dados) {
    let yaml =
      dados.contents === null ? '' : dados.toString({ lineWidth: 0, flowCollectionPadding: false });
    if (yaml !== '' && !yaml.endsWith('\n')) yaml += '\n';
    cabecalho = `---\n${yaml}---\n`;
    if (eol === '\r\n') cabecalho = cabecalho.replace(/\r?\n/g, '\r\n');
  }
  return (bom ? BOM : '') + cabecalho + corpo;
}

/** Garante um `Document` com um mapa, criando um vazio se o arquivo não tinha frontmatter. */
export function garantirDados(separado: ArquivoSeparado): Document {
  if (!separado.dados) separado.dados = new Document({});
  const dados = separado.dados;
  if (dados.contents === null) dados.contents = dados.createNode({});
  return dados;
}

function mapa(dados: Document): YAMLMap {
  if (!isMap(dados.contents)) dados.contents = dados.createNode({});
  return dados.contents as YAMLMap;
}

/** Define `id`: mantém a posição se o campo já existe, senão o insere como primeiro campo. */
export function definirId(separado: ArquivoSeparado, id: string): void {
  const dados = garantirDados(separado);
  const m = mapa(dados);
  if (m.has('id')) {
    definirCampo(separado, 'id', id);
    return;
  }
  const par = dados.createPair('id', id);
  // O comentário antes do primeiro campo fica no topo, acima do `id`.
  const primeira = m.items[0]?.key;
  if (isNode(primeira) && isNode(par.key)) {
    if (primeira.commentBefore) par.key.commentBefore = primeira.commentBefore;
    if (primeira.spaceBefore) par.key.spaceBefore = primeira.spaceBefore;
    delete primeira.commentBefore;
    delete primeira.spaceBefore;
  }
  m.items.unshift(par);
}

/** Define um campo. Escalares existentes são alterados no lugar, mantendo comentário de linha. */
export function definirCampo(separado: ArquivoSeparado, chave: string, valor: unknown): void {
  const dados = garantirDados(separado);
  const m = mapa(dados);
  const anterior = m.get(chave, true);
  if (isScalar(anterior) && (valor === null || typeof valor !== 'object')) {
    anterior.value = valor;
    if (typeof valor !== 'string') delete anterior.type;
    return;
  }
  m.set(chave, dados.createNode(valor));
}

/** Define `tags` em estilo flow (`[a, b]`), mantendo o estilo de bloco se o campo já era assim. */
export function definirTags(separado: ArquivoSeparado, tags: string[]): void {
  const dados = garantirDados(separado);
  const m = mapa(dados);
  const anterior = m.get('tags', true);
  const no = dados.createNode(tags, { flow: true }) as YAMLSeq;
  if (isSeq(anterior)) no.flow = anterior.flow ?? false;
  m.set('tags', no);
}

// --- Leitura dos campos conhecidos, com validação leve ---

export interface CamposConhecidos {
  id: unknown;
  titulo: string | null;
  tags: string[];
  favorito: boolean;
  origem?: Origem;
}

function texto(valor: unknown): string | null {
  if (typeof valor === 'string') return valor.trim() || null;
  if (typeof valor === 'number' || typeof valor === 'boolean') return String(valor);
  return null;
}

function lerTags(valor: unknown): string[] {
  const brutas: unknown[] = Array.isArray(valor)
    ? valor
    : typeof valor === 'string'
      ? valor.split(/[,\s]+/)
      : valor === null || valor === undefined
        ? []
        : [valor];
  const tags = brutas.map((t) => texto(t)?.replace(/^#/, '') ?? '').filter((t) => t !== '');
  return [...new Set(tags)];
}

function lerOrigem(valor: unknown): Origem | undefined {
  if (valor === null || typeof valor !== 'object' || Array.isArray(valor)) return undefined;
  const o = valor as Record<string, unknown>;
  return {
    projeto: texto(o['projeto']) ?? '',
    data: texto(o['data']) ?? '',
    sessao: texto(o['sessao']) ?? '',
  };
}

export function lerCampos(dados: Document | null): CamposConhecidos {
  const js: unknown = dados?.toJS() ?? {};
  const obj = (js !== null && typeof js === 'object' ? js : {}) as Record<string, unknown>;
  const origem = lerOrigem(obj['origem']);
  return {
    id: obj['id'],
    titulo: texto(obj['titulo']),
    tags: lerTags(obj['tags']),
    favorito: obj['favorito'] === true || obj['favorito'] === 'true',
    ...(origem ? { origem } : {}),
  };
}
