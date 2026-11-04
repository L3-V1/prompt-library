import type { ReactNode } from 'react';

import { Icone, type NomeIcone } from './Icone';

export function EstadoVazio({
  icone,
  titulo,
  children,
}: {
  icone: NomeIcone;
  titulo: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-realce text-terracota">
        <Icone nome={icone} className="size-6" />
      </div>
      <h3 className="font-serif text-base font-semibold">{titulo}</h3>
      {children && <div className="max-w-xs text-sm text-suave">{children}</div>}
    </div>
  );
}
