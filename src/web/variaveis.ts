/**
 * Variáveis `{{nome}}` no corpo do Prompt (decisões 114 a 118 e 126): o nome é feito de letras,
 * dígitos, `_` e `-`, com espaços nas pontas aparados. `{{nome do cliente}}`, `{{}}` e `{{{a}}}`
 * não são Variáveis. Vale em qualquer lugar do texto, inclusive em blocos de código.
 *
 * Só espaços e tabs nas pontas (`\s` aceitaria quebra de linha). Global: `matchAll`, `replace`
 * e o `MatchDecorator` do editor zeram o `lastIndex` sozinhos.
 */
export const PADRAO_VARIAVEL = /(?<!\{)\{\{[ \t]*([\p{L}\p{N}_-]+)[ \t]*\}\}(?!\})/gu;

/** Nomes únicos, na ordem da primeira ocorrência (maiúsculas contam). */
export function extrairVariaveis(corpo: string): string[] {
  const nomes = new Set<string>();
  for (const m of corpo.matchAll(PADRAO_VARIAVEL)) nomes.add(m[1] as string);
  return [...nomes];
}

/** Troca cada Variável pelo seu valor; ausente ou vazio mantém o `{{nome}}` como está. */
export function preencher(corpo: string, valores: Record<string, string>): string {
  return corpo.replace(PADRAO_VARIAVEL, (ocorrencia, nome: string) => {
    const valor = Object.hasOwn(valores, nome) ? valores[nome] : undefined;
    return valor ? valor : ocorrencia;
  });
}

// --- Memória por Prompt (decisão 116) ---

const chave = (id: string) => `prompt-library:variaveis:${id}`;

export function lerValoresSalvos(id: string): Record<string, string> {
  try {
    const bruto = localStorage.getItem(chave(id));
    if (!bruto) return {};
    const dados: unknown = JSON.parse(bruto);
    if (typeof dados !== 'object' || dados === null || Array.isArray(dados)) return {};
    const valores: Record<string, string> = {};
    for (const [nome, valor] of Object.entries(dados)) {
      if (typeof valor === 'string') valores[nome] = valor;
    }
    return valores;
  } catch {
    return {};
  }
}

export function salvarValores(id: string, valores: Record<string, string>): void {
  try {
    localStorage.setItem(chave(id), JSON.stringify(valores));
  } catch {
    // Sem localStorage (modo privado): fica só nesta sessão.
  }
}
