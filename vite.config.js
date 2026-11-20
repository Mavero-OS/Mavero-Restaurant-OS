import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

// base './' keeps every asset path relative, so the same build works on
// https://<user>.github.io/<repo>/ and on a custom domain.
export default defineConfig({
  base: './',
  plugins: [preact()],
  esbuild: { loader: 'jsx', include: /src\/.*\.js$/, exclude: [] },
  optimizeDeps: { esbuildOptions: { loader: { '.js': 'jsx' } } },
  build: { target: 'es2020', sourcemap: false, chunkSizeWarningLimit: 900 },
});
