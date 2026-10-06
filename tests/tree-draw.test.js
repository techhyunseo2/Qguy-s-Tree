import { test } from 'node:test';
import assert from 'node:assert/strict';
import { treeSVG, stageOf, MIN_MONTH, MIN_YEAR } from '../js/tree-draw.js';

const fruits = n => Array.from({ length: n }, (_, i) => ({ id: 'q' + i, text: `질문 ${i}` }));
const count = (svg, re) => (svg.match(re) || []).length;

test('열매가 없으면 새싹', () => {
  assert.equal(stageOf(0), null);
  assert.equal(count(treeSVG('s1:2026-10', [], {}), /class="fruit/g), 0);
});

test('한 달 나무는 열매 1·2·3·5개에서 자란다', () => {
  assert.deepEqual(MIN_MONTH, [1, 2, 3, 5]);
  const R = n => stageOf(n)?.R;
  assert.ok(R(1) < R(2) && R(2) < R(3) && R(3) < R(5));
  assert.equal(R(4), R(3));
});

test('한 해 나무는 더 많아야 자란다', () => {
  assert.deepEqual(MIN_YEAR, [1, 4, 8, 14]);
  assert.equal(stageOf(3, true).R, stageOf(1, true).R);
  assert.ok(stageOf(14, true).R > stageOf(8, true).R);
});

test('열매 수만큼 열리고, 누를 수 있는 나무에서는 열매마다 질문 번호가 붙는다', () => {
  for (const n of [1, 3, 7, 25]) {
    const svg = treeSVG('s1:2026-10', fruits(n), { interactive: true });
    assert.equal(count(svg, /data-q="/g), n);
    for (let i = 0; i < n; i++) assert.ok(svg.includes(`data-q="q${i}"`));
  }
});

test('같은 씨앗이면 똑같이, 다른 달이면 다르게 그린다', () => {
  const a = treeSVG('s1:2026-10', fruits(4), {});
  assert.equal(treeSVG('s1:2026-10', fruits(4), {}), a);
  assert.notEqual(treeSVG('s1:2026-09', fruits(4), {}), a);
});

test('빛나는 질문에는 금빛 테두리', () => {
  const svg = treeSVG('s1', [{ id: 'a', text: '', star: true }, { id: 'b', text: '' }], {});
  assert.equal(count(svg, /#e0a812/g), 1);
});

test('질문 글은 SVG 안에서 이스케이프된다', () => {
  const svg = treeSVG('s1', [{ id: 'a', text: '<script>"x"</script>' }], { interactive: true });
  assert.ok(!svg.includes('<script>'));
  assert.ok(svg.includes('&lt;script&gt;'));
});

test('새로 열린 열매만 톡 튀어나온다', () => {
  assert.equal(count(treeSVG('s1', fruits(3), { fresh: new Set(['q1']) }), /class="fruit fresh"/g), 1);
});

test('계절마다 모양이 다르다', () => {
  const by = s => treeSVG('s1', fruits(3), { season: s });
  assert.ok(by('winter').includes('#fbfdff'));   // 눈
  assert.ok(by('spring').includes('#f7c3d2'));   // 꽃
  assert.notEqual(by('summer'), by('autumn'));
});
