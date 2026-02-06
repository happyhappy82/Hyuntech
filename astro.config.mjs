import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://hyuntech.ai.kr',
  compressHTML: true,
  build: {
    inlineStylesheets: 'auto',
  },
  vite: {
    build: {
      cssMinify: true,
    },
  },
});
