// 파일끼리 맞물리는지: 페이지가 부르는 파일이 있는지, 규칙이 열쇠를 지키는지.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const read = p => readFileSync(join(root, p), 'utf8');
const pages = ['index.html', 'ask.html', 'tree.html', 'admin.html', 'setup.html'];

test('페이지가 부르는 css·js 가 모두 있다', () => {
  for (const p of pages) {
    for (const [, src] of read(p).matchAll(/(?:src|href)="((?:js|css)\/[^"]+)"/g)) assert.ok(existsSync(join(root, src)), `${p} → ${src}`);
  }
});

test('모든 페이지가 주소(열쇠)를 바깥에 흘리지 않고 검색에도 안 잡힌다', () => {
  for (const p of pages) {
    const html = read(p);
    assert.match(html, /name="referrer" content="no-referrer"/, p);
    assert.match(html, /name="robots" content="noindex/, p);
  }
});

test('js 파일끼리 가져다 쓰는 이름이 실제로 내보내진다', () => {
  const dir = join(root, 'js');
  const exportsOf = f => {
    const s = readFileSync(join(dir, f), 'utf8');
    const names = new Set([...s.matchAll(/export (?:async )?(?:function|const|let) ([\w$]+)/g)].map(m => m[1]));
    for (const m of s.matchAll(/export \{([^}]+)\}/g)) m[1].split(',').map(x => x.trim()).filter(Boolean).forEach(n => names.add(n));
    return names;
  };
  for (const f of readdirSync(dir)) {
    const s = readFileSync(join(dir, f), 'utf8');
    for (const m of s.matchAll(/import \{([^}]+)\} from '\.\/([\w-]+\.js)'/g)) {
      const have = exportsOf(m[2]);
      for (const n of m[1].split(',').map(x => x.trim()).filter(Boolean)) assert.ok(have.has(n), `${f}: ${m[2]} 에 ${n} 없음`);
    }
  }
});

test('페이지들이 부르는 store 함수가 모두 있다', () => {
  const have = new Set([...read('js/store.js').matchAll(/export (?:async )?(?:function|const) (\w+)/g)].map(m => m[1]).concat(['configured']));
  for (const f of ['ask.js', 'tree.js', 'admin.js', 'setup.js']) {
    for (const m of read('js/' + f).matchAll(/store\.(?!js\b)(\w+)/g)) assert.ok(have.has(m[1]), `${f}: store.${m[1]} 없음`);
  }
});

test('hidden 속성이 CSS display 에 지지 않는다 (쪽지·알림이 닫힌 채 보이던 버그)', () => {
  assert.match(read('css/style.css'), /\[hidden\]\{display:none!important\}/);
});

test('Firebase 모듈은 한 판으로 맞춘다', () => {
  assert.equal(new Set([...read('js/firebase.js').matchAll(/firebasejs\/([\d.]+)\//g)].map(m => m[1])).size, 1);
});

test('보안 규칙: 목록 조회는 열지 않고, 원본 질문과 시트 주소는 교사만', () => {
  const rules = read('firestore.rules');
  assert.doesNotMatch(rules, /allow (read|list)[^;]*: if true/);
  assert.doesNotMatch(rules, /allow write: if true/);
  assert.match(rules, /match \/questions\/\{q\}[\s\S]*?allow get, list, update, delete: if isAdmin\(c\)/);
  assert.match(rules, /match \/private\/\{d\}[\s\S]*?if isAdmin\(c\)/);
});

test('보안 규칙: 중괄호가 맞는다', () => {
  let d = 0;
  for (const ch of read('firestore.rules').replace(/\/\/.*$/gm, '')) { if (ch === '{') d++; if (ch === '}') d--; assert.ok(d >= 0); }
  assert.equal(d, 0);
});

test('학생이 보낼 수 있는 칸과 앱이 보내는 칸이 같다', () => {
  assert.match(read('firestore.rules'), /hasOnly\(\['sid', 'text', 'topic', 'date', 'askedAt', 'status'\]\)/);
  const sent = read('js/store.js').match(/addDoc\(P\.questions\(c\), \{([^}]+)\}/)[1].split(',').map(s => s.trim().split(':')[0]);
  assert.deepEqual(sent.sort(), ['askedAt', 'date', 'sid', 'status', 'text', 'topic']);
});

test('설치 묶음이 규칙의 설치 조건과 맞는다: 키 24자 ≥ 20, 반 코드 20자 ≥ 16', () => {
  const store = read('js/store.js');
  assert.match(store, /const c = randKey\(20\), k = randKey\(24\);/);
  const rules = read('firestore.rules');
  assert.match(rules, /k\.size\(\) >= 20/);
  assert.match(rules, /c\.size\(\) >= 16/);
});
