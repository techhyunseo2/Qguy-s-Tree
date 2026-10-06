import { test } from 'node:test';
import assert from 'node:assert/strict';
import { schoolYearOf, schoolMonths, monthsSoFar, maskName, parseRoster, sortStudents, fruitsOf, fruitsAcross, randKey, withDefaults, fmt, mLabel, studentList, gradesOf, bansOf, real } from '../js/common.js';

test('학년도는 3월에 시작해 이듬해 2월에 끝난다', () => {
  assert.equal(schoolYearOf('2026-03-01'), 2026);
  assert.equal(schoolYearOf('2026-12-31'), 2026);
  assert.equal(schoolYearOf('2027-01-15'), 2026);
  assert.equal(schoolYearOf('2027-02-28'), 2026);
  assert.equal(schoolYearOf('2026-02-28'), 2025);
});

test('한 학년도의 열두 달', () => {
  const m = schoolMonths(2026);
  assert.equal(m.length, 12);
  assert.equal(m[0], '2026-03');
  assert.equal(m[9], '2026-12');
  assert.equal(m[10], '2027-01');
  assert.equal(m[11], '2027-02');
});

test('지금까지 지나온 달은 이번 달까지', () => {
  assert.deepEqual(monthsSoFar('2026-10-06'), ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
  assert.deepEqual(monthsSoFar('2026-03-02'), ['2026-03']);
  assert.equal(monthsSoFar('2027-02-10').length, 12);
  assert.equal(monthsSoFar('2027-01-05')[0], '2026-03');   // 1월에는 지난해 3월부터 이어진다
});

test('날짜와 달 표기', () => {
  assert.equal(fmt('2026-03-05'), '2026. 3. 5.');
  assert.equal(mLabel('2027-01'), '1월');
});

test('이름 가운데 가리기', () => {
  assert.equal(maskName('김하늘'), '김*늘');
  assert.equal(maskName('이준'), '이*');
  assert.equal(maskName('남궁민수'), '남**수');
  assert.equal(maskName('A'), 'A');
});

test('명단 붙여넣기: 학년·반·번호·이름 네 칸, 세 칸, 두 칸, 이름만', () => {
  assert.deepEqual(parseRoster('2\t1\t7\t홍길동\n3\t2\t5\t김예시'), [{ grade: 2, ban: 1, num: 7, name: '홍길동' }, { grade: 3, ban: 2, num: 5, name: '김예시' }]);
  assert.deepEqual(parseRoster('1\t7\t홍길동'), [{ grade: 0, ban: 1, num: 7, name: '홍길동' }]);
  assert.deepEqual(parseRoster('3, 12, 이서윤'), [{ grade: 0, ban: 3, num: 12, name: '이서윤' }]);
  assert.deepEqual(parseRoster('2 1 2 박하준'), [{ grade: 2, ban: 1, num: 2, name: '박하준' }]);
  assert.deepEqual(parseRoster('8 최민'), [{ grade: 0, ban: 0, num: 8, name: '최민' }]);
  assert.deepEqual(parseRoster('정우진\n\n  \n한소희'), [{ grade: 0, ban: 0, num: 0, name: '정우진' }, { grade: 0, ban: 0, num: 0, name: '한소희' }]);
  // 이름이 숫자로만 되어 있어도 마지막 칸은 이름으로 남긴다
  assert.deepEqual(parseRoster('1\t2\t3\t4\t007'), [{ grade: 1, ban: 2, num: 3, name: '4 007' }]);
  assert.equal(parseRoster('아주아주아주아주긴이름입니다')[0].name.length, 10);   // 이름은 10자까지
});

test('학생 정렬: 학년·반·번호, 이름, 열매 많은 순', () => {
  const l = [{ id: 'a', grade: 1, ban: 2, num: 1, name: '나' }, { id: 'b', grade: 1, ban: 1, num: 2, name: '가' }, { id: 'c', grade: 1, ban: 1, num: 1, name: '다' }];
  assert.deepEqual(sortStudents(l, 'num').map(s => s.id), ['c', 'b', 'a']);
  const two = [...l, { id: 'z', grade: 2, ban: 1, num: 1, name: '하' }, { id: 'y', grade: 0.5, ban: 9, num: 9, name: '파' }];
  assert.deepEqual(sortStudents(two, 'num').map(s => s.id), ['y', 'c', 'b', 'a', 'z']);
  assert.deepEqual(sortStudents(l, 'name').map(s => s.id), ['b', 'a', 'c']);
  const n = { a: 5, b: 0, c: 2 };
  assert.deepEqual(sortStudents(l, 'fruits', id => n[id]).map(s => s.id), ['a', 'c', 'b']);
});

test('한 학생의 열매만, 날짜순으로', () => {
  const sep = { q2: { sid: 's1', date: '2026-09-20', text: 'b' }, q1: { sid: 's1', date: '2026-09-02', text: 'a' }, q3: { sid: 's2', date: '2026-09-01', text: 'x' } };
  const oct = { q4: { sid: 's1', date: '2026-10-01', text: 'c' } };
  assert.deepEqual(fruitsOf(sep, 's1').map(f => f.id), ['q1', 'q2']);
  assert.deepEqual(fruitsOf(undefined, 's1'), []);
  assert.deepEqual(fruitsAcross({ '2026-10': oct, '2026-09': sep }, 's1').map(f => f.text), ['a', 'b', 'c']);
});

test('명단 지도에 빠진 칸이 있어도 배열로 만든다 — 학년을 넣기 전 명단은 1학년', () => {
  assert.deepEqual(studentList({ s1: { name: '가' } }), [{ id: 's1', grade: 1, ban: 1, num: 0, name: '가', hidden: false }]);
});

test('학년 목록과 그 학년의 반 목록', () => {
  const l = studentList({ a: { grade: 2, ban: 3 }, b: { grade: 1, ban: 2 }, c: { grade: 2, ban: 1 }, d: { ban: 5 } });
  assert.deepEqual(gradesOf(l), [1, 2]);
  assert.deepEqual(bansOf(l, 2), [1, 3]);
  assert.deepEqual(bansOf(l, 1), [2, 5]);
  assert.deepEqual(bansOf(l, 'all'), [1, 2, 3, 5]);
  assert.equal(real(l[0]), '2학년 3반 0번 ');
});

test('링크 열쇠는 헷갈리는 글자 없이 정한 길이', () => {
  const k = randKey(24);
  assert.equal(k.length, 24);
  assert.match(k, /^[A-HJ-NP-Za-km-z2-9]+$/);
  assert.notEqual(randKey(24), k);
});

test('저장된 설정이 일부만 있어도 기본값으로 채운다', () => {
  const s = withDefaults({ season: 'winter' });
  assert.equal(s.season, 'winter');
  assert.equal(s.open, true);
  assert.equal(s.review, false);
});
