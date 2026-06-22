import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Frontend build. Source files live in src/ and ds/ (design tokens, fonts,
// assets). Output goes to dist/ — point the Render static site there.
export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true },
});
