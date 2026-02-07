const fs = require('fs');
const path = require('path');
const { getPublishedPages, getPageBlocks, extractPageProperties } = require('./lib/notion-client.cjs');
const { blocksToMarkdown } = require('./lib/notion-to-markdown.cjs');
const { downloadImages, removeImages } = require('./lib/image-downloader.cjs');
const { generateFrontmatter } = require('./lib/frontmatter.cjs');

const POSTS_DIR = path.join(__dirname, '../src/content/posts');
const CACHE_FILE = path.join(__dirname, '.sync-cache.json');

async function main() {
  console.log('🔄 Notion 동기화 시작...\n');

  // 1. 캐시 로드
  const cache = loadCache();

  // 2. Notion에서 Published 페이지 조회
  const pages = await getPublishedPages();
  console.log(`📄 Notion에서 ${pages.length}개의 Published 페이지 발견\n`);

  // 3. 현재 Notion에 있는 slug 목록 (삭제 감지용)
  const activeSlugMap = new Map();

  // 4. 각 페이지 처리
  for (const page of pages) {
    const props = extractPageProperties(page);

    if (!props.slug || !props.category) {
      console.warn(`⚠️ Slug 또는 Category 누락: "${props.title}" - 건너뜀`);
      continue;
    }

    const fileKey = `${props.category}/${props.slug}`;
    activeSlugMap.set(fileKey, true);

    // 변경 여부 확인 (캐시)
    if (cache[props.notionId] === props.lastEditedTime) {
      console.log(`⏭️  변경 없음: ${props.title}`);
      continue;
    }

    console.log(`📝 동기화 중: ${props.title}`);

    // 블록 가져오기
    const blocks = await getPageBlocks(page.id);

    // 이미지 다운로드
    const imageMap = await downloadImages(blocks, props.slug);

    // Markdown 변환
    const markdown = blocksToMarkdown(blocks, imageMap);

    // 프론트매터 생성
    const frontmatter = generateFrontmatter(props);

    // 파일 저장
    const categoryDir = path.join(POSTS_DIR, props.category);
    if (!fs.existsSync(categoryDir)) {
      fs.mkdirSync(categoryDir, { recursive: true });
    }

    const filePath = path.join(categoryDir, `${props.slug}.md`);
    fs.writeFileSync(filePath, `${frontmatter}\n\n${markdown}\n`, 'utf-8');
    console.log(`  ✅ 저장: ${filePath}\n`);

    // 캐시 업데이트
    cache[props.notionId] = props.lastEditedTime;
  }

  // 5. 삭제된 글 감지 및 제거
  removeDeletedPosts(activeSlugMap, cache);

  // 6. 캐시 저장
  saveCache(cache);

  console.log('\n✅ Notion 동기화 완료!');
}

function loadCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
    }
  } catch {}
  return {};
}

function saveCache(cache) {
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf-8');
}

function removeDeletedPosts(activeSlugMap, cache) {
  if (!fs.existsSync(POSTS_DIR)) return;

  const categories = fs.readdirSync(POSTS_DIR).filter((f) => {
    return fs.statSync(path.join(POSTS_DIR, f)).isDirectory();
  });

  for (const category of categories) {
    const categoryDir = path.join(POSTS_DIR, category);
    const files = fs.readdirSync(categoryDir).filter((f) => f.endsWith('.md'));

    for (const file of files) {
      const slug = file.replace('.md', '');
      const fileKey = `${category}/${slug}`;

      if (!activeSlugMap.has(fileKey)) {
        // Notion에서 삭제됨 → 로컬에서도 제거
        const filePath = path.join(categoryDir, file);
        fs.unlinkSync(filePath);
        removeImages(slug);
        console.log(`🗑️  삭제됨: ${fileKey}`);

        // 캐시에서도 제거
        for (const [id, time] of Object.entries(cache)) {
          // 캐시의 notionId로는 slug를 역추적할 수 없으므로 파일 기반으로 처리
        }
      }
    }
  }
}

main().catch((err) => {
  console.error('❌ 동기화 실패:', err);
  process.exit(1);
});
