import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import './estilos.css';
import './tema';
import { clienteConsultas } from './dados/consultas';
import { App } from './App';
import { Toaster } from './componentes/Toaster';

const root = document.getElementById('root');
if (!root) throw new Error('Elemento #root não encontrado');

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={clienteConsultas}>
      <App />
      <Toaster />
    </QueryClientProvider>
  </StrictMode>,
);
