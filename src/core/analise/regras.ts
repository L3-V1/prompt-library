/**
 * Regras puras da Análise (decisões 13 a 16), sem Node: localizar os trechos no Rascunho,
 * recalcular os status depois de uma edição, aceitar, rejeitar e incorporar Sugestões geradas.
 * Nenhuma função muda a Análise recebida; todas devolvem uma nova.
 */
import { SugestaoIndisponivelError } from '../erros.js';
import { novoId } from '../ids.js';
import type { Analise, Sugestao, SugestaoGerada } from '../tipos.js';

/** Uma edição no Rascunho: em `pos`, `removidos` caracteres viraram `inseridos` caracteres. */
export interface Edicao {
  pos: number;
  removidos: number;
  inseridos: number;
}

/**
 * Onde está `trecho` no Rascunho: na própria `pista`, se ele ainda estiver lá; senão, a
 * ocorrência mais próxima dela (a primeira, sem pista); `null` se não houver nenhuma.
 */
export function localizar(rascunho: string, trecho: string, pista: number | null): number | null {
  if (trecho === '') return null;
  if (pista !== null && rascunho.startsWith(trecho, pista)) return pista;
  let melhor: number | null = null;
  for (let i = rascunho.indexOf(trecho); i >= 0; i = rascunho.indexOf(trecho, i + 1)) {
    if (pista === null) return i;
    if (melhor === null || Math.abs(i - pista) < Math.abs(melhor - pista)) melhor = i;
    else if (i > pista) break;
  }
  return melhor;
}

/** A edição mínima entre dois textos, pelo prefixo e pelo sufixo comuns. */
export function inferirEdicao(antes: string, depois: string): Edicao {
  const limite = Math.min(antes.length, depois.length);
  let prefixo = 0;
  while (prefixo < limite && antes[prefixo] === depois[prefixo]) prefixo++;
  let sufixo = 0;
  while (
    sufixo < limite - prefixo &&
    antes[antes.length - 1 - sufixo] === depois[depois.length - 1 - sufixo]
  ) {
    sufixo++;
  }
  return {
    pos: prefixo,
    removidos: antes.length - prefixo - sufixo,
    inseridos: depois.length - prefixo - sufixo,
  };
}

/**
 * Nova pista para um trecho em `inicio` depois da edição: antes da edição fica igual, depois
 * dela desloca, e dentro dela vai para o ponto da edição (o `localizar` decide se ainda vale).
 */
function deslocar(inicio: number, tamanho: number, edicao: Edicao): number {
  if (inicio + tamanho <= edicao.pos) return inicio;
  if (inicio >= edicao.pos + edicao.removidos) return inicio + edicao.inseridos - edicao.removidos;
  return edicao.pos;
}

const recalculavel = (s: Sugestao) => s.status === 'pendente' || s.status === 'desatualizada';

/**
 * Troca o Rascunho e recalcula as Sugestões `pendente` e `desatualizada`: a que ainda acha o
 * trecho fica (ou volta a ser) `pendente`; a que não acha fica `desatualizada`. Sem `edicao`
 * (Rascunho vindo do editor), ela é inferida comparando o Rascunho antigo e o novo.
 */
export function recalcular(analise: Analise, novoRascunho: string, edicao?: Edicao): Analise {
  const e = edicao ?? inferirEdicao(analise.rascunho, novoRascunho);
  const sugestoes = analise.sugestoes.map((s): Sugestao => {
    if (!recalculavel(s)) return s;
    const pista = s.inicio === null ? null : deslocar(s.inicio, s.trechoOriginal.length, e);
    const inicio = localizar(novoRascunho, s.trechoOriginal, pista);
    return inicio === null
      ? { ...s, status: 'desatualizada', inicio: null }
      : { ...s, status: 'pendente', inicio };
  });
  return { ...analise, rascunho: novoRascunho, sugestoes };
}

function exigir(analise: Analise, sid: string): Sugestao {
  const sugestao = analise.sugestoes.find((s) => s.id === sid);
  if (!sugestao) throw new SugestaoIndisponivelError(sid, 'Sugestão não encontrada.');
  return sugestao;
}

const comStatus = (analise: Analise, sid: string, mudar: Partial<Sugestao>): Sugestao[] =>
  analise.sugestoes.map((s) => (s.id === sid ? { ...s, ...mudar } : s));

/**
 * Aplica uma Sugestão `pendente` no Rascunho e recalcula as outras: as seguintes se deslocam,
 * e uma sobreposta perde o trecho e fica desatualizada (decisão 16).
 */
export function aceitar(analise: Analise, sid: string): Analise {
  const s = exigir(analise, sid);
  if (s.status !== 'pendente') {
    throw new SugestaoIndisponivelError(
      sid,
      s.status === 'desatualizada'
        ? 'A Sugestão está desatualizada: o trecho dela não existe mais no Rascunho.'
        : 'A Sugestão já foi decidida.',
    );
  }
  const inicio = localizar(analise.rascunho, s.trechoOriginal, s.inicio);
  if (inicio === null) {
    throw new SugestaoIndisponivelError(sid, 'O trecho da Sugestão não existe mais no Rascunho.');
  }
  const r = analise.rascunho;
  const rascunho = r.slice(0, inicio) + s.trechoNovo + r.slice(inicio + s.trechoOriginal.length);
  const marcada = { ...analise, sugestoes: comStatus(analise, sid, { status: 'aceita', inicio }) };
  return recalcular(marcada, rascunho, {
    pos: inicio,
    removidos: s.trechoOriginal.length,
    inseridos: s.trechoNovo.length,
  });
}

/** Dispensa uma Sugestão `pendente` ou `desatualizada`. */
export function rejeitar(analise: Analise, sid: string): Analise {
  const s = exigir(analise, sid);
  if (!recalculavel(s)) throw new SugestaoIndisponivelError(sid, 'A Sugestão já foi decidida.');
  return { ...analise, sugestoes: comStatus(analise, sid, { status: 'rejeitada' }) };
}

/** `tudo` regenera a lista; um id regenera só aquela Sugestão. */
export type AlvoIncorporacao = 'tudo' | string;

const mesmaSugestao = (a: SugestaoGerada, b: SugestaoGerada) =>
  a.trechoOriginal === b.trechoOriginal && a.trechoNovo === b.trechoNovo;

/**
 * Junta as Sugestões geradas pelo Claude à Análise:
 * - `tudo`: mantém as decididas (aceitas e rejeitadas, que entram no próximo pedido) e troca
 *   as pendentes e desatualizadas pelas novas;
 * - um id: troca aquela Sugestão, na mesma posição da lista, pela primeira gerada válida.
 *
 * São descartadas as geradas cujo trecho não existe no Rascunho, as que não mudam nada e as
 * repetidas de uma rejeitada; `descartadas` é o total, para o aviso.
 */
export function incorporar(
  analise: Analise,
  geradas: readonly SugestaoGerada[],
  alvo: AlvoIncorporacao,
): { analise: Analise; descartadas: number } {
  const rejeitadas = analise.sugestoes.filter((s) => s.status === 'rejeitada');
  const validas: Sugestao[] = [];
  for (const g of geradas) {
    const inicio = localizar(analise.rascunho, g.trechoOriginal, null);
    if (inicio === null || g.trechoOriginal === g.trechoNovo) continue;
    if (rejeitadas.some((r) => mesmaSugestao(r, g))) continue;
    validas.push({
      id: novoId(),
      justificativa: g.justificativa,
      trechoOriginal: g.trechoOriginal,
      trechoNovo: g.trechoNovo,
      status: 'pendente',
      inicio,
    });
  }

  if (alvo === 'tudo') {
    const decididas = analise.sugestoes.filter((s) => !recalculavel(s));
    return {
      analise: { ...analise, sugestoes: [...decididas, ...validas] },
      descartadas: geradas.length - validas.length,
    };
  }

  const i = analise.sugestoes.findIndex((s) => s.id === alvo);
  const antiga = analise.sugestoes[i];
  const substituta = validas[0];
  // A Sugestão foi decidida ou removida durante a execução, ou nenhuma gerada serviu.
  if (!antiga || !recalculavel(antiga) || !substituta) {
    return { analise, descartadas: geradas.length };
  }
  const sugestoes = [...analise.sugestoes];
  sugestoes[i] = substituta;
  return { analise: { ...analise, sugestoes }, descartadas: geradas.length - 1 };
}
