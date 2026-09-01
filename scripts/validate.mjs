import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(readFileSync(join(ROOT, 'content/events.json'), 'utf8'));
const html = readFileSync(join(ROOT, 'web/index.html'), 'utf8');

const errors = [];
const warns = [];

const { from, to } = data.meta.range;
const eraIds = new Set(data.eras.map(e => e.id));
const iconIds = new Set([...html.matchAll(/id="i-([a-z-]+)"/g)].map(m => m[1]));
const seen = new Set();
let prev = -1;

for (const ev of data.events) {
  const at = `[${ev.id}]`;

  if (seen.has(ev.id)) errors.push(`${at} id 중복`);
  seen.add(ev.id);

  if (ev.year < from || ev.year > to) errors.push(`${at} year ${ev.year} 가 ${from}–${to} 범위 밖`);
  if (!(ev.month >= 1 && ev.month <= 12)) errors.push(`${at} month ${ev.month} 이 1–12 밖`);
  if (ev.id !== `${ev.year}-${String(ev.month).padStart(2, '0')}`) errors.push(`${at} id 가 year/month 와 불일치`);

  const key = ev.year * 12 + ev.month;
  if (key < prev) errors.push(`${at} 연대순 정렬이 어긋남`);
  prev = key;

  if (!eraIds.has(ev.era)) errors.push(`${at} 알 수 없는 era "${ev.era}"`);
  if (!iconIds.has(ev.icon)) errors.push(`${at} 스프라이트에 없는 icon "${ev.icon}"`);
  if (ev.anchor !== 'korea' && ev.anchor !== 'world') errors.push(`${at} anchor 는 korea|world 여야 함`);
  if (!ev.title) errors.push(`${at} title 누락`);

  // 병행 표기 요구사항: 두 축 모두 존재해야 함
  for (const side of ['korea', 'world']) {
    const s = ev[side];
    if (!s) { errors.push(`${at} ${side} 축 누락 — 한국사·세계사 병행 표기 위반`); continue; }
    if (!s.headline) errors.push(`${at} ${side}.headline 누락`);
    if (!s.body) errors.push(`${at} ${side}.body 누락`);
    if (!Array.isArray(s.figures) || s.figures.length === 0) errors.push(`${at} ${side}.figures 는 인물 1명 이상`);
    if (s.body && s.body.length > 130) warns.push(`${at} ${side}.body ${s.body.length}자 — 카드가 길어짐 (권장 130자 이하)`);
  }
}

// 시대 커버리지
for (let y = from; y <= to; y++) {
  if (!data.eras.some(e => y >= e.from && y <= e.to)) errors.push(`${y}년을 포함하는 era 가 없음`);
}

// 주가 시리즈
for (const mk of data.markets ?? []) {
  const at = `[market:${mk.id}]`;
  if (!mk.label) errors.push(`${at} label 누락`);
  if (mk.track !== 'korea' && mk.track !== 'world') errors.push(`${at} track 은 korea|world 여야 함`);
  if (!Array.isArray(mk.series) || mk.series.length < 2) { errors.push(`${at} series 는 2개 이상`); continue; }

  let prevYear = -Infinity;
  for (const [y, v] of mk.series) {
    if (!Number.isInteger(y)) errors.push(`${at} 연도 ${y} 가 정수가 아님`);
    if (y < from || y > to) errors.push(`${at} ${y}년이 ${from}–${to} 범위 밖`);
    if (y <= prevYear) errors.push(`${at} ${y}년이 연대순이 아니거나 중복`);
    prevYear = y;
    if (!(typeof v === 'number' && v > 0)) errors.push(`${at} ${y}년 값이 양수가 아님 (로그 스케일 불가)`);
  }

  // 값이 빠진 해가 있으면 곡선이 직선으로 건너뛴다
  const span = mk.series[mk.series.length - 1][0] - mk.series[0][0] + 1;
  if (mk.series.length !== span) warns.push(`${at} ${mk.series[0][0]}–${mk.series[mk.series.length - 1][0]} 중 ${span - mk.series.length}개 해가 빠짐`);

  // 경제사 각주 — 팝업에서 그 해 시리즈 값과 함께 뜨므로 series 범위 안이어야 한다
  const years = new Set(mk.series.map(([y]) => y));
  for (const n of mk.notes ?? []) {
    const nat = `${at}[note:${n.year}]`;
    if (!n.headline) errors.push(`${nat} headline 누락`);
    if (!n.body) errors.push(`${nat} body 누락`);
    if (!years.has(n.year)) errors.push(`${nat} series 에 없는 연도`);
  }
}

for (const w of warns) console.log(`  ! ${w}`);
if (errors.length) {
  console.error(`\n✗ 검증 실패 — ${errors.length}건`);
  errors.forEach(e => console.error(`  · ${e}`));
  process.exit(1);
}
const mkt = (data.markets ?? []).map(m => `${m.label} ${m.series.length}p`).join(' · ');
console.log(`✓ 검증 통과 — 사건 ${data.events.length}개 · 시대 ${data.eras.length}개 · ${from}–${to}${mkt ? ` · 지수 ${mkt}` : ''}${warns.length ? ` (경고 ${warns.length})` : ''}`);
