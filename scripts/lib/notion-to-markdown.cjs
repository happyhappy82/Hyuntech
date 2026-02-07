/**
 * Notion 블록을 리치 HTML로 변환
 * 패턴 감지로 기존 컴포넌트 CSS 클래스에 맞는 HTML 출력
 */

function richTextToPlain(richTexts) {
  if (!richTexts || !Array.isArray(richTexts)) return '';
  return richTexts.map((rt) => rt.plain_text || '').join('');
}

function richTextToHtml(richTexts) {
  if (!richTexts || !Array.isArray(richTexts)) return '';
  return richTexts
    .map((rt) => {
      let text = escapeHtml(rt.plain_text || '');
      if (!text) return '';
      if (rt.annotations) {
        if (rt.annotations.bold) text = `<strong>${text}</strong>`;
        if (rt.annotations.italic) text = `<em>${text}</em>`;
        if (rt.annotations.strikethrough) text = `<del>${text}</del>`;
        if (rt.annotations.code) text = `<code>${text}</code>`;
      }
      if (rt.href) {
        text = `<a href="${escapeAttr(rt.href)}">${text}</a>`;
      }
      return text;
    })
    .join('');
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeAttr(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * rich_text 배열에서 첫 번째 href 추출
 */
function extractHrefFromRichText(richTexts) {
  if (!richTexts || !Array.isArray(richTexts)) return null;
  for (const rt of richTexts) {
    if (rt.href) return rt.href;
    if (rt.text && rt.text.link && rt.text.link.url) return rt.text.link.url;
  }
  return null;
}

/**
 * 모든 블록을 사전 스캔하여 제품 순위별 CTA URL 수집
 * 리뷰 섹션의 👉 CTA 링크에서 추출
 */
function collectCtaUrls(blocks) {
  const ctaByRank = {};
  let currentRank = 0;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (block.type === 'heading_3') {
      const text = getPlainText(block);
      const match = text.match(/[🥇🥈🥉]?\s*(\d+)\./);
      if (match) currentRank = parseInt(match[1]);
    }
    if (block.type === 'paragraph') {
      const text = getPlainText(block);
      if (text.includes('👉') && currentRank > 0 && !ctaByRank[currentRank]) {
        const richTexts = block.paragraph && block.paragraph.rich_text;
        const href = extractHrefFromRichText(richTexts);
        if (href) {
          ctaByRank[currentRank] = href;
        }
      }
    }
  }
  return ctaByRank;
}

/**
 * 블록 배열을 리치 HTML 문자열로 변환
 * 섹션 패턴을 감지하여 적절한 컴포넌트 HTML 출력
 */
function blocksToMarkdown(blocks, imageMap) {
  const sections = parseSections(blocks, imageMap);
  return sections.join('\n\n');
}

/**
 * 블록 배열을 섹션 단위로 파싱하여 HTML 배열로 반환
 */
function parseSections(blocks, imageMap) {
  const output = [];
  let i = 0;

  // 사전 스캔: 리뷰 카드에서 순위별 CTA URL 수집
  const ctaByRank = collectCtaUrls(blocks);

  while (i < blocks.length) {
    const block = blocks[i];
    const type = block.type;
    const plainText = getPlainText(block);

    // heading_2 (### in Notion = h3) 기준으로 섹션 감지
    if (type === 'heading_2') {
      const heading = plainText;

      // 패턴 1: 선정 기준
      if (heading.includes('선정 기준')) {
        const result = parseCriteriaSection(blocks, i, imageMap);
        output.push(result.html);
        i = result.nextIndex;
        continue;
      }

      // 패턴 2: TOP N 한눈에 보기
      if (/TOP\s*\d*.*한눈에\s*보기/i.test(heading)) {
        const result = parseTopPicksSection(blocks, i, imageMap, ctaByRank);
        output.push(result.html);
        i = result.nextIndex;
        continue;
      }

      // 패턴 3: 비교표/비교 테이블
      if (/비교표|비교\s*테이블/i.test(heading)) {
        const result = parseComparisonSection(blocks, i, imageMap);
        output.push(result.html);
        i = result.nextIndex;
        continue;
      }

      // 패턴 4: 상세 리뷰
      if (/상세\s*리뷰/i.test(heading)) {
        const result = parseReviewsSection(blocks, i, imageMap);
        output.push(result.html);
        i = result.nextIndex;
        continue;
      }

      // 패턴 5: FAQ (알아야 할)
      if (/알아야\s*할|FAQ|자주\s*묻는/i.test(heading)) {
        const result = parseFaqSection(blocks, i, imageMap);
        output.push(result.html);
        i = result.nextIndex;
        continue;
      }

      // 패턴 6: 마무리
      if (/마무리|결론|정리/i.test(heading)) {
        const result = parseConclusionSection(blocks, i, imageMap);
        output.push(result.html);
        i = result.nextIndex;
        continue;
      }
    }

    // 기본 블록 렌더링
    const html = renderBlock(block, imageMap);
    if (html) output.push(html);
    i++;
  }

  return output;
}

function getPlainText(block) {
  const data = block[block.type];
  if (!data) return '';
  return richTextToPlain(data.rich_text);
}

// ==========================================
// 패턴 1: 선정 기준 → criteria-grid
// ==========================================
function parseCriteriaSection(blocks, startIndex, imageMap) {
  let i = startIndex + 1; // 선정 기준 헤딩 다음
  const items = [];

  // 설명 텍스트 수집
  let descHtml = '';
  while (i < blocks.length && blocks[i].type === 'paragraph') {
    const text = richTextToHtml(blocks[i][blocks[i].type].rich_text);
    if (text) descHtml += `<p>${text}</p>\n`;
    i++;
  }

  // 이모지 불릿 리스트 → criteria-item 변환
  while (i < blocks.length && blocks[i].type === 'bulleted_list_item') {
    const plain = getPlainText(blocks[i]);
    const emojiMatch = plain.match(/^(\p{Emoji_Presentation}|\p{Emoji}\uFE0F?)\s*/u);
    const emoji = emojiMatch ? emojiMatch[1] : '📌';
    const rest = emojiMatch ? plain.slice(emojiMatch[0].length) : plain;

    // "제목 - 설명" 또는 "**제목** - 설명" 패턴
    const parts = rest.split(/\s*[-–—]\s*/);
    const title = parts[0] ? parts[0].replace(/\*\*/g, '') : rest;
    const desc = parts[1] || '';

    items.push({ emoji, title, desc });
    i++;
  }

  let html = `<h3>선정 기준</h3>\n`;
  if (descHtml) html += descHtml;

  if (items.length > 0) {
    html += `<div class="criteria-grid">\n`;
    for (const item of items) {
      html += `<div class="criteria-item"><div class="icon">${item.emoji}</div><h4>${escapeHtml(item.title)}</h4><p>${escapeHtml(item.desc)}</p></div>\n`;
    }
    html += `</div>`;
  }

  return { html, nextIndex: i };
}

// ==========================================
// 패턴 2: TOP N 한눈에 보기 → pick-card
// ==========================================
function parseTopPicksSection(blocks, startIndex, imageMap, ctaByRank) {
  const heading = getPlainText(blocks[startIndex]);
  let i = startIndex + 1;
  const picks = [];

  while (i < blocks.length) {
    const block = blocks[i];
    // 다음 heading_2면 종료
    if (block.type === 'heading_2') break;

    // heading_3 (#### = 🥇 N위: 이름) → 하나의 pick
    if (block.type === 'heading_3') {
      const result = parseTopPick(blocks, i, imageMap);
      picks.push(result.pick);
      i = result.nextIndex;
      continue;
    }
    i++;
  }

  let html = `<h2 id="top-picks">${escapeHtml(heading)}</h2>\n`;
  if (picks.length > 0) {
    html += `<div class="top-picks-inline">\n`;
    for (let idx = 0; idx < picks.length; idx++) {
      const pick = picks[idx];
      const rank = idx + 1;
      const isFeatured = rank === 1;
      // ctaByRank에서 해당 순위의 CTA URL 주입
      const ctaUrl = (ctaByRank && ctaByRank[rank]) || '';
      html += renderPickCard(pick, rank, isFeatured, ctaUrl);
    }
    html += `</div>`;
  }

  return { html, nextIndex: i };
}

function parseTopPick(blocks, startIndex, imageMap) {
  const plain = getPlainText(blocks[startIndex]);
  // "🥇 1위: 기가바이트 2025 에어로 X16 라이젠 AI"
  const nameMatch = plain.match(/[🥇🥈🥉]?\s*\d+위[:\s]*(.*)/);
  const name = nameMatch ? nameMatch[1].trim() : plain.replace(/[🥇🥈🥉]\s*/, '').trim();

  let i = startIndex + 1;
  let badge = '';
  let score = '';
  const pros = [];
  let price = '';

  while (i < blocks.length) {
    const block = blocks[i];
    if (block.type === 'heading_2' || block.type === 'heading_3') break;

    const text = getPlainText(block);

    if (block.type === 'paragraph') {
      // "최고 추천 · 9.4/10" (plain text에는 ** 없음)
      const badgeMatch = text.match(/\*\*(.+?)\*\*\s*[·]\s*([\d.]+\/\d+)/)
        || text.match(/(.+?)\s*[·]\s*([\d.]+\/\d+)/);
      if (badgeMatch) {
        badge = badgeMatch[1].replace(/\*\*/g, '');
        score = badgeMatch[2];
        i++;
        continue;
      }
    }

    if (block.type === 'bulleted_list_item') {
      if (text.startsWith('✓') || text.startsWith('✔')) {
        pros.push(text.replace(/^[✓✔]\s*/, ''));
      } else if (text.includes('💰') || text.includes('가격대')) {
        const priceMatch = text.match(/\*\*(.+?)\*\*/) || text.match(/가격대[:\s]*(.+)/);
        price = priceMatch ? priceMatch[1].replace(/\*\*/g, '') : text.replace(/💰\s*가격대[:\s]*/i, '').trim();
      }
      i++;
      continue;
    }
    i++;
  }

  return {
    pick: { name, badge, score, pros, price },
    nextIndex: i,
  };
}

function renderPickCard(pick, rank, featured, ctaUrl) {
  const featuredClass = featured ? ' featured' : '';
  const badgeType = rank === 1 ? 'best' : rank === 2 ? 'primary' : 'success';

  let html = `<div class="pick-card${featuredClass}">\n`;
  html += `<span class="pick-rank">${rank}</span>\n`;
  html += `<div class="pick-image"><div class="product-placeholder">💻</div></div>\n`;
  html += `<div class="pick-body">\n`;
  if (pick.badge) {
    html += `<span class="badge badge-${badgeType}">${escapeHtml(pick.badge)}</span>\n`;
  }
  html += `<h3>${escapeHtml(pick.name)}</h3>\n`;
  if (pick.score) {
    html += `<p class="pick-subtitle">${escapeHtml(pick.score)}</p>\n`;
  }
  if (pick.pros.length > 0) {
    html += `<ul class="pick-pros">\n`;
    for (const pro of pick.pros) {
      html += `<li>${escapeHtml(pro)}</li>\n`;
    }
    html += `</ul>\n`;
  }
  if (pick.price) {
    html += `<div class="pick-price">${escapeHtml(pick.price)}</div>\n`;
  }
  if (ctaUrl) {
    const cleanUrl = ctaUrl.replace(/%7B%7B/g, '').replace(/%7D%7D/g, '');
    html += `<a href="${escapeAttr(cleanUrl)}" class="cta-btn pick-cta" rel="nofollow noopener" target="_blank">최저가 보러가기</a>\n`;
  }
  html += `</div></div>\n`;
  return html;
}

// ==========================================
// 패턴 3: 비교표 → comparison-table-wrapper
// ==========================================
function parseComparisonSection(blocks, startIndex, imageMap) {
  const heading = getPlainText(blocks[startIndex]);
  let i = startIndex + 1;
  let tableHtml = '';

  while (i < blocks.length) {
    const block = blocks[i];
    if (block.type === 'heading_2') break;

    if (block.type === 'table') {
      tableHtml = renderComparisonTable(block);
      i++;
      continue;
    }
    i++;
  }

  let html = `<h2 id="comparison">${escapeHtml(heading)}</h2>\n`;
  html += tableHtml;

  return { html, nextIndex: i };
}

function renderComparisonTable(block) {
  if (!block.children || block.children.length === 0) return '';

  // raw 셀 데이터도 보존 (href 추출용)
  const rawRows = block.children.map((row) => row.table_row.cells);
  const rows = rawRows.map((cells) => cells.map((cell) => richTextToPlain(cell)));

  if (rows.length === 0) return '';

  const headers = rows[0];
  const dataRows = rows.slice(1);

  // CTA 열 인덱스 찾기
  const ctaColIdx = headers.findIndex((h) => /CTA|최저가/i.test(h.replace(/\*\*/g, '')));

  let html = `<div class="comparison-table-wrapper">\n`;
  html += `<table class="comparison-table" aria-label="제품 비교표">\n`;
  html += `<thead><tr>\n`;
  for (const h of headers) {
    html += `<th scope="col">${escapeHtml(h.replace(/\*\*/g, ''))}</th>\n`;
  }
  html += `</tr></thead>\n`;
  html += `<tbody>\n`;

  for (let ri = 0; ri < dataRows.length; ri++) {
    const row = dataRows[ri];
    const rawRow = rawRows[ri + 1]; // +1 헤더 건너뛰기
    const firstName = row[0] || '';
    const isBest = firstName.includes('🥇');
    const rowClass = isBest ? ' class="highlight-row"' : '';

    html += `<tr${rowClass}>\n`;
    for (let ci = 0; ci < row.length; ci++) {
      let cell = row[ci].replace(/\*\*/g, '');
      if (ci === 0) {
        // 제품명 셀 - 아이콘 + 이름
        const cleanName = cell.replace(/[🥇🥈🥉]\s*/, '').trim();
        html += `<td class="td-product-name"><div class="product-cell">`;
        html += `<div class="product-thumb">💻</div>`;
        html += escapeHtml(cleanName);
        if (isBest) html += ` <span class="best-badge">BEST</span>`;
        html += `</div></td>\n`;
      } else if (ci === ctaColIdx && ctaColIdx >= 0) {
        // CTA 열 - href 추출하여 링크 버튼으로 렌더링
        const href = extractHrefFromRichText(rawRow[ci]);
        if (href) {
          const cleanUrl = href.replace(/%7B%7B/g, '').replace(/%7D%7D/g, '');
          html += `<td class="td-cta"><a href="${escapeAttr(cleanUrl)}" class="cta-btn table-cta" rel="nofollow noopener" target="_blank">${escapeHtml(cell || '최저가 보기')}</a></td>\n`;
        } else {
          html += `<td>${escapeHtml(cell)}</td>\n`;
        }
      } else {
        html += `<td>${escapeHtml(cell)}</td>\n`;
      }
    }
    html += `</tr>\n`;
  }

  html += `</tbody></table></div>`;
  return html;
}

// ==========================================
// 패턴 4: 상세 리뷰 → review-card
// ==========================================
function parseReviewsSection(blocks, startIndex, imageMap) {
  const heading = getPlainText(blocks[startIndex]);
  let i = startIndex + 1;
  const reviews = [];

  while (i < blocks.length) {
    const block = blocks[i];
    if (block.type === 'heading_2') break;

    // heading_3 (#### 🥇 N. 제품명) → 리뷰 카드
    if (block.type === 'heading_3') {
      const text = getPlainText(block);
      if (/[🥇🥈🥉]?\s*\d+\./.test(text) || /^\d+\./.test(text)) {
        const result = parseReviewCard(blocks, i, imageMap);
        reviews.push(result.review);
        i = result.nextIndex;
        continue;
      }
    }

    // divider는 건너뜀
    if (block.type === 'divider') {
      i++;
      continue;
    }

    i++;
  }

  let html = `<h2 id="reviews">${escapeHtml(heading)}</h2>\n`;
  for (const review of reviews) {
    html += renderReviewCard(review);
  }

  return { html, nextIndex: i };
}

function parseReviewCard(blocks, startIndex, imageMap) {
  const titlePlain = getPlainText(blocks[startIndex]);
  // "🥇 1. 기가바이트 2025 에어로 X16 라이젠 AI 라이젠 AI 300 시리즈"
  const rankMatch = titlePlain.match(/[🥇🥈🥉]?\s*(\d+)\.\s*(.*)/);
  const rank = rankMatch ? parseInt(rankMatch[1]) : 0;
  const name = rankMatch ? rankMatch[2].trim() : titlePlain.replace(/[🥇🥈🥉]\s*/, '').trim();

  let i = startIndex + 1;
  let badge = '';
  let subtitle = '';
  let score = 0;
  const specs = [];
  const pros = [];
  const cons = [];
  let recommendation = '';
  let ctaUrl = '';
  let inPros = false;
  let inCons = false;
  let inSpecs = false;

  while (i < blocks.length) {
    const block = blocks[i];
    // 다음 heading_3 (새 리뷰) 또는 heading_2 (새 섹션)이면 종료
    if (block.type === 'heading_2') break;
    if (block.type === 'heading_3') {
      const text = getPlainText(block);
      // 장점 / 단점 헤딩 감지 (✓/✕ 마크 있든 없든)
      const trimmedH3 = text.replace(/^#{1,4}\s*/, '').trim();
      if (/^(✓\s*)?장점[:：]?\s*$/.test(trimmedH3)) {
        inPros = true;
        inCons = false;
        inSpecs = false;
        i++;
        continue;
      }
      if (/^(✕\s*)?단점[:：]?\s*$/.test(trimmedH3)) {
        inCons = true;
        inPros = false;
        inSpecs = false;
        i++;
        continue;
      }
      // 새 리뷰 (숫자. 패턴)
      if (/[🥇🥈🥉]?\s*\d+\./.test(text) || /^\d+\./.test(text)) break;
    }

    if (block.type === 'divider') {
      // 리뷰 사이 구분선 → 이 리뷰 종료
      i++;
      break;
    }

    const text = getPlainText(block);

    // "---" 텍스트를 가진 paragraph도 구분선으로 처리
    if (block.type === 'paragraph' && text.trim() === '---') {
      i++;
      break;
    }

    if (block.type === 'paragraph') {
      // 장점 / 단점 감지 (✓/✕ 마크 있든 없든, heading_3/paragraph 모두)
      const cleanedText = text.replace(/^#{1,4}\s*/, '').trim();
      if (/^(✓\s*)?장점[:：]?\s*$/.test(cleanedText)) {
        inPros = true;
        inCons = false;
        inSpecs = false;
        i++;
        continue;
      }
      if (/^(✕\s*)?단점[:：]?\s*$/.test(cleanedText)) {
        inCons = true;
        inPros = false;
        inSpecs = false;
        i++;
        continue;
      }

      // "최고 추천 · "AI 작업과..."" (plain text에는 ** 없음)
      const badgeMatch = text.match(/(.+?)\s*[·]\s*[""](.+?)["""]/)
        || text.match(/\*\*(.+?)\*\*\s*[·]\s*\*\*[""](.+?)["""]\*\*/);
      if (badgeMatch && !badge) {
        badge = badgeMatch[1].replace(/\*\*/g, '');
        subtitle = badgeMatch[2].replace(/\*\*/g, '');
        i++;
        continue;
      }

      // "⭐ 9.4/10" (plain text에는 ** 없음)
      const scoreMatch = text.match(/⭐\s*\*?\*?([\d.]+)\/\d+\*?\*?/)
        || text.match(/⭐\s*([\d.]+)\s*\/\s*\d+/);
      if (scoreMatch) {
        score = parseFloat(scoreMatch[1]);
        i++;
        continue;
      }

      // "**핵심 스펙:**" 라벨
      if (text.includes('핵심 스펙')) {
        inSpecs = true;
        inPros = false;
        inCons = false;
        i++;
        continue;
      }

      // "추천 대상:" 텍스트 (plain text에는 ** 없음)
      if (text.includes('추천 대상')) {
        recommendation = text.replace(/\*?\*?추천 대상:\*?\*?\s*/, '').replace(/\*\*/g, '');
        i++;
        continue;
      }

      // 👉 CTA 링크 (plain text에는 [](url) 없음, rich_text의 href에서 추출)
      if (text.includes('👉')) {
        const richTexts = block[block.type].rich_text;
        const linkRT = richTexts && richTexts.find(rt => rt.href);
        if (linkRT) {
          ctaUrl = linkRT.href;
        } else {
          // fallback: 마크다운 패턴
          const ctaMatch = text.match(/👉\s*\[.+?\]\((.+?)\)/);
          if (ctaMatch) ctaUrl = ctaMatch[1];
        }
        i++;
        continue;
      }

      i++;
      continue;
    }

    if (block.type === 'bulleted_list_item') {
      if (inSpecs) {
        // "CPU: AMD Ryzen AI 7 350" (plain text에는 ** 없음)
        const specMatch = text.match(/\*\*(.+?):\*\*\s*(.*)/) || text.match(/(.+?):\s*(.*)/);
        if (specMatch) {
          specs.push({ label: specMatch[1].replace(/\*\*/g, ''), value: specMatch[2].replace(/\*\*/g, '') });
        }
      } else if (inPros) {
        pros.push(text);
      } else if (inCons) {
        cons.push(text);
      }
      i++;
      continue;
    }

    i++;
  }

  return {
    review: { rank, name, badge, subtitle, score, specs, pros, cons, recommendation, ctaUrl },
    nextIndex: i,
  };
}

function renderReviewCard(review) {
  const badgeType = review.rank === 1 ? 'best' : review.rank === 2 ? 'primary' : review.rank === 3 ? 'success' : 'primary';

  let html = `<div class="review-card">\n`;
  html += `<div class="review-card-image"><div class="product-placeholder">💻</div></div>\n`;
  html += `<div class="review-card-body">\n`;

  // 헤더
  html += `<div class="review-card-header"><div>\n`;
  if (review.badge) {
    html += `<span class="badge badge-${badgeType}" style="margin-bottom:8px;display:inline-block;">${escapeHtml(review.badge)}</span>\n`;
  }
  html += `<h3>${review.rank ? `${review.rank}. ` : ''}${escapeHtml(review.name)}</h3>\n`;
  if (review.subtitle) {
    html += `<span class="subtitle">${escapeHtml(review.subtitle)}</span>\n`;
  }
  html += `</div>\n`;
  if (review.score) {
    html += `<div class="review-score" aria-label="평점 ${review.score}점 / 10점">${review.score} <small>/10</small></div>\n`;
  }
  html += `</div>\n`;

  // 스펙
  if (review.specs.length > 0) {
    html += `<div class="review-card-specs">\n`;
    for (const s of review.specs) {
      html += `<span class="spec"><strong>${escapeHtml(s.label)}:</strong> ${escapeHtml(s.value)}</span>\n`;
    }
    html += `</div>\n`;
  }

  // 장단점
  if (review.pros.length > 0 || review.cons.length > 0) {
    html += `<div class="pros-cons">\n`;
    if (review.pros.length > 0) {
      html += `<div><h4 style="color:#166534;">장점</h4><ul class="pick-pros">\n`;
      for (const p of review.pros) {
        html += `<li>${escapeHtml(p)}</li>\n`;
      }
      html += `</ul></div>\n`;
    }
    if (review.cons.length > 0) {
      html += `<div><h4 style="color:#991b1b;">단점</h4><ul class="pick-pros pick-cons">\n`;
      for (const c of review.cons) {
        html += `<li>${escapeHtml(c)}</li>\n`;
      }
      html += `</ul></div>\n`;
    }
    html += `</div>\n`;
  }

  // 추천 대상
  if (review.recommendation) {
    html += `<p class="rec-text"><strong>추천 대상:</strong> ${escapeHtml(review.recommendation)}</p>\n`;
  }

  // CTA
  if (review.ctaUrl) {
    const cleanUrl = review.ctaUrl.replace(/%7B%7B/g, '').replace(/%7D%7D/g, '');
    html += `<div class="review-card-actions"><a href="${escapeAttr(cleanUrl)}" class="cta-btn" rel="nofollow noopener" target="_blank">쿠팡 최저가 보기</a></div>\n`;
  }

  html += `</div></div>\n`;
  return html;
}

// ==========================================
// 패턴 5: FAQ → faq-list
// ==========================================
function parseFaqSection(blocks, startIndex, imageMap) {
  const heading = getPlainText(blocks[startIndex]);
  let i = startIndex + 1;
  const faqItems = [];

  while (i < blocks.length) {
    const block = blocks[i];
    if (block.type === 'heading_2') break;

    // 불릿 리스트 아이템이 질문, 자식 텍스트가 답변
    if (block.type === 'bulleted_list_item') {
      const question = getPlainText(block);
      let answer = '';

      // 자식 블록에서 답변 수집
      if (block.children) {
        answer = block.children
          .map((child) => {
            const data = child[child.type];
            if (data && data.rich_text) {
              return richTextToHtml(data.rich_text);
            }
            return '';
          })
          .filter(Boolean)
          .join(' ');
      }

      // 자식이 없으면 다음 블록들에서 답변 수집 (들여쓰기 패턴)
      if (!answer) {
        let j = i + 1;
        const answerParts = [];
        while (j < blocks.length) {
          const nextBlock = blocks[j];
          if (nextBlock.type === 'bulleted_list_item' || nextBlock.type === 'heading_2' || nextBlock.type === 'heading_3') break;
          if (nextBlock.type === 'paragraph') {
            const text = richTextToHtml(nextBlock[nextBlock.type].rich_text);
            if (text) answerParts.push(text);
          }
          j++;
        }
        if (answerParts.length > 0) {
          answer = answerParts.join(' ');
          i = j;
          faqItems.push({ question, answer });
          continue;
        }
      }

      if (question) {
        faqItems.push({ question, answer });
      }
    }

    i++;
  }

  let html = `<h2 id="faq">${escapeHtml(heading)}</h2>\n`;
  if (faqItems.length > 0) {
    html += `<div class="faq-list">\n`;
    for (const item of faqItems) {
      html += `<details class="faq-item">\n`;
      html += `<summary class="faq-question">${escapeHtml(item.question)}<svg class="arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg></summary>\n`;
      html += `<div class="faq-answer-inner">${item.answer}</div>\n`;
      html += `</details>\n`;
    }
    html += `</div>`;
  }

  return { html, nextIndex: i };
}

// ==========================================
// 패턴 6: 마무리 → 결론 섹션
// ==========================================
function parseConclusionSection(blocks, startIndex, imageMap) {
  const heading = getPlainText(blocks[startIndex]);
  let i = startIndex + 1;
  let bodyHtml = '';

  while (i < blocks.length) {
    const block = blocks[i];
    if (block.type === 'heading_2') break;

    const html = renderBlock(block, imageMap);
    if (html) bodyHtml += html + '\n';
    i++;
  }

  let html = `<h2 id="conclusion">${escapeHtml(heading)}</h2>\n`;
  html += bodyHtml;

  return { html, nextIndex: i };
}

// ==========================================
// 기본 블록 렌더링 (패턴 미매칭 시)
// ==========================================
function renderBlock(block, imageMap) {
  const type = block.type;
  const data = block[type];
  if (!data) return '';

  switch (type) {
    case 'paragraph': {
      const html = richTextToHtml(data.rich_text);
      if (!html) return '';
      // CTA 링크 변환: 👉 [텍스트](url) → cta-btn
      const ctaMatch = html.match(/👉\s*<a href="(.+?)">(.+?)<\/a>/);
      if (ctaMatch) {
        const cleanUrl = ctaMatch[1].replace(/%7B%7B/g, '').replace(/%7D%7D/g, '');
        return `<div style="text-align:center;margin:20px 0;"><a href="${escapeAttr(cleanUrl)}" class="cta-btn" rel="nofollow noopener" target="_blank">${ctaMatch[2]}</a></div>`;
      }
      return `<p>${html}</p>`;
    }

    case 'heading_1':
      return `<h2>${richTextToHtml(data.rich_text)}</h2>`;

    case 'heading_2': {
      const text = richTextToPlain(data.rich_text);
      const id = text.replace(/\s+/g, '-').replace(/[^\w가-힣-]/g, '').toLowerCase();
      return `<h3 id="${id}">${richTextToHtml(data.rich_text)}</h3>`;
    }

    case 'heading_3':
      return `<h4>${richTextToHtml(data.rich_text)}</h4>`;

    case 'bulleted_list_item': {
      let html = `<li>${richTextToHtml(data.rich_text)}</li>`;
      return html;
    }

    case 'numbered_list_item': {
      let html = `<li>${richTextToHtml(data.rich_text)}</li>`;
      return html;
    }

    case 'to_do': {
      const checked = data.checked ? 'checked' : '';
      return `<li><input type="checkbox" ${checked} disabled> ${richTextToHtml(data.rich_text)}</li>`;
    }

    case 'toggle': {
      let html = `<details class="faq-item">\n<summary class="faq-question">${richTextToHtml(data.rich_text)}</summary>\n`;
      if (block.children) {
        html += `<div class="faq-answer-inner">`;
        html += block.children.map((child) => renderBlock(child, imageMap)).filter(Boolean).join('\n');
        html += `</div>`;
      }
      html += `\n</details>`;
      return html;
    }

    case 'code': {
      const lang = data.language || '';
      const code = richTextToPlain(data.rich_text);
      return `<pre><code class="language-${lang}">${escapeHtml(code)}</code></pre>`;
    }

    case 'quote':
      return `<blockquote><p>${richTextToHtml(data.rich_text)}</p></blockquote>`;

    case 'callout': {
      const icon = data.icon?.emoji || '💡';
      return `<blockquote><p>${icon} ${richTextToHtml(data.rich_text)}</p></blockquote>`;
    }

    case 'divider':
      return '<hr>';

    case 'image': {
      const url = data.type === 'external' ? data.external.url : data.file.url;
      const caption = data.caption ? richTextToPlain(data.caption) : '';
      const alt = caption || 'image';
      const src = imageMap && imageMap.has(block.id) ? imageMap.get(block.id) : url;
      return `<img src="${escapeAttr(src)}" alt="${escapeAttr(alt)}" loading="lazy" decoding="async" style="max-width:100%;border-radius:8px;">`;
    }

    case 'bookmark':
      return data.url ? `<a href="${escapeAttr(data.url)}">${escapeHtml(data.url)}</a>` : '';

    case 'embed':
      return data.url ? `<a href="${escapeAttr(data.url)}">임베드</a>` : '';

    case 'table':
      return renderComparisonTable(block);

    case 'column_list': {
      if (!block.children) return '';
      return block.children
        .map((col) => {
          if (!col.children) return '';
          return col.children.map((child) => renderBlock(child, imageMap)).filter(Boolean).join('\n');
        })
        .join('\n');
    }

    default:
      return '';
  }
}

// ==========================================
// blocksToMarkdown에서 리스트 아이템 래핑
// ==========================================
const originalBlocksToMarkdown = blocksToMarkdown;

function blocksToMarkdownWrapped(blocks, imageMap) {
  const sections = parseSections(blocks, imageMap);

  // 연속된 <li> 태그를 <ul>/<ol>로 래핑
  const result = [];
  let inList = false;

  for (const section of sections) {
    if (section.startsWith('<li>')) {
      if (!inList) {
        result.push('<ul>');
        inList = true;
      }
      result.push(section);
    } else {
      if (inList) {
        result.push('</ul>');
        inList = false;
      }
      result.push(section);
    }
  }
  if (inList) result.push('</ul>');

  return result.join('\n');
}

module.exports = {
  blocksToMarkdown: blocksToMarkdownWrapped,
  richTextToMarkdown: richTextToHtml,
};
