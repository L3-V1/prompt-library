import { useEffect, type ReactNode } from 'react';

/**
 * Três painéis (decisão 26): navegação (~240px), lista (~320px) e Prompt. Abaixo de 1024px a
 * navegação vira gaveta; abaixo de 768px aparece um painel por vez (lista ou Prompt).
 */
export function Layout({
  navegacao,
  lista,
  principal,
  principalAberto,
  gavetaAberta,
  onFecharGaveta,
}: {
  navegacao: ReactNode;
  lista: ReactNode;
  principal: ReactNode;
  /** Há um Prompt ou as Diretrizes no painel 3 (nas telas estreitas, esconde a lista). */
  principalAberto: boolean;
  gavetaAberta: boolean;
  onFecharGaveta: () => void;
}) {
  useEffect(() => {
    if (!gavetaAberta) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onFecharGaveta();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [gavetaAberta, onFecharGaveta]);

  return (
    <div className="grid h-dvh grid-cols-1 overflow-hidden md:grid-cols-[320px_1fr] lg:grid-cols-[240px_320px_1fr]">
      {gavetaAberta && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          aria-hidden="true"
          onClick={onFecharGaveta}
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-[260px] border-r border-borda bg-superficie shadow-flutuante transition-transform duration-200 lg:static lg:z-auto lg:w-auto lg:translate-x-0 lg:shadow-none ${
          gavetaAberta ? 'translate-x-0' : 'max-lg:invisible -translate-x-full'
        }`}
      >
        {navegacao}
      </aside>
      <section
        aria-label="Lista de Prompts"
        className={`min-h-0 border-r border-borda bg-superficie/60 ${principalAberto ? 'hidden md:block' : ''}`}
      >
        {lista}
      </section>
      <main className={`min-h-0 min-w-0 bg-fundo ${principalAberto ? '' : 'hidden md:block'}`}>
        {principal}
      </main>
    </div>
  );
}
