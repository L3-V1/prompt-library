import type { Acervo, Problema, Prompt } from '../core/index.js';
import { buscar, type Filtros } from './busca.js';

/** Ids que mudaram numa releitura do acervo. */
export interface Mudancas {
  criados: string[];
  alterados: string[];
  removidos: string[];
}

export interface TotalColecao {
  /** `null` = "Sem coleção". */
  nome: string | null;
  total: number;
}

export interface TotalTag {
  tag: string;
  total: number;
}

/** Prompt sem o corpo, para a listagem. */
export type Resumo = Omit<Prompt, 'corpo'>;

export function resumir(prompt: Prompt): Resumo {
  const resumo: Partial<Prompt> = { ...prompt };
  delete resumo.corpo;
  return resumo as Resumo;
}

type Ouvinte = (mudancas: Mudancas) => void;

const mesmaLista = (a: readonly unknown[], b: readonly unknown[]) =>
  a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * Índice em memória do acervo. É relido inteiro a cada `atualizar()` (o acervo é pequeno),
 * uma releitura por vez; as mudanças são calculadas pelo hash de cada id.
 */
export function criarIndice(acervo: Pick<Acervo, 'listar' | 'listarColecoes'>) {
  let prompts = new Map<string, Prompt>();
  let problemas: Problema[] = [];
  let colecoesNoDisco: string[] = [];
  const ouvintes = new Set<Ouvinte>();

  async function reler(): Promise<Mudancas> {
    const [listagem, colecoes] = await Promise.all([acervo.listar(), acervo.listarColecoes()]);
    const novos = new Map(listagem.prompts.map((p) => [p.id, p]));
    const mudancas: Mudancas = { criados: [], alterados: [], removidos: [] };
    for (const [id, p] of novos) {
      const antigo = prompts.get(id);
      if (!antigo) mudancas.criados.push(id);
      else if (antigo.hash !== p.hash || antigo.caminho !== p.caminho) mudancas.alterados.push(id);
    }
    for (const id of prompts.keys()) if (!novos.has(id)) mudancas.removidos.push(id);

    const mudouColecoes = !mesmaLista(colecoes, colecoesNoDisco);
    const mudouProblemas = !mesmaLista(
      listagem.problemas.map((p) => `${p.caminho}\0${p.mensagem}`),
      problemas.map((p) => `${p.caminho}\0${p.mensagem}`),
    );
    prompts = novos;
    problemas = listagem.problemas;
    colecoesNoDisco = colecoes;

    const houveMudanca =
      mudancas.criados.length + mudancas.alterados.length + mudancas.removidos.length > 0;
    if (houveMudanca || mudouColecoes || mudouProblemas) {
      for (const ouvinte of ouvintes) {
        try {
          ouvinte(mudancas);
        } catch (erro) {
          console.error('erro num ouvinte do índice:', erro);
        }
      }
    }
    return mudancas;
  }

  // Single-flight: no máximo uma releitura em curso e uma na fila. Quem pede durante uma
  // releitura espera a próxima, que começa depois dela e vê o estado do disco mais novo.
  let emCurso: Promise<Mudancas> | null = null;
  let naFila: Promise<Mudancas> | null = null;

  function iniciar(): Promise<Mudancas> {
    const execucao: Promise<Mudancas> = reler().finally(() => {
      if (emCurso === execucao) emCurso = null;
    });
    emCurso = execucao;
    return execucao;
  }

  /** Relê o acervo e devolve o que mudou desde a releitura anterior. */
  function atualizar(): Promise<Mudancas> {
    if (naFila) return naFila;
    if (emCurso) {
      const fila: Promise<Mudancas> = emCurso
        .catch(() => undefined)
        .then(() => {
          naFila = null;
          return iniciar();
        });
      naFila = fila;
      return fila;
    }
    return iniciar();
  }

  /** Chamado a cada releitura que muda Prompts, Coleções ou problemas. Devolve o cancelamento. */
  function ouvir(ouvinte: Ouvinte): () => void {
    ouvintes.add(ouvinte);
    return () => ouvintes.delete(ouvinte);
  }

  function listar(filtros: Filtros = {}): Prompt[] {
    return buscar(prompts.values(), filtros);
  }

  function obter(id: string): Prompt | undefined {
    return prompts.get(id);
  }

  /** "Sem coleção" primeiro, depois as Coleções (inclusive vazias) em ordem alfabética. */
  function colecoes(): TotalColecao[] {
    const totais = new Map<string | null, number>([[null, 0]]);
    for (const nome of colecoesNoDisco) totais.set(nome, 0);
    for (const p of prompts.values()) totais.set(p.colecao, (totais.get(p.colecao) ?? 0) + 1);
    return [...totais]
      .map(([nome, total]) => ({ nome, total }))
      .sort((a, b) =>
        a.nome === null ? -1 : b.nome === null ? 1 : a.nome.localeCompare(b.nome, 'pt-BR'),
      );
  }

  /** Tags mais usadas primeiro; empate por ordem alfabética. */
  function tags(): TotalTag[] {
    const totais = new Map<string, number>();
    for (const p of prompts.values()) {
      for (const tag of p.tags) totais.set(tag, (totais.get(tag) ?? 0) + 1);
    }
    return [...totais]
      .map(([tag, total]) => ({ tag, total }))
      .sort((a, b) => b.total - a.total || a.tag.localeCompare(b.tag, 'pt-BR'));
  }

  return {
    atualizar,
    ouvir,
    listar,
    obter,
    colecoes,
    tags,
    problemas: (): Problema[] => problemas,
  };
}

export type Indice = ReturnType<typeof criarIndice>;
