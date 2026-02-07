const readline = require('readline');
const fs = require('fs');
const path = require('path');

const ENV_FILE = path.join(__dirname, '..', '.env');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║     🔧 HyunTech Notion 연동 설정        ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log('');

  // 기존 .env 로드
  const existing = loadEnv();

  // NOTION_TOKEN
  const currentToken = existing.NOTION_TOKEN;
  const tokenHint = currentToken ? ` (현재: ${mask(currentToken)})` : '';
  const token = await ask(`📌 Notion Integration 토큰${tokenHint}\n   → `);

  // NOTION_DATABASE_ID
  const currentDbId = existing.NOTION_DATABASE_ID;
  const dbHint = currentDbId ? ` (현재: ${mask(currentDbId)})` : '';
  const dbId = await ask(`\n📌 Notion 데이터베이스 ID${dbHint}\n   → `);

  // 값 결정 (빈 입력이면 기존 값 유지)
  const finalToken = token.trim() || currentToken || '';
  const finalDbId = dbId.trim() || currentDbId || '';

  if (!finalToken || !finalDbId) {
    console.log('\n❌ 토큰과 데이터베이스 ID 모두 필요합니다.');
    rl.close();
    process.exit(1);
  }

  // .env 저장
  const envContent = `NOTION_TOKEN=${finalToken}\nNOTION_DATABASE_ID=${finalDbId}\n`;
  fs.writeFileSync(ENV_FILE, envContent, 'utf-8');

  console.log('');
  console.log('✅ .env 파일 저장 완료!');
  console.log('');
  console.log('다음 명령어로 동기화를 실행하세요:');
  console.log('   npm run sync');
  console.log('');

  rl.close();
}

function loadEnv() {
  const result = {};
  try {
    if (fs.existsSync(ENV_FILE)) {
      const content = fs.readFileSync(ENV_FILE, 'utf-8');
      for (const line of content.split('\n')) {
        const idx = line.indexOf('=');
        if (idx > 0) {
          const key = line.substring(0, idx).trim();
          const val = line.substring(idx + 1).trim();
          result[key] = val;
        }
      }
    }
  } catch {}
  return result;
}

function mask(str) {
  if (str.length <= 8) return '****';
  return str.substring(0, 4) + '****' + str.substring(str.length - 4);
}

main();
