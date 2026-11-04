/** Minúsculas e sem acentos; base da busca do servidor e da similaridade do `/save`. */
export function normalizar(texto: string): string {
  return texto.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
}
