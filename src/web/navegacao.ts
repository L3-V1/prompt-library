import { useSyncExternalStore } from 'react';

/**
 * Estado de navegação, guardado na URL (sem router):
 * `?colecao=&tag=&favoritos=1&q=&p=<id>` e `?vista=diretrizes`.
 */
export interface Navegacao {
  /** Ausente = todas; `null` = "Sem coleção" (`colecao=` na URL). */
  colecao?: string | null;
  tag?: string;
  favoritos: boolean;
  q: string;
  /** Prompt aberto no painel 3. */
  p?: string;
  vista: 'prompts' | 'diretrizes';
}

export const NAVEGACAO_INICIAL: Navegacao = { favoritos: false, q: '', vista: 'prompts' };

export function lerNavegacao(busca: string): Navegacao {
  const params = new URLSearchParams(busca);
  const nav: Navegacao = {
    favoritos: params.get('favoritos') === '1',
    q: params.get('q') ?? '',
    vista: params.get('vista') === 'diretrizes' ? 'diretrizes' : 'prompts',
  };
  const colecao = params.get('colecao');
  if (colecao !== null) nav.colecao = colecao === '' ? null : colecao;
  const tag = params.get('tag');
  if (tag) nav.tag = tag;
  const p = params.get('p');
  if (p && nav.vista === 'prompts') nav.p = p;
  return nav;
}

/** A query string da navegação, com `?` (ou vazia). */
export function escreverNavegacao(nav: Navegacao): string {
  const params = new URLSearchParams();
  if (nav.colecao !== undefined) params.set('colecao', nav.colecao ?? '');
  if (nav.tag) params.set('tag', nav.tag);
  if (nav.favoritos) params.set('favoritos', '1');
  if (nav.q) params.set('q', nav.q);
  if (nav.vista === 'diretrizes') params.set('vista', 'diretrizes');
  else if (nav.p) params.set('p', nav.p);
  const texto = params.toString();
  return texto ? `?${texto}` : '';
}

/** Mudança de filtro (painel 1): troca Coleção, Tag e Favoritos de uma vez. */
export interface Filtro {
  colecao?: string | null;
  tag?: string;
  favoritos?: boolean;
}

export function comFiltro(nav: Navegacao, filtro: Filtro): Navegacao {
  const novo: Navegacao = { favoritos: filtro.favoritos ?? false, q: nav.q, vista: nav.vista };
  if (filtro.colecao !== undefined) novo.colecao = filtro.colecao;
  if (filtro.tag !== undefined) novo.tag = filtro.tag;
  if (nav.p !== undefined) novo.p = nav.p;
  return novo;
}

export function semPrompt(nav: Navegacao): Navegacao {
  const novo = { ...nav, vista: 'prompts' as const };
  delete novo.p;
  return novo;
}

// --- Store sobre `history` ---

let atual: Navegacao =
  typeof window === 'undefined' ? NAVEGACAO_INICIAL : lerNavegacao(window.location.search);
const ouvintes = new Set<() => void>();

function definir(nav: Navegacao, modo: 'push' | 'replace' | 'nenhum'): void {
  atual = nav;
  const url = `${window.location.pathname}${escreverNavegacao(nav)}`;
  if (modo === 'push') window.history.pushState(null, '', url);
  else if (modo === 'replace') window.history.replaceState(null, '', url);
  for (const ouvinte of ouvintes) ouvinte();
}

function assinar(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte);
  return () => ouvintes.delete(ouvinte);
}

export function useNavegacao(): Navegacao {
  return useSyncExternalStore(assinar, () => atual);
}

export function navegacaoAtual(): Navegacao {
  return atual;
}

// --- Proteção de saída com alterações pendentes (decisão 9) ---

/** Registrada pelo editor aberto enquanto há alterações não salvas. */
export interface Protecao {
  /** Salva; `false` se não deu (erro ou conflito), e então a saída é cancelada. */
  salvar(): Promise<boolean>;
  descartar(): void;
}

export type EscolhaSaida = 'salvar' | 'descartar' | 'continuar';

let protecao: Protecao | null = null;
let perguntar: (() => Promise<EscolhaSaida>) | null = null;

export function registrarProtecao(p: Protecao): () => void {
  protecao = p;
  return () => {
    if (protecao === p) protecao = null;
  };
}

export function haPendencias(): boolean {
  return protecao !== null;
}

/** O diálogo "Descartar alterações?" registra aqui como perguntar ao usuário. */
export function registrarPergunta(fn: () => Promise<EscolhaSaida>): () => void {
  perguntar = fn;
  return () => {
    if (perguntar === fn) perguntar = null;
  };
}

/** Executa `acao` se não há pendências, ou depois que o usuário salvar ou descartar. */
export async function confirmarSaida(acao: () => void): Promise<void> {
  const p = protecao;
  if (!p) {
    acao();
    return;
  }
  const escolha = perguntar ? await perguntar() : 'continuar';
  if (escolha === 'continuar') return;
  if (escolha === 'salvar') {
    if (!(await p.salvar())) return;
  } else {
    p.descartar();
  }
  if (protecao === p) protecao = null;
  acao();
}

const mudaPainel = (a: Navegacao, b: Navegacao) => a.p !== b.p || a.vista !== b.vista;

/** Navega; trocar de Prompt ou de vista passa por `confirmarSaida`, salvo com `forcar`. */
export function navegar(
  fn: (nav: Navegacao) => Navegacao,
  opcoes: { substituir?: boolean; forcar?: boolean } = {},
): void {
  const novo = fn(atual);
  const ir = () => definir(novo, opcoes.substituir ? 'replace' : 'push');
  if (!opcoes.forcar && mudaPainel(atual, novo)) void confirmarSaida(ir);
  else ir();
}

export const abrirPrompt = (id: string, opcoes: { forcar?: boolean } = {}) =>
  navegar((n) => ({ ...semPrompt(n), p: id }), opcoes);
export const fecharPainel = (opcoes: { forcar?: boolean } = {}) => navegar(semPrompt, opcoes);
export const abrirDiretrizes = () => navegar((n) => ({ ...semPrompt(n), vista: 'diretrizes' }));
export const filtrar = (filtro: Filtro) => navegar((n) => comFiltro(n, filtro));
export const buscarTexto = (q: string) => navegar((n) => ({ ...n, q }), { substituir: true });

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    const novo = lerNavegacao(window.location.search);
    if (protecao && mudaPainel(atual, novo)) {
      // A URL já mudou: volta para a anterior e só segue se o usuário confirmar.
      const anterior = atual;
      definir(anterior, 'push');
      void confirmarSaida(() => definir(novo, 'push'));
      return;
    }
    definir(novo, 'nenhum');
  });
  window.addEventListener('beforeunload', (e) => {
    if (protecao) e.preventDefault();
  });
}
