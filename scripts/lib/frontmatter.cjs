/**
 * YAML 프론트매터 생성
 */
function generateFrontmatter(properties) {
  const lines = ['---'];

  lines.push(`title: "${escapeYaml(properties.title)}"`);
  lines.push(`description: "${escapeYaml(properties.description)}"`);
  lines.push(`category: "${properties.category}"`);
  lines.push(`contentType: "${escapeYaml(properties.contentType)}"`);
  lines.push(`slug: "${properties.slug}"`);
  lines.push(`date: "${properties.date}"`);
  lines.push(`readTime: "${properties.readTime}"`);
  lines.push(`featured: ${properties.featured}`);
  lines.push(`notionId: "${properties.notionId}"`);
  lines.push(`lastEditedTime: "${properties.lastEditedTime}"`);

  lines.push('---');
  return lines.join('\n');
}

function escapeYaml(str) {
  if (!str) return '';
  return str.replace(/"/g, '\\"').replace(/\n/g, ' ');
}

module.exports = { generateFrontmatter };
