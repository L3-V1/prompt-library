import { markdown } from '@codemirror/lang-markdown';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { EditorState, type Extension } from '@codemirror/state';
import { EditorView, keymap, placeholder as placeholderCm } from '@codemirror/view';
import { tags as t } from '@lezer/highlight';
import { basicSetup } from 'codemirror';
import { useEffect, useRef, type RefObject } from 'react';

// Tema ligado aos tokens CSS: troca sozinho com `data-tema`.
const tema = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '14px',
    color: 'var(--texto)',
    backgroundColor: 'var(--fundo)',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'var(--fonte-mono)', lineHeight: '1.65' },
  '.cm-content': { padding: '16px 0', caretColor: 'var(--terracota)' },
  '.cm-line': { padding: '0 20px 0 12px' },
  '.cm-gutters': {
    backgroundColor: 'var(--fundo)',
    color: 'var(--texto-suave)',
    border: 'none',
    opacity: '0.7',
  },
  '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--realce) 55%, transparent)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--texto)' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--terracota)', borderLeftWidth: '2px' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground':
    { backgroundColor: 'color-mix(in srgb, var(--terracota) 25%, transparent) !important' },
  '.cm-selectionMatch': {
    backgroundColor: 'color-mix(in srgb, var(--terracota) 14%, transparent)',
  },
  '.cm-placeholder': { color: 'var(--texto-suave)', fontStyle: 'italic' },
  '.cm-panels': { backgroundColor: 'var(--superficie)', color: 'var(--texto)' },
  '.cm-panels.cm-panels-top': { borderBottom: '1px solid var(--borda)' },
  '.cm-searchMatch': { backgroundColor: 'color-mix(in srgb, var(--terracota) 30%, transparent)' },
  '.cm-tooltip': {
    backgroundColor: 'var(--elevada)',
    border: '1px solid var(--borda)',
    color: 'var(--texto)',
  },
  '.cm-foldPlaceholder': {
    backgroundColor: 'var(--realce)',
    border: 'none',
    color: 'var(--texto-suave)',
  },
});

const realce = HighlightStyle.define([
  { tag: t.heading, color: 'var(--terracota)', fontWeight: '700' },
  { tag: t.strong, fontWeight: '700' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: [t.link, t.url], color: 'var(--destaque)', textDecoration: 'underline' },
  { tag: t.monospace, color: 'var(--destaque)' },
  { tag: [t.processingInstruction, t.contentSeparator, t.meta], color: 'var(--texto-suave)' },
  { tag: t.quote, color: 'var(--texto-suave)', fontStyle: 'italic' },
  { tag: t.list, color: 'var(--terracota)' },
  { tag: [t.keyword, t.operator], color: 'var(--destaque)' },
  { tag: [t.string, t.special(t.string)], color: 'var(--sucesso)' },
  { tag: [t.number, t.bool, t.atom], color: 'var(--terracota)' },
  { tag: [t.comment], color: 'var(--texto-suave)', fontStyle: 'italic' },
  { tag: [t.typeName, t.className, t.propertyName], color: 'var(--texto)', fontWeight: '600' },
]);

interface Callbacks {
  onMudar: (valor: string) => void;
  onSalvar: () => void;
}

function extensoes(
  callbacks: RefObject<Callbacks>,
  rotulo: string,
  placeholder: string | undefined,
): Extension[] {
  return [
    keymap.of([
      {
        key: 'Mod-s',
        preventDefault: true,
        run: () => {
          callbacks.current.onSalvar();
          return true;
        },
      },
    ]),
    basicSetup,
    markdown({ codeLanguages: languages }),
    syntaxHighlighting(realce),
    EditorView.lineWrapping,
    tema,
    EditorView.contentAttributes.of({ 'aria-label': rotulo }),
    EditorView.updateListener.of((u) => {
      if (u.docChanged) callbacks.current.onMudar(u.state.doc.toString());
    }),
    placeholder ? placeholderCm(placeholder) : [],
  ];
}

/**
 * CodeMirror 6 com Markdown (decisão 24). O `EditorView` é criado uma vez; quando `valor` muda
 * por fora (recarregar, restaurar), o conteúdo é trocado por transação. Trocar `documento`
 * recria o estado (e o histórico de desfazer).
 */
export function Editor({
  documento,
  valor,
  onMudar,
  onSalvar,
  placeholder,
  rotulo,
}: {
  /** Identidade do documento; mudar zera o histórico. */
  documento: string;
  valor: string;
  onMudar: (valor: string) => void;
  onSalvar: () => void;
  placeholder?: string;
  rotulo: string;
}) {
  const hospedeiro = useRef<HTMLDivElement>(null);
  const vista = useRef<EditorView | null>(null);
  const callbacks = useRef<Callbacks>({ onMudar, onSalvar });
  useEffect(() => {
    callbacks.current = { onMudar, onSalvar };
  });

  // Cria o EditorView (e o recria ao trocar de documento).
  const valorRef = useRef(valor);
  useEffect(() => {
    valorRef.current = valor;
  });
  useEffect(() => {
    if (!hospedeiro.current) return;
    const v = new EditorView({
      parent: hospedeiro.current,
      state: EditorState.create({
        doc: valorRef.current,
        extensions: extensoes(callbacks, rotulo, placeholder),
      }),
    });
    vista.current = v;
    return () => {
      v.destroy();
      vista.current = null;
    };
    // `rotulo` e `placeholder` são fixos por documento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documento]);

  // Valor trocado por fora: transação que substitui o documento inteiro.
  useEffect(() => {
    const v = vista.current;
    if (!v) return;
    const atual = v.state.doc.toString();
    if (atual !== valor) v.dispatch({ changes: { from: 0, to: atual.length, insert: valor } });
  }, [valor]);

  return <div ref={hospedeiro} className="h-full min-h-0 overflow-hidden" />;
}
