import { mensagemDeErro } from './dados/cliente';
import { moverPrompt } from './dados/consultas';
import { avisarGravado } from './dados/eventos';
import { toast } from './componentes/Toaster';
import { SEM_COLECAO } from './textos';

/** Move o Prompt (seletor do painel ou soltura na navegação) e avisa o painel aberto. */
export async function moverParaColecao(id: string, colecao: string | null): Promise<void> {
  try {
    const novo = await moverPrompt(id, colecao);
    avisarGravado(novo);
    toast.sucesso(`Movido para ${colecao ?? SEM_COLECAO}`);
  } catch (erro) {
    toast.erro(`Não foi possível mover: ${mensagemDeErro(erro)}`);
  }
}

// --- Arrastar da lista para uma Coleção (decisão 125) ---

/** Tipo próprio no `dataTransfer`, para só aceitar o que veio da lista. */
export const MIME_PROMPT = 'application/x-prompt-library';

/** O Prompt sendo arrastado; `colecao` é a de origem (`null` = "Sem coleção"). */
export interface Arrastado {
  id: string;
  colecao: string | null;
}

// O `dataTransfer` só é legível no `drop`; no `dragover` a origem vem daqui.
let atual: Arrastado | null = null;

export function iniciarArrasto(item: Arrastado): void {
  atual = item;
}

export function arrastado(): Arrastado | null {
  return atual;
}

export function encerrarArrasto(): void {
  atual = null;
}
