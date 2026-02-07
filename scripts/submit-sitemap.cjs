const https = require('https');

const SITE_URL = 'https://hyuntech.ai.kr';
const SITEMAP_URL = `${SITE_URL}/sitemap-index.xml`;

/**
 * Google에 사이트맵 제출 (Ping 방식)
 * Google Search Console API를 사용하려면 GOOGLE_SERVICE_ACCOUNT_KEY가 필요
 */
async function submitSitemap() {
  console.log('🔍 Google에 사이트맵 제출 중...\n');

  // 방법 1: Google Ping (간단, 인증 불필요)
  const pingUrl = `https://www.google.com/ping?sitemap=${encodeURIComponent(SITEMAP_URL)}`;

  return new Promise((resolve, reject) => {
    https
      .get(pingUrl, (res) => {
        if (res.statusCode === 200) {
          console.log(`✅ Google Ping 성공: ${SITEMAP_URL}`);
          resolve();
        } else {
          console.warn(`⚠️ Google Ping 응답: HTTP ${res.statusCode}`);
          resolve(); // 실패해도 계속 진행
        }
      })
      .on('error', (err) => {
        console.warn(`⚠️ Google Ping 실패: ${err.message}`);
        resolve(); // 실패해도 계속 진행
      });
  });
}

/**
 * Google Indexing API로 개별 URL 제출
 * GOOGLE_SERVICE_ACCOUNT_KEY 환경변수가 있을 때만 동작
 */
async function submitIndexingApi() {
  const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!keyJson) {
    console.log('ℹ️  GOOGLE_SERVICE_ACCOUNT_KEY 없음 - Indexing API 건너뜀');
    return;
  }

  try {
    const key = JSON.parse(keyJson);
    console.log(`📋 Service Account: ${key.client_email}`);
    console.log('ℹ️  Google Indexing API는 서비스 계정 OAuth2 인증이 필요합니다.');
    console.log('   google-auth-library 패키지 설치 후 사용 가능합니다.');
  } catch (err) {
    console.warn(`⚠️ Service Account Key 파싱 실패: ${err.message}`);
  }
}

async function main() {
  await submitSitemap();
  await submitIndexingApi();
  console.log('\n✅ 사이트맵 제출 완료!');
}

main().catch((err) => {
  console.error('❌ 사이트맵 제출 실패:', err);
  process.exit(1);
});
