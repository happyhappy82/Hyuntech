/**
 * Notion 블록을 Markdown으로 변환
 */

function richTextToMarkdown(richTexts) {
  if (!richTexts || !Array.isArray(richTexts)) return '';

  return richTexts
    .map((rt) => {
      let text = rt.plain_text;
      if (!text) return '';

      if (rt.annotations) {
        if (rt.annotations.bold) text = `**${text}**`;
        if (rt.annotations.italic) text = `*${text}*`;
        if (rt.annotations.strikethrough) text = `~~${text}~~`;
        if (rt.annotations.code) text = `\`${text}\``;
      }

      if (rt.href) {
        text = `[${text}](${rt.href})`;
      }

      return text;
    })
    .join('');
}

function blockToMarkdown(block, imageMap) {
  const type = block.type;
  const data = block[type];

  switch (type) {
    case 'paragraph':
      return richTextToMarkdown(data.rich_text);

    case 'heading_1':
      return `## ${richTextToMarkdown(data.rich_text)}`;

    case 'heading_2':
      return `### ${richTextToMarkdown(data.rich_text)}`;

    case 'heading_3':
      return `#### ${richTextToMarkdown(data.rich_text)}`;

    case 'bulleted_list_item': {
      let md = `- ${richTextToMarkdown(data.rich_text)}`;
      if (block.children) {
        md += '\n' + block.children.map((child) => '  ' + blockToMarkdown(child, imageMap)).join('\n');
      }
      return md;
    }

    case 'numbered_list_item': {
      let md = `1. ${richTextToMarkdown(data.rich_text)}`;
      if (block.children) {
        md += '\n' + block.children.map((child) => '   ' + blockToMarkdown(child, imageMap)).join('\n');
      }
      return md;
    }

    case 'to_do': {
      const checked = data.checked ? 'x' : ' ';
      return `- [${checked}] ${richTextToMarkdown(data.rich_text)}`;
    }

    case 'toggle': {
      let md = `<details>\n<summary>${richTextToMarkdown(data.rich_text)}</summary>\n\n`;
      if (block.children) {
        md += block.children.map((child) => blockToMarkdown(child, imageMap)).join('\n\n');
      }
      md += '\n\n</details>';
      return md;
    }

    case 'code': {
      const lang = data.language || '';
      const code = richTextToMarkdown(data.rich_text);
      return `\`\`\`${lang}\n${code}\n\`\`\``;
    }

    case 'quote':
      return `> ${richTextToMarkdown(data.rich_text)}`;

    case 'callout': {
      const icon = data.icon?.emoji || '💡';
      const text = richTextToMarkdown(data.rich_text);
      return `> ${icon} ${text}`;
    }

    case 'divider':
      return '---';

    case 'image': {
      const url = data.type === 'external' ? data.external.url : data.file.url;
      const caption = data.caption ? richTextToMarkdown(data.caption) : '';
      const alt = caption || 'image';

      // imageMap이 있으면 로컬 경로 사용
      if (imageMap && imageMap.has(block.id)) {
        return `![${alt}](${imageMap.get(block.id)})`;
      }
      return `![${alt}](${url})`;
    }

    case 'bookmark':
      return data.url ? `[${data.url}](${data.url})` : '';

    case 'embed':
      return data.url ? `[임베드](${data.url})` : '';

    case 'table': {
      if (!block.children || block.children.length === 0) return '';
      const rows = block.children.map((row) => {
        const cells = row.table_row.cells.map((cell) => richTextToMarkdown(cell));
        return `| ${cells.join(' | ')} |`;
      });
      if (rows.length > 0) {
        const headerSep = `| ${row0Cells(block.children[0]).map(() => '---').join(' | ')} |`;
        rows.splice(1, 0, headerSep);
      }
      return rows.join('\n');
    }

    case 'column_list': {
      if (!block.children) return '';
      return block.children
        .map((col) => {
          if (!col.children) return '';
          return col.children.map((child) => blockToMarkdown(child, imageMap)).join('\n\n');
        })
        .join('\n\n');
    }

    default:
      return '';
  }
}

function row0Cells(row) {
  return row.table_row?.cells || [];
}

/**
 * 블록 배열을 Markdown 문자열로 변환
 */
function blocksToMarkdown(blocks, imageMap) {
  const lines = [];
  let prevType = null;

  for (const block of blocks) {
    const md = blockToMarkdown(block, imageMap);
    if (md === '' && block.type !== 'divider') continue;

    // 리스트 아이템 사이에는 빈줄을 넣지 않음
    const isListItem = block.type === 'bulleted_list_item' || block.type === 'numbered_list_item';
    const prevIsList = prevType === 'bulleted_list_item' || prevType === 'numbered_list_item';

    if (isListItem && prevIsList) {
      lines.push(md);
    } else {
      lines.push('', md);
    }

    prevType = block.type;
  }

  return lines.join('\n').trim();
}

module.exports = {
  blocksToMarkdown,
  richTextToMarkdown,
};
