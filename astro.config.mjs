import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://hyuntech.ai.kr',
  integrations: [sitemap()],
  compressHTML: true,
  build: {
    inlineStylesheets: 'auto',
  },
  markdown: {
    rehypePlugins: [
      // Add loading="lazy" to all images
      () => {
        return (tree) => {
          const visit = (node) => {
            if (node.type === 'element' && node.tagName === 'img') {
              if (!node.properties) node.properties = {};
              node.properties.loading = 'lazy';
              // Ensure alt attribute exists for accessibility
              if (!node.properties.alt) node.properties.alt = '';
            }
            if (node.children) {
              node.children.forEach(visit);
            }
          };
          visit(tree);
        };
      },
    ],
  },
  vite: {
    build: {
      cssMinify: true,
    },
  },
});
