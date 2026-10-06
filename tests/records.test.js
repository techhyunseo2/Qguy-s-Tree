import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HEAD, toRow, recordRows, appsScript, upsertOp, removeOp, sheetNameOf, SCRIPT_VERSION } from '../js/records.js';

const students = { s1: { grade: 1, ban: 1, num: 2, name: '김하늘' }, s2: { grade: 2, ban: 1, num: 1, name: '최유나' } };
const ID = HEAD.indexOf('질문 번호');
const forests = {
  '2026-09': { qa: { sid: 's2', date: '2026-09-09', text: '역사 질문', topic: '역사', note: '', star: false, approved: '2026-09-10' } },
  '2026-10': {
    qb: { sid: 's1', date: '2026-10-02', text: '방정식 질문', topic: '수학', note: '좋아요', star: true, approved: '2026-10-03' },
    qc: { sid: 's2', date: '2026-10-01', text: '경제 질문', topic: '', note: '', star: false, approved: '2026-10-01' },
    qd: { sid: 'gone', date: '2026-10-02', text: '지운 학생 질문', topic: '', note: '', star: false }
  }
};

test('한 줄은 머리글과 칸 수가 같다', () => {
  const r = toRow('qb', forests['2026-10'].qb, students.s1);
  assert.equal(r.length, HEAD.length);
  assert.deepEqual(r, [2026, '10월', 1, 1, 2, '김하늘', '방정식 질문', '수학', '2026. 10. 2.', '2026. 10. 3.', '좋아요', '★', 'qb']);
  assert.equal(HEAD[2], '학년');
  // 학년을 넣기 전에 만든 학생은 1학년으로 적는다
  assert.equal(toRow('qb', forests['2026-10'].qb, { ban: 1, num: 2, name: 'x' })[2], 1);
});

test('지운 학생의 열매도 줄은 남는다', () => {
  const r = toRow('qd', forests['2026-10'].qd, undefined);
  assert.equal(r[HEAD.indexOf('이름')], '(지운 학생)');
  assert.equal(r[HEAD.indexOf('승인한 날')], '');
});

test('기록은 날짜, 학년, 반, 번호 순이고 달·학년으로 거를 수 있다', () => {
  assert.deepEqual(recordRows(forests, students).map(r => r[ID]), ['qa', 'qc', 'qb', 'qd']);
  assert.deepEqual(recordRows(forests, students, '2026-09').map(r => r[ID]), ['qa']);
  assert.deepEqual(recordRows(forests, students, '', 2).map(r => r[ID]), ['qa', 'qc']);
  assert.deepEqual(recordRows(forests, students, '2026-10', 1).map(r => r[ID]), ['qb']);
  // 같은 날이면 1학년이 2학년보다 먼저
  const sameDay = { '2026-10': { x: { ...forests['2026-10'].qc, date: '2026-10-02' }, y: { ...forests['2026-10'].qb } } };
  assert.deepEqual(recordRows(sameDay, students).map(r => r[ID]), ['y', 'x']);
  assert.deepEqual(recordRows({}, students), []);
});

test('시트는 학년도마다 탭을 나눈다', () => {
  assert.equal(sheetNameOf('2027-02-01'), '2026학년도');
  assert.equal(upsertOp('qb', forests['2026-10'].qb, students.s1).sheet, '2026학년도');
  assert.deepEqual(removeOp('qa', '2027-03-02'), { type: 'remove', id: 'qa', sheet: '2027학년도' });
});

test('Apps Script 코드: 토큰과 머리글이 들어가고, 문법이 맞다', () => {
  const code = appsScript('TOKEN123');
  assert.ok(code.includes("const TOKEN = 'TOKEN123';"));
  assert.ok(!code.includes('__TOKEN__') && !code.includes('__HEAD__') && !code.includes('__VERSION__'));
  assert.ok(code.includes(JSON.stringify(HEAD)));
  assert.doesNotThrow(() => new Function(code));
});

test('Apps Script 코드: 수식 주입을 막는다', () => {
  const clean = new Function(appsScript('t') + '; return clean_;')();
  assert.deepEqual(clean(['=1+1', '+a', '-b', '@c', '보통 질문', 2026, '', 'x', 'x', 'x', 'x', 'x', 'x']).slice(0, 7),
    ["'=1+1", "'+a", "'-b", "'@c", '보통 질문', 2026, '']);
});

test('Apps Script 코드: 줄 고치기·지우기·학년도 탭을 흉내 낸 시트에서 돌려 본다', () => {
  const sheets = {};
  const mkSheet = name => {
    const rows = [];
    return (sheets[name] = {
      rows,
      getLastRow: () => rows.length,
      getRange: (r, c, nr) => ({
        setValues(v) { v.forEach((row, i) => { rows[r - 1 + i] = row.slice(); }); return { setFontWeight() {} }; },
        createTextFinder(id) {
          return { matchEntireCell: () => ({ findNext() {
            for (let i = r - 1; i < r - 1 + nr; i++) if (String(rows[i][c - 1]) === id) return { getRow: () => i + 1 };
            return null;
          } }) };
        }
      }),
      appendRow: row => rows.push(row.slice()),
      deleteRow: n => rows.splice(n - 1, 1),
      clearContents: () => rows.splice(0),
      setFrozenRows() {}
    });
  };
  const env = {
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: n => sheets[n] || null, insertSheet: mkSheet }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: s => ({ setMimeType: () => JSON.parse(s) }) }
  };
  const doPost = new Function(...Object.keys(env), appsScript('T') + '; return doPost;')(...Object.values(env));
  const post = body => doPost({ postData: { contents: JSON.stringify(body) } });

  assert.deepEqual(post({ token: 'x', action: 'ping' }), { ok: false, error: 'token' });
  assert.deepEqual(post({ token: 'T', action: 'ping' }), { ok: true, version: SCRIPT_VERSION });

  const f = forests['2026-10'].qb;
  assert.equal(post({ token: 'T', ops: [upsertOp('qb', f, students.s1), upsertOp('qc', forests['2026-10'].qc, students.s2)] }).ok, true);
  const tab = sheets['2026학년도'];
  assert.equal(tab.rows.length, 3);                        // 머리글 + 2줄
  assert.deepEqual(tab.rows[0], HEAD);

  post({ token: 'T', ops: [upsertOp('qb', { ...f, text: '고친 질문' }, students.s1)] });
  assert.equal(tab.rows.length, 3);                        // 새 줄이 아니라 같은 줄이 바뀐다
  assert.equal(tab.rows[1][HEAD.indexOf('질문')], '고친 질문');

  post({ token: 'T', ops: [removeOp('qb', f.date)] });
  assert.deepEqual(tab.rows.map(r => r[ID]), ['질문 번호', 'qc']);

  post({ token: 'T', ops: [upsertOp('qn', { ...f, date: '2027-03-05' }, students.s1)] });
  assert.equal(sheets['2027학년도'].rows.length, 2);       // 새 학년도는 새 탭

  const res = post({ token: 'T', action: 'replaceAll', sheet: '2026학년도', rows: recordRows(forests, students) });
  assert.equal(res.count, 4);
  assert.equal(tab.rows.length, 5);
  assert.equal(sheets['2027학년도'].rows.length, 2);       // 다시 쓰기는 그 학년도 탭만 건드린다
});
