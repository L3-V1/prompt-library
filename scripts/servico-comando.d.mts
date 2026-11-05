export type ComandoExistente = null | { tipo: 'link'; alvo: string } | { tipo: 'outro' };

export declare const ORIGEM_COMANDO: string;
export declare const LIMITE_ESPERA_MS: number;
export declare const INTERVALO_ESPERA_MS: number;
export declare function comandoNosso(alvo: string): boolean;
export declare function acaoInstalarComando(opcoes: {
  existente: ComandoExistente;
  origem: string;
}): 'criar' | 'nada' | 'refazer' | 'conflito';
export declare function acaoRemoverComando(opcoes: {
  existente: ComandoExistente;
}): 'ausente' | 'apagar' | 'alheio';
export declare function esperarApp(opcoes: {
  consultar: () => boolean | Promise<boolean>;
  agora: () => number;
  dormir: (ms: number) => Promise<void>;
  limiteMs?: number;
  intervaloMs?: number;
}): Promise<boolean>;
