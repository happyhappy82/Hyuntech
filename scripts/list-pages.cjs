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
  const res = await notion.databases.query({
    database_id: process.env.NOTION_DATABASE_ID,
  });

  for (const page of res.results) {
    const p = page.properties;
    const title = p.Title && p.Title.title ? p.Title.title.map(t => t.plain_text).join('') : '';
    const status = p.Status ? (p.Status.status ? p.Status.status.name : (p.Status.select ? p.Status.select.name : '')) : '';
    const slug = p.Slug && p.Slug.rich_text ? p.Slug.rich_text.map(t => t.plain_text).join('') : '';
    const cat = (p.category && p.category.select ? p.category.select.name : '') || (p.Category && p.Category.select ? p.Category.select.name : '');
    console.log(`[${status}] "${title}" | slug: ${slug} | category: ${cat}`);
  }
}

main();
