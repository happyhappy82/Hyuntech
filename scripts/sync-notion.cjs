const fs = require('fs');
const path = require('path');
const {
  getPublishedPagesBeforeNow,
  getPageById,
  extractPageProperties
} = require('./lib/notion-client.cjs');
const { convertPage } = require('./lib/notion-to-markdown.cjs');
const { processMarkdownImages, removeImages } = require('./lib/image-downloader.cjs');
const { generateFrontmatter } = require('./lib/frontmatter.cjs');

const POSTS_DIR = path.join(__dirname, '../src/content/posts');
const PUBLISHED_FILE = path.join(__dirname, '.sync-published.json');

// 환경변수로 모드 결정
const SYNC_MODE = process.env.SYNC_MODE || 'scheduled'; // scheduled | webhook
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
    console.error(`❌ 알 수 없는 모드: ${SYNC_MODE} (scheduled 또는 webhook만 지원)`);
    process.exit(1);
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
    console.error(`❌ Category 미지정: "${props.title}" - Notion에서 Category를 지정해주세요.`);
    return;
  }

  // Slug 자동 생성 (없는 경우)
  if (!props.slug) {
    props.slug = generateSlugFromTitle(props.title, props.category, publishedHistory);
    console.log(`  🔄 자동 생성된 Slug: ${props.slug}`);
  }

  console.log(`📝 발행 중: ${props.title} [${props.category}] (Date: ${props.date})`);

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

  if (!PAGE_ID) {
    console.error('❌ PAGE_ID가 전달되지 않았습니다.');
    process.exit(1);
  }

  console.log(`📄 페이지 ID: ${PAGE_ID}`);

  // PAGE_STATUS가 없으면 Notion에서 직접 조회
  let status = PAGE_STATUS;
  if (!status) {
    console.log('📡 PAGE_STATUS 미전달 → Notion에서 상태 조회 중...');
    const page = await getPageById(PAGE_ID);
    if (!page) {
      console.error('❌ 페이지를 찾을 수 없습니다.');
      process.exit(1);
    }
    const props = extractPageProperties(page);
    status = props.status;
    console.log(`📊 Notion 조회 결과 상태: ${status}`);
  }

  console.log(`📊 상태: ${status}\n`);

  const publishedHistory = loadPublishedHistory();

  if (status === 'Published') {
    // Published: 즉시 업로드/덮어쓰기 (Date 무관)
    console.log('📝 Published 상태 → 업로드/덮어쓰기\n');

    const page = await getPageById(PAGE_ID);
    if (!page) {
      console.error('❌ 페이지를 찾을 수 없습니다.');
      process.exit(1);
    }

    const props = extractPageProperties(page);

    if (!props.category) {
      console.error(`❌ Category 미지정: "${props.title}" - Notion에서 Category를 지정해주세요.`);
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

  } else if (status === 'Deleted') {
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
    console.log(`⏭️ ${status} 상태는 무시합니다.`);
  }
}

/**
 * 페이지 콘텐츠를 생성하고 파일로 저장
 */
async function savePageContent(page, props) {
  // notion-to-md로 마크다운 변환
  let markdown = await convertPage(page.id);

  // 마크다운 내 이미지 다운로드 및 경로 치환
  markdown = await processMarkdownImages(markdown, props.slug);

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
 * 발행 이력 파일 로드
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
 * 발행 이력 파일 저장
 */
function savePublishedHistory(history) {
  fs.writeFileSync(PUBLISHED_FILE, JSON.stringify(history, null, 2), 'utf-8');
}

main().catch((err) => {
  console.error('❌ 동기화 실패:', err);
  process.exit(1);
});
