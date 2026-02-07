const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const IMAGES_DIR = path.join(__dirname, '../../public/notion-images');

/**
 * URL에서 이미지 다운로드
 */
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const dir = path.dirname(destPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const client = url.startsWith('https') ? https : http;
    client
      .get(url, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          // 리다이렉트 처리
          return downloadFile(response.headers.location, destPath).then(resolve).catch(reject);
        }
        if (response.statusCode !== 200) {
          return reject(new Error(`HTTP ${response.statusCode} for ${url}`));
        }

        const file = fs.createWriteStream(destPath);
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve(destPath);
        });
        file.on('error', (err) => {
          fs.unlink(destPath, () => {});
          reject(err);
        });
      })
      .on('error', reject);
  });
}

/**
 * 블록에서 이미지를 찾아 다운로드하고, blockId → 로컬 경로 맵 반환
 */
async function downloadImages(blocks, slug) {
  const imageMap = new Map();
  const slugDir = path.join(IMAGES_DIR, slug);

  let index = 0;
  for (const block of blocks) {
    if (block.type === 'image') {
      const data = block.image;
      const url = data.type === 'external' ? data.external.url : data.file.url;

      if (!url) continue;

      const ext = getExtension(url);
      const filename = `${index}${ext}`;
      const destPath = path.join(slugDir, filename);
      const publicPath = `/notion-images/${slug}/${filename}`;

      try {
        await downloadFile(url, destPath);
        imageMap.set(block.id, publicPath);
        index++;
        console.log(`  📷 이미지 다운로드: ${filename}`);
      } catch (err) {
        console.warn(`  ⚠️ 이미지 다운로드 실패: ${url} - ${err.message}`);
      }
    }

    // 재귀: 자식 블록의 이미지도 처리
    if (block.children) {
      const childMap = await downloadImages(block.children, slug);
      for (const [k, v] of childMap) {
        imageMap.set(k, v);
      }
    }
  }

  return imageMap;
}

function getExtension(url) {
  try {
    const pathname = new URL(url).pathname;
    const ext = path.extname(pathname).split('?')[0];
    if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.avif'].includes(ext.toLowerCase())) {
      return ext;
    }
  } catch {}
  return '.png';
}

/**
 * 특정 slug의 이미지 디렉토리 삭제
 */
function removeImages(slug) {
  const slugDir = path.join(IMAGES_DIR, slug);
  if (fs.existsSync(slugDir)) {
    fs.rmSync(slugDir, { recursive: true, force: true });
  }
}

module.exports = {
  downloadImages,
  removeImages,
};
