import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NS = '16da29a4e4de45bea07749a0dbe1ef59';

// .env 에서 토큰을 읽어 wrangler 에 넘긴다 (이미 환경변수에 있으면 그대로 사용)
let token = process.env.CLOUDFLARE_API_TOKEN;
if (!token) {
  const m = readFileSync(join(ROOT, '.env'), 'utf8').match(/cfut_[A-Za-z0-9]+/);
  if (!m) { console.error('✗ .env 에서 CLOUDFLARE_API_TOKEN 을 찾지 못했습니다.'); process.exit(1); }
  token = m[0];
}

const put = (key, file) => {
  console.log(`  → ${key}  ⟵  ${file}`);
  // Windows 의 npx 는 .cmd 라 shell 경유가 필요하다
  execFileSync(
    'npx',
    ['wrangler', 'kv', 'key', 'put', `--namespace-id=${NS}`, `"${key}"`, `--path="${join(ROOT, file)}"`, '--remote'],
    { stdio: ['ignore', 'ignore', 'inherit'], env: { ...process.env, CLOUDFLARE_API_TOKEN: token }, cwd: ROOT, shell: true }
  );
};

console.log('KV 업로드');
put('page:index', 'dist/index.html');
put('data:events', 'content/events.json');
console.log('✓ 완료 — 콘텐츠만 바꿨다면 재배포 없이 이 스크립트만 실행하면 됩니다.');
