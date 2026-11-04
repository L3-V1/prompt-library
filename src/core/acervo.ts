import type { Stats } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

import { diffLines, type Change } from 'diff';

import { caminhoLivre, gravarAtomico, hashDe, limparNome, nomeSeguro } from './arquivos.js';
import {
  ColecaoInvalidaError,
  ColecaoJaExisteError,
  ColecaoNaoEncontradaError,
  ConflitoError,
  FrontmatterInvalidoError,
  PromptNaoEncontradoError,
} from './erros.js';
import {
  definirCampo,
  definirId,
  definirTags,
  juntar,
  lerCampos,
  separar,
  type ArquivoSeparado,
} from './frontmatter.js';
import { idValido, novoId } from './ids.js';
import type {
  MotivoVersao,
  Origem,
  Pastas,
  Problema,
  Prompt,
  ResultadoListagem,
  Versao,
  VersaoComConteudo,
} from './tipos.js';
import { criarVersoes } from './versoes.js';

export interface NovoPrompt {
  titulo: string;
  corpo: string;
  tags?: string[];
  favorito?: boolean;
  colecao?: string | null;
  origem?: Origem;
  motivo?: MotivoVersao;
}

export interface AlteracoesPrompt {
  titulo?: string;
  tags?: string[];
  corpo?: string;
}

/** Um `.md` lido do disco, com o frontmatter já separado. */
interface Entrada {
  absoluto: string;
  texto: string;
  separado: ArquivoSeparado;
  prompt: Prompt;
}

/** Arquivo lido mas ainda sem id resolvido. */
interface Lido {
  absoluto: string;
  bytes: Buffer;
  stat: Stats;
  separado: ArquivoSeparado;
  id: unknown;
}

const ehOculto = (nome: string) => nome.startsWith('.') || nome.startsWith('_');

function normalizarTags(tags: string[]): string[] {
  return [...new Set(tags.map((t) => t.trim().replace(/^#/, '')).filter((t) => t !== ''))];
}

function mesmasTags(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((t, i) => t === b[i]);
}

function normalizarTitulo(titulo: string): string {
  return titulo.trim() || 'Sem título';
}

function nomeColecao(nome: string): string {
  const limpo = limparNome(nome);
  if (/^\s*[._]/.test(nome) || limpo === '') throw new ColecaoInvalidaError(nome);
  return limpo;
}

/**
 * Operações sobre os Prompts e as Coleções em `<vault>/Prompts/`. Não guarda estado:
 * cada operação relê o disco (o índice em memória fica para o M3).
 */
export function criarAcervo(pastas: Pastas) {
  const versoes = criarVersoes(pastas);

  const relativo = (absoluto: string) =>
    path.relative(pastas.prompts, absoluto).split(path.sep).join('/');

  function montarPrompt(
    absoluto: string,
    bytes: Buffer | string,
    mtime: number,
    separado: ArquivoSeparado,
    id: string,
  ): Prompt {
    const campos = lerCampos(separado.dados);
    const caminho = relativo(absoluto);
    const segmentos = caminho.split('/');
    return {
      id,
      titulo: campos.titulo ?? path.basename(absoluto, '.md'),
      tags: campos.tags,
      favorito: campos.favorito,
      colecao: segmentos.length > 1 ? (segmentos[0] ?? null) : null,
      corpo: separado.corpo,
      caminho,
      mtime,
      hash: hashDe(bytes),
      ...(campos.origem ? { origem: campos.origem } : {}),
    };
  }

  async function lerArquivo(absoluto: string): Promise<Lido> {
    const [bytes, stat] = await Promise.all([fs.readFile(absoluto), fs.stat(absoluto)]);
    const separado = separar(bytes.toString('utf8'));
    return { absoluto, bytes, stat, separado, id: lerCampos(separado.dados).id };
  }

  async function* arquivosMd(dir: string): AsyncGenerator<string> {
    let entradas;
    try {
      entradas = await fs.readdir(dir, { withFileTypes: true });
    } catch (erro) {
      if ((erro as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw erro;
    }
    entradas.sort((a, b) => a.name.localeCompare(b.name));
    for (const e of entradas) {
      if (ehOculto(e.name)) continue;
      const absoluto = path.join(dir, e.name);
      if (e.isDirectory()) yield* arquivosMd(absoluto);
      else if (e.isFile() && e.name.endsWith('.md')) yield absoluto;
    }
  }

  /** Grava `separado` em `absoluto`, desde que o arquivo ainda tenha o hash esperado. */
  async function regravar(
    absoluto: string,
    hashEsperado: string,
    separado: ArquivoSeparado,
  ): Promise<string> {
    const atual = await fs.readFile(absoluto);
    if (hashDe(atual) !== hashEsperado) {
      throw new Error('o arquivo mudou durante a varredura; será tratado na próxima');
    }
    const texto = juntar(separado);
    await gravarAtomico(absoluto, texto);
    return texto;
  }

  /** Lê `Prompts/`, atribui ids ausentes ou duplicados e devolve os Prompts e os problemas. */
  async function varrer(): Promise<{ entradas: Entrada[]; problemas: Problema[] }> {
    const lidos: Lido[] = [];
    const problemas: Problema[] = [];
    for await (const absoluto of arquivosMd(pastas.prompts)) {
      try {
        lidos.push(await lerArquivo(absoluto));
      } catch (erro) {
        const mensagem =
          erro instanceof FrontmatterInvalidoError ? erro.message : `Erro ao ler: ${String(erro)}`;
        problemas.push({ caminho: relativo(absoluto), mensagem });
      }
    }

    // Decisão 6: id ausente recebe um novo. Id duplicado: o arquivo mais antigo (mtime) fica com ele.
    const porId = new Map<string, Lido[]>();
    const semId: Lido[] = [];
    for (const l of lidos) {
      if (!idValido(l.id)) semId.push(l);
      else porId.set(l.id, [...(porId.get(l.id) ?? []), l]);
    }
    for (const grupo of porId.values()) {
      grupo.sort((a, b) => a.stat.mtimeMs - b.stat.mtimeMs || a.absoluto.localeCompare(b.absoluto));
      semId.push(...grupo.slice(1));
    }
    const usados = new Set(porId.keys());
    const precisaId = new Set(semId);

    const entradas: Entrada[] = [];
    for (const l of lidos) {
      if (!precisaId.has(l)) {
        const texto = l.bytes.toString('utf8');
        const prompt = montarPrompt(
          l.absoluto,
          l.bytes,
          l.stat.mtimeMs,
          l.separado,
          l.id as string,
        );
        entradas.push({ absoluto: l.absoluto, texto, separado: l.separado, prompt });
        continue;
      }
      let id = novoId();
      while (usados.has(id)) id = novoId();
      try {
        definirId(l.separado, id);
        const texto = await regravar(l.absoluto, hashDe(l.bytes), l.separado);
        usados.add(id);
        const { mtimeMs } = await fs.stat(l.absoluto);
        const prompt = montarPrompt(l.absoluto, texto, mtimeMs, l.separado, id);
        entradas.push({ absoluto: l.absoluto, texto, separado: l.separado, prompt });
      } catch (erro) {
        problemas.push({
          caminho: relativo(l.absoluto),
          mensagem: `Não foi possível gravar o id: ${erro instanceof Error ? erro.message : String(erro)}`,
        });
      }
    }

    entradas.sort((a, b) => a.prompt.caminho.localeCompare(b.prompt.caminho));
    return { entradas, problemas };
  }

  async function encontrar(id: string): Promise<Entrada> {
    if (!idValido(id)) throw new PromptNaoEncontradoError(id);
    const { entradas } = await varrer();
    const entrada = entradas.find((e) => e.prompt.id === id);
    if (!entrada) throw new PromptNaoEncontradoError(id);
    return entrada;
  }

  /** Relê um arquivo que já tem id resolvido. */
  async function lerPrompt(absoluto: string, id: string): Promise<Prompt> {
    const l = await lerArquivo(absoluto);
    return montarPrompt(absoluto, l.bytes, l.stat.mtimeMs, l.separado, id);
  }

  async function listar(): Promise<ResultadoListagem> {
    const { entradas, problemas } = await varrer();
    return { prompts: entradas.map((e) => e.prompt), problemas };
  }

  async function ler(id: string): Promise<Prompt> {
    return (await encontrar(id)).prompt;
  }

  async function criar(novo: NovoPrompt): Promise<Prompt> {
    const colecao = novo.colecao ? nomeColecao(novo.colecao) : null;
    const dir = colecao ? path.join(pastas.prompts, colecao) : pastas.prompts;
    const titulo = normalizarTitulo(novo.titulo);
    const id = novoId();

    const separado: ArquivoSeparado = { dados: null, corpo: novo.corpo, bom: false, eol: '\n' };
    definirId(separado, id);
    definirCampo(separado, 'titulo', titulo);
    definirTags(separado, normalizarTags(novo.tags ?? []));
    definirCampo(separado, 'favorito', novo.favorito ?? false);
    if (novo.origem) definirCampo(separado, 'origem', novo.origem);
    const texto = juntar(separado);

    await fs.mkdir(dir, { recursive: true });
    const absoluto = await caminhoLivre(dir, nomeSeguro(titulo));
    await gravarAtomico(absoluto, texto);
    await versoes.registrar(id, texto, novo.motivo ?? 'criacao');
    return lerPrompt(absoluto, id);
  }

  async function confirmarInalterado(entrada: Entrada): Promise<void> {
    const bytes = await fs.readFile(entrada.absoluto);
    if (hashDe(bytes) !== entrada.prompt.hash) {
      const atual = await lerArquivo(entrada.absoluto);
      throw new ConflitoError(
        montarPrompt(
          entrada.absoluto,
          atual.bytes,
          atual.stat.mtimeMs,
          atual.separado,
          entrada.prompt.id,
        ),
      );
    }
  }

  /**
   * Salva alterações de conteúdo (decisões 9 e 10). Lança `ConflitoError` se o arquivo no
   * disco não tem mais o hash `baseHash`. Cria uma Versão do novo estado.
   */
  async function salvar(
    id: string,
    alteracoes: AlteracoesPrompt,
    baseHash: string,
    motivo: MotivoVersao = 'manual',
  ): Promise<Prompt> {
    const entrada = await encontrar(id);
    const { prompt, separado } = entrada;
    if (prompt.hash !== baseHash) throw new ConflitoError(prompt);

    let destino = entrada.absoluto;
    if (alteracoes.titulo !== undefined) {
      const titulo = normalizarTitulo(alteracoes.titulo);
      if (titulo !== prompt.titulo) {
        definirCampo(separado, 'titulo', titulo);
        const nome = nomeSeguro(titulo);
        if (nome !== path.basename(entrada.absoluto, '.md')) {
          destino = await caminhoLivre(
            path.dirname(entrada.absoluto),
            nome,
            '.md',
            entrada.absoluto,
          );
        }
      }
    }
    if (alteracoes.tags !== undefined) {
      const tags = normalizarTags(alteracoes.tags);
      if (!mesmasTags(tags, prompt.tags)) definirTags(separado, tags);
    }
    if (alteracoes.corpo !== undefined) separado.corpo = alteracoes.corpo;

    const texto = juntar(separado);
    if (texto === entrada.texto && destino === entrada.absoluto) return prompt;

    // Prompt vindo do Obsidian: registra o estado atual como base para o diff.
    if ((await versoes.listar(id)).length === 0) {
      await versoes.registrar(id, entrada.texto, 'criacao');
    }
    await confirmarInalterado(entrada);
    await gravarAtomico(entrada.absoluto, texto);
    if (destino !== entrada.absoluto) await fs.rename(entrada.absoluto, destino);
    await versoes.registrar(id, texto, motivo);
    return lerPrompt(destino, id);
  }

  /** Marca ou desmarca como Favorito. Só regrava o frontmatter; não cria Versão. */
  async function favoritar(id: string, valor: boolean): Promise<Prompt> {
    const entrada = await encontrar(id);
    if (entrada.prompt.favorito === valor) return entrada.prompt;
    definirCampo(entrada.separado, 'favorito', valor);
    await confirmarInalterado(entrada);
    await gravarAtomico(entrada.absoluto, juntar(entrada.separado));
    return lerPrompt(entrada.absoluto, id);
  }

  /** Move o Prompt para outra Coleção (ou para a raiz, com `null`). Não cria Versão. */
  async function mover(id: string, colecao: string | null): Promise<Prompt> {
    const entrada = await encontrar(id);
    const nome = colecao === null ? null : nomeColecao(colecao);
    if (nome === entrada.prompt.colecao) return entrada.prompt;
    const dir = nome === null ? pastas.prompts : path.join(pastas.prompts, nome);
    await fs.mkdir(dir, { recursive: true });
    const destino = await caminhoLivre(dir, nomeSeguro(entrada.prompt.titulo));
    await fs.rename(entrada.absoluto, destino);
    return lerPrompt(destino, id);
  }

  /** Move o arquivo para `<vault>/.trash/`, como o Obsidian (decisão 11). As Versões ficam. */
  async function excluir(id: string): Promise<void> {
    const entrada = await encontrar(id);
    await fs.mkdir(pastas.lixeira, { recursive: true });
    const destino = await caminhoLivre(pastas.lixeira, path.basename(entrada.absoluto, '.md'));
    await fs.rename(entrada.absoluto, destino);
  }

  // --- Coleções ---

  async function listarColecoes(): Promise<string[]> {
    try {
      const entradas = await fs.readdir(pastas.prompts, { withFileTypes: true });
      return entradas
        .filter((e) => e.isDirectory() && !ehOculto(e.name))
        .map((e) => e.name)
        .sort((a, b) => a.localeCompare(b, 'pt-BR'));
    } catch (erro) {
      if ((erro as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw erro;
    }
  }

  async function criarColecao(nome: string): Promise<string> {
    const limpo = nomeColecao(nome);
    await fs.mkdir(pastas.prompts, { recursive: true });
    try {
      await fs.mkdir(path.join(pastas.prompts, limpo));
    } catch (erro) {
      if ((erro as NodeJS.ErrnoException).code === 'EEXIST') throw new ColecaoJaExisteError(limpo);
      throw erro;
    }
    return limpo;
  }

  async function renomearColecao(antigo: string, novo: string): Promise<string> {
    if (!(await listarColecoes()).includes(antigo)) throw new ColecaoNaoEncontradaError(antigo);
    const limpo = nomeColecao(novo);
    if (limpo === antigo) return limpo;
    const destino = path.join(pastas.prompts, limpo);
    try {
      await fs.access(destino);
      throw new ColecaoJaExisteError(limpo);
    } catch (erro) {
      if (erro instanceof ColecaoJaExisteError) throw erro;
    }
    await fs.rename(path.join(pastas.prompts, antigo), destino);
    return limpo;
  }

  // --- Versões (decisões 7 e 8) ---

  function listarVersoes(id: string): Promise<Versao[]> {
    return versoes.listar(id);
  }

  function lerVersao(id: string, versaoId: string): Promise<VersaoComConteudo> {
    return versoes.ler(id, versaoId);
  }

  /** Diff por linhas do arquivo completo entre duas Versões, ou entre uma Versão e o estado atual. */
  async function diff(
    id: string,
    deVersaoId: string,
    paraVersaoId: string | 'atual',
  ): Promise<Change[]> {
    const de = (await versoes.ler(id, deVersaoId)).conteudo;
    const para =
      paraVersaoId === 'atual'
        ? (await encontrar(id)).texto
        : (await versoes.ler(id, paraVersaoId)).conteudo;
    return diffLines(de, para);
  }

  /**
   * Volta `titulo`, `tags` e `corpo` ao estado de uma Versão, mantendo Favorito, Coleção e
   * campos desconhecidos atuais. Passa por `salvar`: cria Versão e respeita o conflito.
   */
  async function restaurar(id: string, versaoId: string, baseHash: string): Promise<Prompt> {
    const versao = await versoes.ler(id, versaoId);
    const snapshot = separar(versao.conteudo);
    const campos = lerCampos(snapshot.dados);
    return salvar(
      id,
      {
        ...(campos.titulo !== null ? { titulo: campos.titulo } : {}),
        tags: campos.tags,
        corpo: snapshot.corpo,
      },
      baseHash,
      'restauracao',
    );
  }

  return {
    pastas,
    listar,
    ler,
    criar,
    salvar,
    favoritar,
    mover,
    excluir,
    listarColecoes,
    criarColecao,
    renomearColecao,
    listarVersoes,
    lerVersao,
    diff,
    restaurar,
  };
}

export type Acervo = ReturnType<typeof criarAcervo>;
