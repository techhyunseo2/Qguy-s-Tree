// 기록: 엑셀 내려받기와 구글 시트로 보내기. 표의 모양은 HEAD 한 곳에서 정한다.
import { schoolYearOf, monthOf, mLabel, fmt } from './common.js';

export const HEAD = ['학년도', '월', '반', '번호', '이름', '질문', '수업', '질문한 날', '승인한 날', '선생님 한마디', '빛나는 질문', '질문 번호'];

/** 열매 하나 → 표 한 줄. 이름은 지금 명단에서 가져오므로 이름을 고치면 다음 기록부터 따라간다. */
export function toRow(id, f, student) {
  return [
    schoolYearOf(f.date), mLabel(monthOf(f.date)),
    student ? student.ban : '', student ? student.num : '', student ? student.name : '(지운 학생)',
    f.text, f.topic || '', fmt(f.date), f.approved ? fmt(f.approved) : '',
    f.note || '', f.star ? '★' : '', id
  ];
}

/** 여러 달의 숲 → 표 줄들. month 를 주면 그 달만. 날짜, 반, 번호 순. */
export function recordRows(forests, students, month = '') {
  const items = [];
  for (const [m, fruits] of Object.entries(forests || {})) {
    if (month && m !== month) continue;
    for (const [id, f] of Object.entries(fruits)) items.push({ id, f, s: students[f.sid] });
  }
  items.sort((a, b) => a.f.date.localeCompare(b.f.date)
    || (a.s?.ban ?? 99) - (b.s?.ban ?? 99) || (a.s?.num ?? 99) - (b.s?.num ?? 99) || a.id.localeCompare(b.id));
  return items.map(x => toRow(x.id, x.f, x.s));
}

/* ───────── 구글 시트 ───────── */

/**
 * 시트의 Apps Script 웹 앱으로 보낸다.
 * 머리글 없이 글만 보내면 브라우저가 사전 확인(preflight)을 하지 않아 Apps Script 가 받을 수 있다.
 */
export async function postSheet(url, body) {
  let res;
  try { res = await fetch(url, { method: 'POST', body: JSON.stringify(body) }); }
  catch { throw new Error('시트에 연결하지 못했습니다. 웹 앱 주소와 인터넷 연결을 확인해 주세요.'); }
  let data;
  try { data = await res.json(); }
  catch { throw new Error('시트가 알아들을 수 없는 답을 보냈습니다. 배포할 때 액세스 권한을 "모든 사용자"로 했는지 확인해 주세요.'); }
  if (!data.ok) throw new Error(data.error === 'token'
    ? '시트에 붙여 넣은 코드의 확인용 토큰이 다릅니다. 교사 화면에서 코드를 다시 복사해 붙여 넣어 주세요.'
    : '시트가 기록하지 못했습니다: ' + (data.error || '알 수 없는 이유'));
  return data;
}
/** 시트는 학년도마다 탭을 따로 쓴다. 새 학년도에 '다시 쓰기'를 해도 지난해 기록이 남는다. */
export const sheetNameOf = date => `${schoolYearOf(date)}학년도`;
export const upsertOp = (id, f, student) => ({ type: 'upsert', id, sheet: sheetNameOf(f.date), row: toRow(id, f, student) });
export const removeOp = (id, date) => ({ type: 'remove', id, sheet: sheetNameOf(date) });

/** 시트에 붙여 넣을 Apps Script. 토큰이 들어가 있어서 이 코드를 가진 시트만 기록을 받는다. */
export function appsScript(token) {
  return APPS_SCRIPT.replace('__TOKEN__', token).replace('__HEAD__', JSON.stringify(HEAD));
}
const APPS_SCRIPT = `// 질문나무 → 구글 시트 기록 (질문나무 교사 화면에서 복사한 코드)
// 이 코드는 고치지 말고 그대로 저장한 뒤 '웹 앱'으로 배포하세요.
const TOKEN = '__TOKEN__';
const DEFAULT_SHEET = '질문 기록';
const HEAD = __HEAD__;

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const body = JSON.parse(e.postData.contents);
    if (body.token !== TOKEN) return reply({ ok: false, error: 'token' });
    if (body.action === 'ping') return reply({ ok: true });
    if (body.action === 'replaceAll') {
      const sh = sheet_(body.sheet);
      sh.clearContents();
      sh.getRange(1, 1, 1, HEAD.length).setValues([HEAD]);
      const rows = (body.rows || []).map(clean_);
      if (rows.length) sh.getRange(2, 1, rows.length, HEAD.length).setValues(rows);
      return reply({ ok: true, count: rows.length });
    }
    const tabs = {};
    (body.ops || []).forEach(function (op) {
      const name = op.sheet || DEFAULT_SHEET;
      const sh = tabs[name] || (tabs[name] = sheet_(name));
      const at = findRow_(sh, op.id);
      if (op.type === 'remove') { if (at) sh.deleteRow(at); return; }
      const row = clean_(op.row);
      if (at) sh.getRange(at, 1, 1, HEAD.length).setValues([row]);
      else sh.appendRow(row);
    });
    return reply({ ok: true });
  } catch (err) {
    return reply({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function doGet() {
  return reply({ ok: true, message: '질문나무 기록용 웹 앱입니다. 주소를 교사 화면에 붙여 넣으세요.' });
}

function sheet_(name) {
  name = name || DEFAULT_SHEET;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(name) || ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, HEAD.length).setValues([HEAD]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function findRow_(sh, id) {
  const last = sh.getLastRow();
  if (last < 2) return 0;
  const hit = sh.getRange(2, HEAD.length, last - 1, 1)
    .createTextFinder(String(id)).matchEntireCell(true).findNext();
  return hit ? hit.getRow() : 0;
}

// '=' 로 시작하는 질문이 수식으로 바뀌지 않게 막는다.
function clean_(row) {
  return row.slice(0, HEAD.length).map(function (v) {
    return typeof v === 'string' && /^[=+\\-@]/.test(v) ? "'" + v : v;
  });
}

function reply(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
`;

/* ───────── 엑셀 ───────── */

const SHEETJS = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
function loadScript(src) {
  return new Promise((ok, no) => {
    if (window.XLSX) return ok();
    const s = document.createElement('script');
    s.src = src;
    s.onload = ok;
    s.onerror = () => no(new Error('엑셀 파일을 만드는 도구를 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.'));
    document.head.appendChild(s);
  });
}
export async function downloadXlsx(rows, filename) {
  await loadScript(SHEETJS);
  const XLSX = window.XLSX;
  const ws = XLSX.utils.aoa_to_sheet([HEAD, ...rows]);
  ws['!cols'] = [6, 5, 4, 5, 8, 50, 16, 12, 12, 30, 9, 22].map(wch => ({ wch }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '질문 기록');
  XLSX.writeFile(wb, filename);
}
