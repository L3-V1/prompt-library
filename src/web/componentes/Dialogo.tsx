import { useEffect, useRef, type ReactNode } from 'react';

/**
 * `<dialog>` nativo com `showModal`: foco preso dentro, Esc fecha (pelo `onFechar`) e o foco
 * volta para onde estava ao fechar. O foco inicial vai para o elemento com `data-autofocus`.
 */
export function Dialogo({
  aberto,
  onFechar,
  titulo,
  children,
  className = 'w-[min(32rem,calc(100vw-2rem))]',
  rotulo,
}: {
  aberto: boolean;
  onFechar: () => void;
  /** Título visível; sem ele, use `rotulo` para leitores de tela. */
  titulo?: ReactNode;
  children: ReactNode;
  className?: string;
  rotulo?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const onFecharRef = useRef(onFechar);
  useEffect(() => {
    onFecharRef.current = onFechar;
  });

  useEffect(() => {
    const dialogo = ref.current;
    if (!dialogo || !aberto) return;
    const anterior = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogo.showModal();
    // O `autoFocus` do React roda antes do `showModal`; o foco inicial vem de `data-autofocus`.
    dialogo.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    return () => {
      dialogo.close();
      anterior?.focus();
    };
  }, [aberto]);

  return (
    <dialog
      ref={ref}
      aria-label={rotulo}
      onCancel={(e) => {
        e.preventDefault();
        onFecharRef.current();
      }}
      onMouseDown={(e) => {
        // Clique no backdrop (o próprio <dialog>, fora do conteúdo) fecha.
        if (e.target === e.currentTarget) onFecharRef.current();
      }}
      className={`m-auto max-h-[calc(100dvh-2rem)] overflow-visible rounded-2xl bg-elevada p-0 text-texto shadow-flutuante ${className}`}
    >
      {aberto && (
        <div className="flex max-h-[calc(100dvh-2rem)] flex-col">
          {titulo && <h2 className="px-6 pt-6 pb-2 font-serif text-xl font-semibold">{titulo}</h2>}
          {children}
        </div>
      )}
    </dialog>
  );
}
