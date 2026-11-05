import type { Acervo, Diretrizes } from '../core/index.js';
import type { ServicoAnalise } from './analise/servico.js';
import type { Eventos } from './eventos.js';
import type { Indice } from './indice.js';

/** Dependências do app; `main.ts` monta as reais, os testes montam sobre um vault temporário. */
export interface Deps {
  acervo: Acervo;
  indice: Indice;
  diretrizes: Diretrizes;
  eventos: Eventos;
  analises: ServicoAnalise;
}
