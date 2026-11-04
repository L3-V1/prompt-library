import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src/web',
  plugins: [react(), tailwindcss()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': 'http://127.0.0.1:5174',
    },
  },
  build: {
    outDir: '../../dist/web',
    emptyOutDir: true,
    // CodeMirror fica no chunk principal; app local, sem custo de rede relevante.
    chunkSizeWarningLimit: 800,
  },
});
