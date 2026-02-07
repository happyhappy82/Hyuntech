import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import type { APIContext } from 'astro';

export async function GET(context: APIContext) {
  const posts = await getCollection('posts');

  const sortedPosts = posts.sort((a, b) =>
    new Date(b.data.date).getTime() - new Date(a.data.date).getTime()
  );

  return rss({
    title: 'HyunTech - 실사용 기반 전자제품 추천 & 비교',
    description: '실사용 기반 노트북, 모니터, 태블릿, 오디오 추천 & 비교. 전문가 리뷰와 최저가 비교로 최적의 선택을 도와드립니다.',
    site: context.site!.toString(),
    items: sortedPosts.map((post) => ({
      title: post.data.title,
      pubDate: new Date(post.data.date),
      description: post.data.description,
      link: `/category/${post.data.category}/${post.data.slug}/`,
    })),
    customData: '<language>ko</language>',
  });
}
