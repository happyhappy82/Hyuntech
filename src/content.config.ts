import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const posts = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/posts' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    category: z.string(),
    contentType: z.string(),
    slug: z.string(),
    date: z.string(),
    readTime: z.string(),
    featured: z.boolean().default(false),
    notionId: z.string().optional(),
    lastEditedTime: z.string().optional(),
  }),
});

export const collections = { posts };
