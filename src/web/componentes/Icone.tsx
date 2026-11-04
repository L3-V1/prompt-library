const CAMINHOS = {
  estrela: 'M12 3.5l2.6 5.3 5.9.9-4.25 4.1 1 5.85L12 16.9l-5.25 2.75 1-5.85L3.5 9.7l5.9-.9z',
  copiar: 'M9 9h10v11H9zM5 15V4h10',
  historico: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2',
  lixeira: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  mais: 'M12 5v14M5 12h14',
  menu: 'M4 6h16M4 12h16M4 18h16',
  x: 'M6 6l12 12M18 6L6 18',
  busca: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
  sol: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  lua: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
  monitor: 'M3 4h18v12H3zM8 20h8M12 16v4',
  voltar: 'M15 18l-6-6 6-6',
  lapis: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  pasta: 'M3 6h6l2 2h10v11H3z',
  tag: 'M3 3h8l10 10-8 8L3 11zM7.5 7.5h.01',
  todos: 'M4 5h16M4 12h16M4 19h16',
  inbox: 'M3 13l3-8h12l3 8v6H3zM3 13h5l1 3h6l1-3h5',
  livro: 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h11',
  certo: 'M5 12l5 5 9-10',
  alerta:
    'M12 8v5M12 16.5h.01M10.3 3.9L2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  info: 'M12 11v6M12 7.5h.01M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
  salvar: 'M5 3h11l3 3v15H5zM8 3v5h7M8 21v-7h8v7',
  mais_opcoes: 'M12 6h.01M12 12h.01M12 18h.01',
  diff: 'M12 3v18M5 8h4M7 6v4M15 16h4',
} as const;

export type NomeIcone = keyof typeof CAMINHOS;

export function Icone({
  nome,
  className = 'size-4',
  preenchido = false,
}: {
  nome: NomeIcone;
  className?: string;
  preenchido?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={preenchido ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={preenchido ? 1.5 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d={CAMINHOS[nome]} />
    </svg>
  );
}
