import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const web = p => readFileSync(join(ROOT, 'web', p), 'utf8');

const JS_FILES = ['splash.js', 'timeline.js', 'card.js', 'chat.js'];

const css = web('styles.css');
const js = JS_FILES.map(f => `/* ── ${f} ── */\n${web(f)}`).join('\n');

const html = web('index.html')
  .replace('/*INJECT:CSS*/', () => css)
  .replace('/*INJECT:JS*/', () => js);

if (html.includes('/*INJECT:')) {
  console.error('✗ 주입 마커가 남아 있습니다 — index.html 의 플레이스홀더를 확인하세요.');
  process.exit(1);
}

mkdirSync(join(ROOT, 'dist'), { recursive: true });
writeFileSync(join(ROOT, 'dist/index.html'), html, 'utf8');
// 저장소 루트의 index.html 은 dist/index.html 의 거울 — 둘이 따로 놀지 않도록 매 빌드마다 같이 갱신한다
writeFileSync(join(ROOT, 'index.html'), html, 'utf8');

const kb = n => (n / 1024).toFixed(1) + ' KB';
console.log(`✓ dist/index.html + index.html  ${kb(Buffer.byteLength(html))}  (CSS ${kb(css.length)} · JS ${kb(js.length)} 인라인)`);
