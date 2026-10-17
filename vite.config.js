import { defineConfig } from 'vite';

export default defineConfig({
  // Rutas relativas: necesarias para que los recursos carguen dentro del WebView de Capacitor.
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    // Permite probar desde el teléfono en la misma red Wi-Fi.
    host: true,
  },
});
