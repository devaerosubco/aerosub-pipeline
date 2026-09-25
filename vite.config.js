import { defineConfig } from 'vite';

// The app is a single static site: root index.html -> src/main.js + src/style.css.
// No framework, no SSR. Build output goes to dist/ for Cloudflare Pages.
export default defineConfig({
  build: {
    outDir: 'dist',
    target: 'es2022',
  },
  server: {
    port: 5173,
    strictPort: false,
  },
  test: {
    include: ['src/**/*.test.js', 'scripts/**/*.test.js', 'chrome-extension/**/*.test.js', 'supabase/functions/**/*.test.js'],
    environment: 'node',
  },
});
