// 나무와 열매 그리기. 같은 씨앗(학생+달)이면 언제 그려도 같은 모양, 같은 열매 자리가 나온다.
import { esc } from './common.js';

export const SEASONS = {
  spring: { name: '봄',   sky: '#e1f0fa', ground: '#cbe5b2', leaves: ['#a3d17c', '#88c068', '#bddf97'], trunk: '#8a6346', stem: '#6aa555' },
  summer: { name: '여름', sky: '#dcefe2', ground: '#b7d8a0', leaves: ['#58a160', '#418d4e', '#70b772'], trunk: '#7a553a', stem: '#4f9a5a' },
  autumn: { name: '가을', sky: '#f7ead5', ground: '#e2cd9c', leaves: ['#e69d41', '#d4772e', '#eeba55'], trunk: '#6e4b33', stem: '#c98b3a' },
  winter: { name: '겨울', sky: '#e8eef6', ground: '#dfe8f2', leaves: ['#77a087', '#658d75', '#8bb299'], trunk: '#5d4636', stem: '#6f9a80' }
};
export const FRUITS = {
  apple:     { name: '사과', color: '#d8443a' },
  tangerine: { name: '귤',   color: '#f08a1e' },
  star:      { name: '별',   color: '#f0bc2c' },
  heart:     { name: '하트', color: '#e4577f' }
};

/* 한 달 나무와 한 해 나무는 자라는 기준이 다르다. 한 달에는 열매가 몇 개 안 열린다. */
const LOOK = [
  { R: 36, top: 158, w: 8,  label: '묘목' },
  { R: 49, top: 142, w: 11, label: '작은 나무' },
  { R: 61, top: 130, w: 14, label: '큰 나무' },
  { R: 71, top: 121, w: 17, label: '아름드리' }
];
export const MIN_MONTH = [1, 2, 3, 5];
export const MIN_YEAR = [1, 4, 8, 14];
/** 열매 n개일 때의 나무 단계. 0개면 null(새싹). */
export function stageOf(n, year = false) {
  const mins = year ? MIN_YEAR : MIN_MONTH;
  let s = null;
  mins.forEach((m, i) => { if (n >= m) s = LOOK[i]; });
  return s;
}
export const stageLabel = (n, year) => stageOf(n, year)?.label || '새싹';

const f1 = n => (Math.round(n * 10) / 10).toString();

function rng(seed) {
  let h = 2166136261;
  for (const ch of seed) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  let a = h >>> 0;
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function inEllipse(r, cx, cy, rx, ry) {
  const a = r() * Math.PI * 2, d = Math.sqrt(r());
  return { x: cx + Math.cos(a) * rx * d, y: cy + Math.sin(a) * ry * d };
}

/** 원점에 놓인 열매 하나. star 면 금빛 테두리를 두른다. */
export function fruitShape(shape, r, star = false) {
  const c = (FRUITS[shape] || FRUITS.apple).color;
  const halo = star ? `<circle r="${f1(r * 1.75)}" fill="#ffe27a" opacity=".55"/><circle r="${f1(r * 1.32)}" fill="none" stroke="#e0a812" stroke-width="1.4"/>` : '';
  if (shape === 'star') {
    const p = [];
    for (let i = 0; i < 10; i++) {
      const rad = i % 2 ? r * 0.48 : r * 1.12, a = -Math.PI / 2 + i * Math.PI / 5;
      p.push(`${f1(Math.cos(a) * rad)},${f1(Math.sin(a) * rad)}`);
    }
    return halo + `<polygon points="${p.join(' ')}" fill="${c}" stroke="#c99512" stroke-width=".8" stroke-linejoin="round"/>`;
  }
  if (shape === 'heart') {
    return halo + `<path d="M0 ${f1(r * .95)} C${f1(-r * 1.7)} ${f1(-r * .1)} ${f1(-r * .65)} ${f1(-r * 1.35)} 0 ${f1(-r * .45)} C${f1(r * .65)} ${f1(-r * 1.35)} ${f1(r * 1.7)} ${f1(-r * .1)} 0 ${f1(r * .95)}Z" fill="${c}"/><circle cx="${f1(-r * .45)}" cy="${f1(-r * .35)}" r="${f1(r * .22)}" fill="#fff" opacity=".4"/>`;
  }
  if (shape === 'tangerine') {
    return halo + `<circle r="${f1(r)}" fill="${c}"/><circle cx="${f1(-r * .35)}" cy="${f1(-r * .3)}" r="${f1(r * .26)}" fill="#fff" opacity=".35"/><ellipse cx="${f1(r * .15)}" cy="${f1(-r * .98)}" rx="${f1(r * .42)}" ry="${f1(r * .2)}" fill="#3f8a3a" transform="rotate(-15 ${f1(r * .15)} ${f1(-r * .98)})"/>`;
  }
  return halo + `<circle r="${f1(r)}" fill="${c}"/><circle cx="${f1(-r * .35)}" cy="${f1(-r * .3)}" r="${f1(r * .27)}" fill="#fff" opacity=".35"/><path d="M0 ${f1(-r * .8)} q.6 ${f1(-r * .5)} 1.8 ${f1(-r * .75)}" stroke="#5b3b22" stroke-width="1.3" fill="none" stroke-linecap="round"/><ellipse cx="${f1(r * .5)}" cy="${f1(-r * 1.05)}" rx="${f1(r * .4)}" ry="${f1(r * .18)}" fill="#4c8a3c" transform="rotate(-20 ${f1(r * .5)} ${f1(-r * 1.05)})"/>`;
}

/**
 * 나무 한 그루를 SVG 글로.
 * @param {string} seed    모양을 정하는 씨앗. 보통 '학생id:2026-10'
 * @param {Array}  fruits  [{id, text, star}] 날짜순
 * @param {object} o       { season, fruit, year, interactive, fresh:Set<id> }
 */
export function treeSVG(seed, fruits, o = {}) {
  const se = SEASONS[o.season] || SEASONS.spring, n = fruits.length, st = stageOf(n, o.year);
  const head = o.interactive
    ? '<svg viewBox="0 0 200 220" class="tree-svg interactive">'
    : '<svg viewBox="0 0 200 220" class="tree-svg" aria-hidden="true">';
  let s = head + `<ellipse cx="100" cy="208" rx="${st ? f1(46 + st.R * .5) : 34}" ry="7" fill="${se.ground}"/>`;
  if (!st) {
    s += `<path d="M100 207 C99 197 101 189 100 180" stroke="${se.stem}" stroke-width="3" fill="none" stroke-linecap="round"/>`
       + `<ellipse cx="91" cy="181" rx="9.5" ry="4.5" transform="rotate(-28 91 181)" fill="${se.leaves[0]}"/>`
       + `<ellipse cx="109.5" cy="177" rx="11" ry="5" transform="rotate(22 109.5 177)" fill="${se.leaves[2]}"/>`;
    return s + '</svg>';
  }
  const r = rng(seed), R = st.R, w = st.w, cx = 100, top = st.top, cy = top - R * .45;
  s += `<path d="M${f1(cx - w / 2 - 4)} 208 Q${f1(cx - w / 2 + 1)} 186 ${f1(cx - w / 2 + 1)} ${top} L${f1(cx + w / 2 - 1)} ${top} Q${f1(cx + w / 2 - 1)} 186 ${f1(cx + w / 2 + 4)} 208Z" fill="${se.trunk}"/>`;
  s += `<path d="M${cx - 1} ${top + 10} Q${f1(cx - R * .25)} ${top - 2} ${f1(cx - R * .5)} ${f1(cy + R * .12)}" stroke="${se.trunk}" stroke-width="${f1(w * .45)}" fill="none" stroke-linecap="round"/>`;
  s += `<path d="M${cx + 1} ${top + 4} Q${f1(cx + R * .25)} ${top - 6} ${f1(cx + R * .48)} ${f1(cy + R * .05)}" stroke="${se.trunk}" stroke-width="${f1(w * .4)}" fill="none" stroke-linecap="round"/>`;
  s += `<ellipse cx="${cx}" cy="${f1(cy)}" rx="${R}" ry="${f1(R * .8)}" fill="${se.leaves[1]}"/>`;
  const blobs = [];
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2 + r() * .35, d = R * (.5 + r() * .1);
    blobs.push({ x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d * .78, rad: R * (.42 + r() * .1), c: se.leaves[(i + (r() > .5 ? 1 : 0)) % 3] });
  }
  blobs.sort((a, b) => a.y - b.y);
  for (const b of blobs) s += `<circle cx="${f1(b.x)}" cy="${f1(b.y)}" r="${f1(b.rad)}" fill="${b.c}"/>`;
  s += `<ellipse cx="${f1(cx - R * .18)}" cy="${f1(cy - R * .2)}" rx="${f1(R * .55)}" ry="${f1(R * .42)}" fill="${se.leaves[2]}" opacity=".55"/>`;
  if (o.season === 'winter') for (const b of blobs) if (b.y < cy + 2) s += `<ellipse cx="${f1(b.x)}" cy="${f1(b.y - b.rad * .62)}" rx="${f1(b.rad * .7)}" ry="${f1(b.rad * .28)}" fill="#fbfdff"/>`;
  if (o.season === 'spring') for (let i = 0; i < Math.round(R / 4); i++) { const p = inEllipse(r, cx, cy, R * .85, R * .65); s += `<circle cx="${f1(p.x)}" cy="${f1(p.y)}" r="2.3" fill="#f7c3d2"/>`; }
  if (o.season === 'autumn') for (let i = 0; i < 3; i++) { const x = cx - 40 + r() * 80; s += `<ellipse cx="${f1(x)}" cy="${f1(205 + r() * 5)}" rx="4" ry="2" fill="${se.leaves[1]}" transform="rotate(${Math.round(r() * 60 - 30)} ${f1(x)} 207)"/>`; }

  // 열매 자리: 잎 타원 안에서 서로 겹치지 않게. 열매가 많으면 작아진다.
  const fr = Math.max(5, Math.min(8.5, 9.2 - n * .22));
  const pts = [];
  let minD = fr * 2.4;
  for (let i = 0; i < n; i++) {
    let p, ok = false;
    for (let t = 0; t < 300 && !ok; t++) {
      p = inEllipse(r, cx, cy + R * .06, R * .82, R * .64);
      ok = pts.every(q => Math.hypot(q.x - p.x, q.y - p.y) >= minD);
    }
    if (!ok) minD *= .9;
    pts.push({ x: p.x, y: p.y, f: fruits[i], i });
  }
  pts.slice().sort((a, b) => a.y - b.y).forEach(p => {
    const cls = 'fruit' + (o.fresh && o.fresh.has(p.f.id) ? ' fresh' : '');
    const attrs = o.interactive
      ? ` data-q="${esc(p.f.id)}" tabindex="0" role="button" aria-label="${p.i + 1}번째 열매${p.f.star ? ', 빛나는 질문' : ''}: ${esc(p.f.text)}"`
      : '';
    s += `<g transform="translate(${f1(p.x)} ${f1(p.y)})"><g class="${cls}"${attrs}>${fruitShape(o.fruit, fr, p.f.star)}</g></g>`;
  });
  return s + '</svg>';
}
