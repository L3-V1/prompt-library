import { markdown } from '@codemirror/lang-markdown';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { EditorState, StateEffect, StateField, type Extension } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  keymap,
  MatchDecorator,
  placeholder as placeholderCm,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';
import { tags as t } from '@lezer/highlight';
import { basicSetup } from 'codemirror';
import { useEffect, useRef, type RefObject } from 'react';

import { PADRAO_VARIAVEL } from '../variaveis';

// Tema ligado aos tokens CSS: troca sozinho com `data-tema`.
const tema = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '15px',
    color: 'var(--texto)',
    backgroundColor: 'var(--fundo)',
  },
  '&.cm-focused': { outline: 'none' },
  // A folha: o texto fica na mesma coluna central do título (utilitário `coluna-folha`).
  '.cm-scroller': {
    fontFamily: 'var(--fonte-mono)',
    lineHeight: '1.7',
    // O número da linha fica na margem, à esquerda da coluna.
    paddingLeft: 'max(0px, calc((100% - var(--largura-folha)) / 2 - 2.75rem))',
    paddingRight: 'max(var(--margem-folha), calc((100% - var(--largura-folha)) / 2))',
  },
  '.cm-content': { padding: '24px 0 96px', caretColor: 'var(--terracota)' },
  '.cm-line': { padding: '0 0 0 12px' },
  '.cm-gutters': {
    backgroundColor: 'var(--fundo)',
    color: 'color-mix(in srgb, var(--texto-suave) 70%, transparent)',
    border: 'none',
    fontSize: '12px',
  },
  '.cm-gutter.cm-lineNumbers .cm-gutterElement': { paddingTop: '2px' },
  '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--realce) 45%, transparent)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--terracota)' },
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
    borderRadius: '8px',
    boxShadow: 'var(--sombra)',
    color: 'var(--texto)',
  },
  '.cm-destaque': {
    backgroundColor: 'color-mix(in srgb, var(--terracota) 28%, transparent)',
    borderRadius: '2px',
    boxShadow: '0 0 0 1px color-mix(in srgb, var(--terracota) 55%, transparent)',
  },
  '.cm-variavel': {
    color: 'var(--variavel)',
    backgroundColor: 'var(--variavel-fundo)',
    borderRadius: '3px',
  },
  '.cm-foldPlaceholder': {
    backgroundColor: 'var(--realce)',
    border: 'none',
    color: 'var(--texto-suave)',
  },
});

const realce = HighlightStyle.define([
  { tag: t.heading, color: 'var(--destaque)', fontWeight: '700' },
  { tag: t.strong, fontWeight: '700' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: [t.link, t.url], color: 'var(--destaque)', textDecoration: 'underline' },
  { tag: t.monospace, color: 'var(--destaque)' },
  { tag: [t.processingInstruction, t.contentSeparator, t.meta], color: 'var(--texto-suave)' },
  { tag: t.quote, color: 'var(--texto-suave)', fontStyle: 'italic' },
  { tag: [t.keyword, t.operator], color: 'var(--destaque)' },
  { tag: [t.string, t.special(t.string)], color: 'var(--sucesso)' },
  { tag: [t.number, t.bool, t.atom], color: 'var(--terracota)' },
  { tag: [t.comment], color: 'var(--texto-suave)', fontStyle: 'italic' },
  { tag: [t.typeName, t.className, t.propertyName], color: 'var(--texto)', fontWeight: '600' },
]);

/** Trecho destacado no texto (a Sugestão sob o mouse ou o foco). */
export interface Destaque {
  inicio: number;
  fim: number;
}

const definirDestaque = StateEffect.define<Destaque | null>();
const marcaDestaque = Decoration.mark({ class: 'cm-destaque' });

const campoDestaque = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(decoracoes, tr) {
    let novas = decoracoes.map(tr.changes);
    for (const efeito of tr.effects) {
      if (!efeito.is(definirDestaque)) continue;
      const d = efeito.value;
      novas =
        d && d.fim > d.inicio
          ? Decoration.set([marcaDestaque.range(d.inicio, d.fim)])
          : Decoration.none;
    }
    return novas;
  },
  provide: (campo) => EditorView.decorations.from(campo),
});

// Variáveis `{{nome}}` com destaque leve (decisão 117), só na parte visível do texto.
const decoradorVariaveis = new MatchDecorator({
  regexp: PADRAO_VARIAVEL,
  decoration: Decoration.mark({ class: 'cm-variavel' }),
});

const destaqueVariaveis = ViewPlugin.fromClass(
  class {
    decoracoes: DecorationSet;
    constructor(view: EditorView) {
      this.decoracoes = decoradorVariaveis.createDeco(view);
    }
    update(u: ViewUpdate) {
      this.decoracoes = decoradorVariaveis.updateDeco(u, this.decoracoes);
    }
  },
  { decorations: (v) => v.decoracoes },
);

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
    destaqueVariaveis,
    campoDestaque,
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
  destaque,
}: {
  /** Identidade do documento; mudar zera o histórico. */
  documento: string;
  valor: string;
  onMudar: (valor: string) => void;
  onSalvar: () => void;
  placeholder?: string;
  rotulo: string;
  /** Trecho a destacar e mostrar na tela; `null` ou ausente apaga o destaque. */
  destaque?: Destaque | null;
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

  // Destaque: decoration no trecho e rolagem até ele.
  const inicio = destaque?.inicio ?? null;
  const fim = destaque?.fim ?? null;
  useEffect(() => {
    const v = vista.current;
    if (!v) return;
    const tamanho = v.state.doc.length;
    if (inicio === null || fim === null || inicio > tamanho) {
      v.dispatch({ effects: definirDestaque.of(null) });
      return;
    }
    const d = { inicio, fim: Math.min(fim, tamanho) };
    v.dispatch({
      effects: [definirDestaque.of(d), EditorView.scrollIntoView(d.inicio, { y: 'center' })],
    });
  }, [inicio, fim, documento, valor]);

  return <div ref={hospedeiro} className="h-full min-h-0 overflow-hidden" />;
}
