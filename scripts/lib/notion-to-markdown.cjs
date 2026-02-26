/**
 * Notion 페이지를 표준 마크다운으로 변환
 * notion-to-md 라이브러리 사용
 */
const { NotionToMarkdown } = require('notion-to-md');
const { notion } = require('./notion-client.cjs');

const n2m = new NotionToMarkdown({ notionClient: notion });

/**
 * Notion 페이지 ID를 받아 마크다운 문자열로 변환
 * @param {string} pageId - Notion 페이지 ID
 * @returns {Promise<string>} 마크다운 문자열
 */
async function convertPage(pageId) {
  const mdBlocks = await n2m.pageToMarkdown(pageId);
  const mdString = n2m.toMarkdownString(mdBlocks);

  // notion-to-md v3+ returns { parent: string } object
  const markdown = typeof mdString === 'string' ? mdString : mdString.parent;

  return markdown;
}

module.exports = {
  convertPage,
};
