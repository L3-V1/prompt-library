import type { Change } from '../core/index';

export interface Lado {
  /** Número da linha, a partir de 1. */
  n: number;
  texto: string;
  /** Última linha do texto, sem `\n` no fim. */
  semQuebraFinal?: true;
}

export type TipoLinha = 'igual' | 'alterada' | 'removida' | 'adicionada';

export interface LinhaDiff {
  esquerda?: Lado;
  direita?: Lado;
  tipo: TipoLinha;
}

/** Quebra o `value` de um `Change` em linhas, marcando a última se faltar o `\n` final. */
function linhas(valor: string): { texto: string; semQuebraFinal: boolean }[] {
  if (valor === '') return [];
  const partes = valor.split('\n');
  const terminaComQuebra = partes.at(-1) === '';
  if (terminaComQuebra) partes.pop();
  return partes.map((texto, i) => ({
    texto,
    semQuebraFinal: !terminaComQuebra && i === partes.length - 1,
  }));
}

/**
 * Converte o `Change[]` de `diffLines(esquerda, direita)` em linhas lado a lado. Remoções e
 * adições consecutivas são emparelhadas linha a linha (`alterada`); as que sobram ficam sozinhas.
 */
export function linhasLadoALado(changes: readonly Change[]): LinhaDiff[] {
  const resultado: LinhaDiff[] = [];
  let nEsq = 0;
  let nDir = 0;
  const lado = (texto: string, semQuebraFinal: boolean, n: number): Lado =>
    semQuebraFinal ? { n, texto, semQuebraFinal: true } : { n, texto };

  let removidas: Lado[] = [];
  let adicionadas: Lado[] = [];
  const despejar = () => {
    const total = Math.max(removidas.length, adicionadas.length);
    for (let i = 0; i < total; i++) {
      const esquerda = removidas[i];
      const direita = adicionadas[i];
      if (esquerda && direita) resultado.push({ esquerda, direita, tipo: 'alterada' });
      else if (esquerda) resultado.push({ esquerda, tipo: 'removida' });
      else if (direita) resultado.push({ direita, tipo: 'adicionada' });
    }
    removidas = [];
    adicionadas = [];
  };

  for (const change of changes) {
    const partes = linhas(change.value);
    if (change.removed) {
      for (const p of partes) removidas.push(lado(p.texto, p.semQuebraFinal, ++nEsq));
    } else if (change.added) {
      for (const p of partes) adicionadas.push(lado(p.texto, p.semQuebraFinal, ++nDir));
    } else {
      despejar();
      for (const p of partes) {
        resultado.push({
          esquerda: lado(p.texto, p.semQuebraFinal, ++nEsq),
          direita: lado(p.texto, p.semQuebraFinal, ++nDir),
          tipo: 'igual',
        });
      }
    }
  }
  despejar();
  return resultado;
}

/** O diff não tem nenhuma linha diferente. */
export function semDiferencas(changes: readonly Change[]): boolean {
  return changes.every((c) => !c.added && !c.removed);
}
