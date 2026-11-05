export declare const NOME_UNIDADE: string;
export declare const CABECALHO: string;
export declare const URL_APP: string;
export declare function caminhoUnidade(opcoes: {
  xdgConfigHome?: string | undefined;
  home: string;
}): string;
export declare function unidadeNossa(texto: string): boolean;
export declare function montarPath(opcoes: { node: string; claude?: string | null }): string;
export declare function gerarUnidade(opcoes: {
  repo: string;
  node: string;
  claude?: string | null;
  vault?: string | null;
}): string;
