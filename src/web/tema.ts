import { useSyncExternalStore } from 'react';

export type PreferenciaTema = 'sistema' | 'claro' | 'escuro';
export type Tema = 'claro' | 'escuro';

/** Mesma chave do script inline do `index.html`, que aplica o tema antes do primeiro paint. */
export const CHAVE_TEMA = 'prompt-library:tema';

const consulta = window.matchMedia('(prefers-color-scheme: dark)');
const ouvintes = new Set<() => void>();

function lerPreferencia(): PreferenciaTema {
  const valor = localStorage.getItem(CHAVE_TEMA);
  return valor === 'claro' || valor === 'escuro' ? valor : 'sistema';
}

let preferencia = lerPreferencia();

export function resolverTema(p: PreferenciaTema, sistemaEscuro: boolean): Tema {
  if (p === 'sistema') return sistemaEscuro ? 'escuro' : 'claro';
  return p;
}

function aplicar(): void {
  document.documentElement.dataset['tema'] = resolverTema(preferencia, consulta.matches);
  for (const ouvinte of ouvintes) ouvinte();
}

consulta.addEventListener('change', aplicar);
aplicar();

export function definirPreferencia(p: PreferenciaTema): void {
  preferencia = p;
  if (p === 'sistema') localStorage.removeItem(CHAVE_TEMA);
  else localStorage.setItem(CHAVE_TEMA, p);
  aplicar();
}

function assinar(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte);
  return () => ouvintes.delete(ouvinte);
}

export function usePreferenciaTema(): PreferenciaTema {
  return useSyncExternalStore(assinar, () => preferencia);
}
