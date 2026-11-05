import type { SugestaoGerada } from '../../core/index.js';

export interface DadosPrompt {
  /** Conteúdo de `_Diretrizes.md`; vazio = sem Diretrizes. */
  diretrizes: string;
  instrucao: string;
  titulo: string;
  /** Caminho do Prompt relativo a `Prompts/` (o cwd do Claude). */
  caminho: string;
  rascunho: string;
  rejeitadas: readonly SugestaoGerada[];
  /** Regenerar uma Sugestão só: a antiga, para o Claude propor exatamente uma substituta. */
  alvo?: SugestaoGerada;
}

const INICIO = '<<<PROMPT';
const FIM = 'PROMPT>>>';

function bloco(rotulo: string, texto: string): string {
  return `## ${rotulo}\n\n${texto.trim()}\n`;
}

function sugestaoComoTexto(s: SugestaoGerada): string {
  return [
    `- Trecho original: ${JSON.stringify(s.trechoOriginal)}`,
    `  Trecho novo: ${JSON.stringify(s.trechoNovo)}`,
    `  Justificativa: ${s.justificativa}`,
  ].join('\n');
}

/** O texto mandado ao `claude -p` para gerar Sugestões de melhoria de um Prompt. */
export function montarPrompt(d: DadosPrompt): string {
  const partes: string[] = [];

  partes.push(
    'Você é um especialista em engenharia de prompts. Sua tarefa é analisar o Prompt abaixo ' +
      'e propor Sugestões pontuais de melhoria. Cada Sugestão troca um trecho do Prompt por ' +
      'um texto novo e explica o motivo. Não reescreva o Prompt inteiro.\n',
  );

  partes.push(
    bloco(
      'Diretrizes do usuário',
      d.diretrizes.trim() === ''
        ? '(sem Diretrizes: use boas práticas gerais de escrita de prompts)'
        : `Siga estas Diretrizes ao avaliar o Prompt:\n\n${d.diretrizes}`,
    ),
  );

  if (d.instrucao.trim() !== '') {
    partes.push(bloco('Instrução para esta Análise', d.instrucao));
  }

  partes.push(
    bloco(
      'O Prompt',
      `Título: ${d.titulo}\n` +
        `Arquivo: ${d.caminho} (relativo ao diretório atual, a pasta Prompts/ do usuário). ` +
        'Você pode ler outros Prompts dessa pasta com Read, Glob e Grep se quiser ver o estilo ' +
        'ou o contexto dele, mas analise o texto entre os delimitadores abaixo, que é o ' +
        'Rascunho atual e pode diferir do arquivo.\n\n' +
        `${INICIO}\n${d.rascunho}\n${FIM}`,
    ),
  );

  partes.push(
    bloco(
      'Regras das Sugestões',
      [
        `- \`trechoOriginal\` é copiado literalmente do texto entre ${INICIO} e ${FIM}, caractere por caractere (espaços, pontuação e quebras de linha), e não pode ser vazio.`,
        '- Use o menor `trechoOriginal` possível que identifique a mudança sem ambiguidade.',
        '- As Sugestões não podem se sobrepor: nenhum trecho pode conter, ou compartilhar texto com, o trecho de outra.',
        '- `trechoNovo` é o texto que substitui o trecho; para remover, use texto vazio.',
        '- `justificativa` é curta, em português do Brasil.',
        '- Não mude o idioma do Prompt: o `trechoNovo` fica no mesmo idioma do texto original.',
        '- Proponha só mudanças que melhorem o Prompt de fato; se não houver nenhuma, devolva a lista vazia.',
      ].join('\n'),
    ),
  );

  if (d.rejeitadas.length > 0) {
    partes.push(
      bloco(
        'Sugestões já rejeitadas pelo usuário (não as repita)',
        d.rejeitadas.map(sugestaoComoTexto).join('\n'),
      ),
    );
  }

  if (d.alvo) {
    partes.push(
      bloco(
        'Pedido',
        'O usuário pediu para regenerar esta Sugestão:\n\n' +
          `${sugestaoComoTexto(d.alvo)}\n\n` +
          'Proponha exatamente uma Sugestão substituta, diferente desta, para a mesma parte ' +
          'do Prompt (o trecho pode ser outro, desde que exista no texto atual).',
      ),
    );
  } else {
    partes.push(bloco('Pedido', 'Devolva a lista de Sugestões.'));
  }

  return partes.join('\n');
}
