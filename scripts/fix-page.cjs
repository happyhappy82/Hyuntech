const { Client } = require('@notionhq/client');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env');
const envContent = fs.readFileSync(envPath, 'utf-8');
for (const line of envContent.split('\n')) {
  const idx = line.indexOf('=');
  if (idx > 0) {
    const key = line.substring(0, idx).trim();
    const val = line.substring(idx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

const notion = new Client({ auth: process.env.NOTION_TOKEN });

async function main() {
  // 블루 프린스 노트북 추천 페이지 찾기
  const res = await notion.databases.query({
    database_id: process.env.NOTION_DATABASE_ID,
    filter: {
      property: 'Title',
      title: { contains: '블루 프린스' },
    },
  });

  if (res.results.length === 0) {
    console.log('페이지를 찾을 수 없습니다.');
    return;
  }

  const page = res.results[0];
  console.log('페이지 찾음:', page.id);

  // Slug, category 업데이트
  await notion.pages.update({
    page_id: page.id,
    properties: {
      Slug: {
        rich_text: [{ text: { content: 'blue-prince-laptop-top5' } }],
      },
      category: {
        select: { name: 'laptop' },
      },
    },
  });

  console.log('Slug -> blue-prince-laptop-top5');
  console.log('category -> laptop');
  console.log('업데이트 완료!');
}

main();
