const fs = require('fs');
const path = require('path');
const {
  getPublishedPages,
  getPublishedPagesBeforeNow,
  getPageById,
  getPageBlocks,
  extractPageProperties
} = require('./lib/notion-client.cjs');
const { blocksToMarkdown } = require('./lib/notion-to-markdown.cjs');
const { downloadImages, removeImages } = require('./lib/image-downloader.cjs');
const { generateFrontmatter } = require('./lib/frontmatter.cjs');

const POSTS_DIR = path.join(__dirname, '../src/content/posts');
const CACHE_FILE = path.join(__dirname, '.sync-cache.json');
const PUBLISHED_FILE = path.join(__dirname, '.sync-published.json');

// 환경변수로 모드 결정
const SYNC_MODE = process.env.SYNC_MODE || 'manual'; // scheduled | webhook | manual
const PAGE_ID = process.env.PAGE_ID; // webhook 모드에서 사용
const PAGE_STATUS = process.env.PAGE_STATUS; // webhook 모드에서 사용

/**
 * 제목에서 slug 자동 생성
 */
function generateSlugFromTitle(title, category, publishedHistory) {
  // 기본 정규화: 소문자 변환, 공백을 하이픈으로, 특수문자 제거
  let slug = title
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-') // 공백을 하이픈으로
    .replace(/[^\w\u3131-\uD79D가-힣-]/g, '') // 영문, 숫자, 한글, 하이픈만 허용
    .replace(/--+/g, '-') // 연속된 하이픈을 하나로
    .replace(/^-+|-+$/g, ''); // 앞뒤 하이픈 제거

  // 충돌 검사 및 번호 추가
  const existingSlugs = new Set();
  for (const record of Object.values(publishedHistory.publishedPages)) {
    if (record.category === category) {
      existingSlugs.add(record.slug);
    }
  }

  // 파일시스템에서도 확인
  const categoryDir = path.join(POSTS_DIR, category);
  if (fs.existsSync(categoryDir)) {
    const files = fs.readdirSync(categoryDir);
    for (const file of files) {
      if (file.endsWith('.md')) {
        existingSlugs.add(file.replace('.md', ''));
      }
    }
  }

  let finalSlug = slug;
  let counter = 2;
  while (existingSlugs.has(finalSlug)) {
    finalSlug = `${slug}-${counter}`;
    counter++;
  }

  return finalSlug;
}

async function main() {
  console.log(`🔄 Notion 동기화 시작... (모드: ${SYNC_MODE})\n`);

  if (SYNC_MODE === 'scheduled') {
    await scheduledSync();
  } else if (SYNC_MODE === 'webhook') {
    await webhookSync();
  } else {
    await manualSync();
  }

  console.log('\n✅ Notion 동기화 완료!');
}

/**
 * A. 예약 발행 (Cron - 하루 2회)
 */
async function scheduledSync() {
  console.log('📅 예약 발행 모드: Date가 과거인 Published 글 중 1개만 발행\n');

  // 발행 이력 로드
  const publishedHistory = loadPublishedHistory();

  // Status=Published AND Date <= now 조회 (오래된 것부터)
  const pages = await getPublishedPagesBeforeNow();
  console.log(`📄 Notion에서 ${pages.length}개의 발행 대상 페이지 발견\n`);

  // 이미 발행된 페이지 제외
  const unpublishedPages = pages.filter((page) => !publishedHistory.publishedPages[page.id]);

  if (unpublishedPages.length === 0) {
    console.log('✅ 발행할 새 글이 없습니다.');
    return;
  }

  console.log(`📝 미발행 글 ${unpublishedPages.length}개 중 1개를 발행합니다.\n`);

  // 가장 오래된 1개만 발행
  const page = unpublishedPages[0];
  const props = extractPageProperties(page);

  if (!props.category) {
    console.warn(`⚠️ Category 누락: "${props.title}" - 건너뜀`);
    return;
  }

  // Slug 자동 생성 (없는 경우)
  if (!props.slug) {
    props.slug = generateSlugFromTitle(props.title, props.category, publishedHistory);
    console.log(`  🔄 자동 생성된 Slug: ${props.slug}`);
  }

  console.log(`📝 발행 중: ${props.title} (Date: ${props.date})`);

  // 콘텐츠 생성 및 저장
  const filePath = await savePageContent(page, props);

  // 발행 이력에 추가
  publishedHistory.publishedPages[props.notionId] = {
    slug: props.slug,
    category: props.category,
    publishedAt: new Date().toISOString(),
    filePath: filePath,
  };
  savePublishedHistory(publishedHistory);

  console.log(`  ✅ 발행 완료: ${props.category}/${props.slug}\n`);
}

/**
 * B. 웹훅 발행 (repository_dispatch - Make에서 호출)
 */
async function webhookSync() {
  console.log('🪝 웹훅 모드: Make에서 전달받은 페이지 처리\n');

  if (!PAGE_ID || !PAGE_STATUS) {
    console.error('❌ PAGE_ID 또는 PAGE_STATUS가 전달되지 않았습니다.');
    process.exit(1);
  }

  console.log(`📄 페이지 ID: ${PAGE_ID}`);
  console.log(`📊 상태: ${PAGE_STATUS}\n`);

  const publishedHistory = loadPublishedHistory();

  if (PAGE_STATUS === 'Published') {
    // Published: 즉시 업로드/덮어쓰기 (Date 무관)
    console.log('📝 Published 상태 → 업로드/덮어쓰기\n');

    const page = await getPageById(PAGE_ID);
    if (!page) {
      console.error('❌ 페이지를 찾을 수 없습니다.');
      process.exit(1);
    }

    const props = extractPageProperties(page);

    if (!props.category) {
      console.warn(`⚠️ Category 누락: "${props.title}" - 건너뜀`);
      return;
    }

    // 기존 발행 이력 확인
    const existingRecord = publishedHistory.publishedPages[PAGE_ID];

    // Slug 처리
    if (!props.slug) {
      if (existingRecord && existingRecord.slug) {
        // 이미 발행된 글이면 기존 slug 재사용
        props.slug = existingRecord.slug;
        console.log(`  🔄 기존 Slug 재사용: ${props.slug}`);
      } else {
        // 신규 글이면 자동 생성
        props.slug = generateSlugFromTitle(props.title, props.category, publishedHistory);
        console.log(`  🔄 자동 생성된 Slug: ${props.slug}`);
      }
    }

    // 기존 파일이 있다면 삭제 (덮어쓰기 준비)
    if (existingRecord) {
      const oldFilePath = existingRecord.filePath || path.join(POSTS_DIR, existingRecord.category, `${existingRecord.slug}.md`);
      if (fs.existsSync(oldFilePath)) {
        fs.unlinkSync(oldFilePath);
        console.log(`🔄 기존 파일 삭제: ${oldFilePath}`);
      }
      // 기존 이미지도 삭제
      removeImages(existingRecord.slug);
    }

    console.log(`📝 처리 중: ${props.title}`);

    // 콘텐츠 생성 및 저장
    const filePath = await savePageContent(page, props);

    // 발행 이력에 추가/업데이트
    publishedHistory.publishedPages[PAGE_ID] = {
      slug: props.slug,
      category: props.category,
      publishedAt: new Date().toISOString(),
      filePath: filePath,
    };
    savePublishedHistory(publishedHistory);

    console.log(`  ✅ 업로드 완료: ${props.category}/${props.slug}\n`);

  } else if (PAGE_STATUS === 'Deleted') {
    // Deleted: 해당 페이지 삭제
    console.log('🗑️ Deleted 상태 → 페이지 삭제\n');

    const record = publishedHistory.publishedPages[PAGE_ID];

    if (!record) {
      console.log('⚠️ 발행 이력에 없는 페이지입니다. 삭제할 파일이 없습니다.');
      return;
    }

    const { slug, category, filePath: recordedFilePath } = record;
    const filePath = recordedFilePath || path.join(POSTS_DIR, category, `${slug}.md`);

    // 파일 삭제
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`🗑️ 파일 삭제: ${filePath}`);
    }

    // 이미지 삭제
    removeImages(slug);
    console.log(`🗑️ 이미지 삭제: ${slug}`);

    // 발행 이력에서 제거
    delete publishedHistory.publishedPages[PAGE_ID];
    savePublishedHistory(publishedHistory);

    console.log(`  ✅ 삭제 완료: ${category}/${slug}\n`);

  } else {
    console.log(`⏭️ ${PAGE_STATUS} 상태는 무시합니다.`);
  }
}

/**
 * C. 수동 발행 (workflow_dispatch)
 */
async function manualSync() {
  console.log('👤 수동 발행 모드: 모든 Published 글 동기화 (Date 무관)\n');

  // 캐시 로드
  const cache = loadCache();

  // Notion에서 Published 페이지 조회
  const pages = await getPublishedPages();
  console.log(`📄 Notion에서 ${pages.length}개의 Published 페이지 발견\n`);

  // 현재 Notion에 있는 slug 목록 (삭제 감지용)
  const activeSlugMap = new Map();

  // 각 페이지 처리
  for (const page of pages) {
    const props = extractPageProperties(page);

    if (!props.category) {
      console.warn(`⚠️ Category 누락: "${props.title}" - 건너뜀`);
      continue;
    }

    // Slug 자동 생성 (없는 경우)
    if (!props.slug) {
      const publishedHistory = loadPublishedHistory();
      props.slug = generateSlugFromTitle(props.title, props.category, publishedHistory);
      console.log(`  🔄 자동 생성된 Slug: ${props.slug}`);
    }

    const fileKey = `${props.category}/${props.slug}`;
    activeSlugMap.set(fileKey, true);

    // 변경 여부 확인 (캐시)
    if (cache[props.notionId] === props.lastEditedTime) {
      console.log(`⏭️  변경 없음: ${props.title}`);
      continue;
    }

    console.log(`📝 동기화 중: ${props.title}`);

    // 콘텐츠 생성 및 저장
    await savePageContent(page, props);

    // 캐시 업데이트
    cache[props.notionId] = props.lastEditedTime;

    console.log(`  ✅ 저장 완료\n`);
  }

  // 삭제된 글 감지 및 제거
  removeDeletedPosts(activeSlugMap, cache);

  // 캐시 저장
  saveCache(cache);
}

/**
 * 페이지 콘텐츠를 생성하고 파일로 저장
 */
async function savePageContent(page, props) {
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
  console.log(`  📄 파일 저장: ${props.category}/${props.slug}.md`);

  return filePath;
}

/**
 * 캐시 파일 로드 (manual 모드에서 사용)
 */
function loadCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
    }
  } catch {}
  return {};
}

/**
 * 캐시 파일 저장 (manual 모드에서 사용)
 */
function saveCache(cache) {
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf-8');
}

/**
 * 발행 이력 파일 로드 (scheduled 모드에서 사용)
 */
function loadPublishedHistory() {
  try {
    if (fs.existsSync(PUBLISHED_FILE)) {
      return JSON.parse(fs.readFileSync(PUBLISHED_FILE, 'utf-8'));
    }
  } catch {}
  return { publishedPages: {} };
}

/**
 * 발행 이력 파일 저장 (scheduled 모드에서 사용)
 */
function savePublishedHistory(history) {
  fs.writeFileSync(PUBLISHED_FILE, JSON.stringify(history, null, 2), 'utf-8');
}

/**
 * 삭제된 글 감지 및 제거 (manual 모드에서 사용)
 */
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

        // 캐시에서도 제거 (notionId 기반이므로 정확한 매칭 어려움 - 파일 삭제만 처리)
      }
    }
  }
}

main().catch((err) => {
  console.error('❌ 동기화 실패:', err);
  process.exit(1);
});
