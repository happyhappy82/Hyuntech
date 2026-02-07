const { Client } = require('@notionhq/client');
const fs = require('fs');
const path = require('path');

// .env 파일에서 환경변수 로드
const envPath = path.join(__dirname, '../../.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const idx = line.indexOf('=');
    if (idx > 0) {
      const key = line.substring(0, idx).trim();
      const val = line.substring(idx + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID;

if (!NOTION_TOKEN || !NOTION_DATABASE_ID) {
  console.error('❌ NOTION_TOKEN과 NOTION_DATABASE_ID가 필요합니다.');
  console.error('   먼저 npm run setup 을 실행하세요.');
  process.exit(1);
}

const notion = new Client({ auth: NOTION_TOKEN });

/**
 * Status="Published"인 모든 페이지 조회
 */
async function getPublishedPages() {
  const pages = [];
  let cursor = undefined;

  do {
    const response = await notion.databases.query({
      database_id: NOTION_DATABASE_ID,
      filter: {
        property: 'Status',
        status: { equals: 'Published' },
      },
      sorts: [{ property: 'Date', direction: 'descending' }],
      start_cursor: cursor,
    });

    pages.push(...response.results);
    cursor = response.has_more ? response.next_cursor : undefined;
  } while (cursor);

  return pages;
}

/**
 * Status="Published" AND Date가 현재 시간보다 과거인 페이지 조회
 * Date 값이 현재 시간보다 STRICTLY BEFORE인 것만 반환 (현재 시간과 같거나 미래는 제외)
 */
async function getPublishedPagesBeforeNow() {
  const now = new Date();
  const pages = [];
  let cursor = undefined;

  do {
    const response = await notion.databases.query({
      database_id: NOTION_DATABASE_ID,
      filter: {
        and: [
          {
            property: 'Status',
            status: { equals: 'Published' },
          },
          {
            property: 'Date',
            date: { before: now.toISOString() },
          },
        ],
      },
      sorts: [{ property: 'Date', direction: 'ascending' }], // 오래된 것부터
      start_cursor: cursor,
    });

    pages.push(...response.results);
    cursor = response.has_more ? response.next_cursor : undefined;
  } while (cursor);

  return pages;
}

/**
 * 특정 page_id로 페이지 조회
 */
async function getPageById(pageId) {
  try {
    const page = await notion.pages.retrieve({ page_id: pageId });
    return page;
  } catch (err) {
    console.error(`❌ 페이지 조회 실패 (${pageId}):`, err.message);
    return null;
  }
}

/**
 * 여러 page_id로 페이지 조회 (webhook 모드용)
 * @param {string[]} pageIds - 조회할 페이지 ID 배열
 * @returns {Promise<Array>} 페이지 객체 배열
 */
async function getPagesByIds(pageIds) {
  const pages = [];

  for (const pageId of pageIds) {
    try {
      const page = await notion.pages.retrieve({ page_id: pageId });
      if (page) {
        pages.push(page);
      }
    } catch (err) {
      console.error(`❌ 페이지 조회 실패 (${pageId}):`, err.message);
      // 실패한 페이지는 건너뛰고 계속 진행
    }
  }

  return pages;
}

/**
 * 페이지의 모든 블록(children) 가져오기 (재귀)
 */
async function getPageBlocks(pageId) {
  const blocks = [];
  let cursor = undefined;

  do {
    const response = await notion.blocks.children.list({
      block_id: pageId,
      start_cursor: cursor,
    });

    for (const block of response.results) {
      blocks.push(block);
      if (block.has_children && block.type !== 'child_page' && block.type !== 'child_database') {
        block.children = await getPageBlocks(block.id);
      }
    }

    cursor = response.has_more ? response.next_cursor : undefined;
  } while (cursor);

  return blocks;
}

/**
 * 페이지 속성 추출
 */
function extractPageProperties(page) {
  const props = page.properties;

  const getTitle = (prop) => {
    if (!prop || prop.type !== 'title') return '';
    return prop.title.map((t) => t.plain_text).join('');
  };

  const getRichText = (prop) => {
    if (!prop || prop.type !== 'rich_text') return '';
    return prop.rich_text.map((t) => t.plain_text).join('');
  };

  const getSelect = (prop) => {
    if (!prop) return '';
    if (prop.type === 'select' && prop.select) return prop.select.name;
    if (prop.type === 'status' && prop.status) return prop.status.name;
    return '';
  };

  const getCheckbox = (prop) => {
    if (!prop || prop.type !== 'checkbox') return false;
    return prop.checkbox;
  };

  const getDate = (prop) => {
    if (!prop || prop.type !== 'date' || !prop.date) return '';
    return prop.date.start;
  };

  // 대소문자 구분 없이 속성 찾기
  const find = (name) => {
    const lower = name.toLowerCase();
    for (const [key, val] of Object.entries(props)) {
      if (key.toLowerCase() === lower) return val;
    }
    return null;
  };

  /**
   * 제목에서 slug 자동 생성
   * @param {string} title - 제목
   * @param {string} notionId - Notion 페이지 ID (fallback용)
   * @returns {string} 생성된 slug
   */
  const generateSlugFromTitle = (title, notionId) => {
    if (!title || !title.trim()) {
      // 제목이 없으면 notionId의 첫 8자 사용
      return notionId.substring(0, 8);
    }

    let slug = title
      .toLowerCase() // 소문자로 변환
      .replace(/\s+/g, '-') // 공백을 하이픈으로
      .replace(/[^a-z0-9가-힣ㄱ-ㅎㅏ-ㅣ\-]/g, '') // 영문, 숫자, 한글, 하이픈만 남김
      .replace(/-+/g, '-') // 연속된 하이픈을 하나로
      .replace(/^-+|-+$/g, ''); // 앞뒤 하이픈 제거

    // 결과가 비어있으면 notionId 사용
    if (!slug) {
      return notionId.substring(0, 8);
    }

    return slug;
  };

  const title = getTitle(find('Title'));
  const slugFromNotion = getRichText(find('Slug'));

  // Slug가 비어있으면 제목에서 자동 생성
  const slug = slugFromNotion && slugFromNotion.trim()
    ? slugFromNotion
    : generateSlugFromTitle(title, page.id);

  return {
    title,
    slug,
    category: getSelect(find('Category')),
    contentType: getSelect(find('ContentType')) || '추천 리스트',
    status: getSelect(find('Status')),
    featured: getCheckbox(find('Featured')),
    description: getRichText(find('Description')) || getRichText(find('Excerpt')) || '',
    readTime: getRichText(find('ReadTime')) || '',
    date: getDate(find('Date')),
    notionId: page.id,
    lastEditedTime: page.last_edited_time,
  };
}

module.exports = {
  notion,
  getPublishedPages,
  getPublishedPagesBeforeNow,
  getPageById,
  getPagesByIds,
  getPageBlocks,
  extractPageProperties,
};
