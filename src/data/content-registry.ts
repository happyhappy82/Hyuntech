export type ContentType = '추천 리스트' | '제품 리뷰' | '구매 가이드' | '비교 분석';
export type Category = 'laptop' | 'monitor' | 'tablet' | 'audio';

export interface ContentItem {
  slug: string;
  title: string;
  description: string;
  category: Category;
  contentType: ContentType;
  date: string;
  readTime: string;
  featured?: boolean;
  emoji: string;
}

export interface CategoryMeta {
  name: string;
  description: string;
  emoji: string;
}

export const categoryMeta: Record<Category, CategoryMeta> = {
  laptop: {
    name: '노트북',
    description: '용도별 최적의 노트북 추천, 비교 분석, 구매 가이드',
    emoji: '&#128187;',
  },
  monitor: {
    name: '모니터',
    description: '업무용, 게이밍, 디자인 모니터 추천 및 비교',
    emoji: '&#128424;',
  },
  tablet: {
    name: '태블릿',
    description: 'iPad부터 Galaxy Tab까지, 용도별 태블릿 추천',
    emoji: '&#128241;',
  },
  audio: {
    name: '오디오',
    description: '이어폰, 헤드폰, 스피커 추천 및 비교 분석',
    emoji: '&#127911;',
  },
};

export const contentItems: ContentItem[] = [
  // ===== LAPTOP =====
  {
    slug: 'best-student-laptops-2025',
    title: '2025년 대학생용 노트북 추천 TOP 7 (실사용 기준)',
    description: '과제, 영상 편집, 코딩까지 가능한 모델 중심으로 선정했습니다. 배터리, 무게, 성능, 가격 대비 최고의 노트북 7종.',
    category: 'laptop',
    contentType: '추천 리스트',
    date: '2025.02.01',
    readTime: '12분',
    featured: true,
    emoji: '&#128187;',
  },

  // ===== MONITOR =====
  {
    slug: 'best-monitors-2025',
    title: '2025년 모니터 추천 TOP 6 - 업무용/게이밍/디자인별 최고의 선택',
    description: '27인치 4K 업무용부터 32인치 게이밍까지, 실사용 기준 최고의 모니터를 선정했습니다.',
    category: 'monitor',
    contentType: '추천 리스트',
    date: '2025.01.28',
    readTime: '10분',
    featured: true,
    emoji: '&#128424;',
  },

  // ===== TABLET =====
  {
    slug: 'best-tablets-2025',
    title: '2025년 태블릿 추천 TOP 6 - iPad vs Galaxy Tab 비교',
    description: 'iPad Air, iPad Pro, Galaxy Tab 실사용 비교로 용도별 최적의 태블릿을 선정했습니다.',
    category: 'tablet',
    contentType: '추천 리스트',
    date: '2025.01.25',
    readTime: '11분',
    featured: true,
    emoji: '&#128241;',
  },

  // ===== AUDIO =====
  {
    slug: 'best-audio-2025',
    title: '2025년 이어폰/헤드폰 추천 TOP 6 - 노이즈캔슬링 완벽 비교',
    description: 'AirPods Pro 2, Sony WF-1000XM5 등 실사용 비교로 최고의 오디오 제품을 선정했습니다.',
    category: 'audio',
    contentType: '추천 리스트',
    date: '2025.01.20',
    readTime: '9분',
    featured: true,
    emoji: '&#127911;',
  },
];

export function getContentByCategory(category: Category): ContentItem[] {
  return contentItems.filter((item) => item.category === category);
}

export function getContentByType(category: Category, type: ContentType): ContentItem[] {
  return contentItems.filter((item) => item.category === category && item.contentType === type);
}

/**
 * Notion 콘텐츠 컬렉션의 글을 ContentItem 형태로 변환
 * 카테고리 목록 페이지에서 Notion 글도 함께 표시할 때 사용
 */
export function notionPostToContentItem(post: {
  data: {
    title: string;
    description: string;
    category: Category;
    contentType: ContentType;
    slug: string;
    date: string;
    readTime: string;
    featured: boolean;
  };
}): ContentItem {
  const cat = post.data.category;
  return {
    slug: post.data.slug,
    title: post.data.title,
    description: post.data.description,
    category: cat,
    contentType: post.data.contentType,
    date: post.data.date,
    readTime: post.data.readTime,
    featured: post.data.featured,
    emoji: categoryMeta[cat].emoji,
  };
}

/**
 * 하드코딩 글 + Notion 글을 합쳐서 반환 (날짜 역순)
 */
export function mergeWithNotionPosts(
  category: Category,
  notionPosts: Array<{
    data: {
      title: string;
      description: string;
      category: Category;
      contentType: ContentType;
      slug: string;
      date: string;
      readTime: string;
      featured: boolean;
    };
  }>
): ContentItem[] {
  const hardcoded = getContentByCategory(category);
  const fromNotion = notionPosts
    .filter((p) => p.data.category === category)
    .map(notionPostToContentItem);

  return [...hardcoded, ...fromNotion].sort((a, b) => {
    return b.date.localeCompare(a.date);
  });
}

/**
 * Notion 글의 href 경로 (기존 글과 구분)
 */
export function getNotionPostHref(item: ContentItem): string {
  return `/posts/${item.category}/${item.slug}/`;
}

/**
 * 기존 하드코딩 글의 href 경로
 */
export function getHardcodedPostHref(item: ContentItem): string {
  return `/category/${item.category}/${item.slug}/`;
}
