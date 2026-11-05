import { useSyncExternalStore } from 'react';

import { lerTextoCopia } from './dados/consultas';
import { extrairVariaveis } from './variaveis';

/** Cópia esperando o formulário de Variáveis (`FormularioVariaveis`, montado no `App`). */
export interface CopiaPendente {
  /** Muda a cada pedido, para o formulário recomeçar mesmo se for o mesmo Prompt. */
  pedido: number;
  id: string;
  titulo: string;
  corpo: string;
  variaveis: string[];
  aoCopiar: () => void;
}

let pendente: CopiaPendente | null = null;
let proximoPedido = 1;
const ouvintes = new Set<() => void>();

function publicar(nova: CopiaPendente | null): void {
  pendente = nova;
  for (const ouvinte of ouvintes) ouvinte();
}

/**
 * Copia o Prompt (botão Copiar e Enter da Paleta). Sem Variáveis, grava direto e chama
 * `aoCopiar`; com Variáveis, abre o formulário, que chama `aoCopiar` ao copiar. Erros sobem.
 */
export async function pedirCopia(pedido: {
  id: string;
  titulo: string;
  aoCopiar: () => void;
}): Promise<void> {
  const corpo = await lerTextoCopia(pedido.id);
  const variaveis = extrairVariaveis(corpo);
  if (variaveis.length === 0) {
    await navigator.clipboard.writeText(corpo);
    pedido.aoCopiar();
    return;
  }
  publicar({ ...pedido, pedido: proximoPedido++, corpo, variaveis });
}

export function fecharCopia(): void {
  publicar(null);
}

function assinar(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte);
  return () => ouvintes.delete(ouvinte);
}

export function useCopiaPendente(): CopiaPendente | null {
  return useSyncExternalStore(assinar, () => pendente);
}
