import { defineConfig } from 'vite';

export default defineConfig({
  // Ruta base para GitHub Pages (repositorio: Mercat_front)
  base: '/Mercat_front/',
  server: {
    port: 3000,
    open: true
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true
  }
});
