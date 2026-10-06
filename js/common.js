// 세 페이지가 함께 쓰는 작은 도구들. Firebase 에 기대지 않으므로 node 시험에서도 불러올 수 있다.

export const $ = (s, el = document) => el.querySelector(s);
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad2 = n => String(n).padStart(2, '0');

export const DEFAULT_TITLE = 'Q가이즈의 질문나무';
export const DEFAULT_SETTINGS = {
  title: DEFAULT_TITLE, season: 'spring', fruit: 'apple', perRow: 4, sort: 'num',
  mask: false, showDate: true, open: true, review: false
};
export const withDefaults = settings => ({ ...DEFAULT_SETTINGS, ...(settings || {}) });

/* ── 날짜. 날짜는 늘 'YYYY-MM-DD' 글자로 다룬다(기기 시간대 = 한국 시간). ── */
export const today = (d = new Date()) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
export const monthOf = d => d.slice(0, 7);
export const fmt = d => { const [y, m, dd] = d.split('-'); return `${y}. ${+m}. ${+dd}.`; };
export const mLabel = m => `${+m.slice(5, 7)}월`;

/** 학년도는 3월에 시작해 이듬해 2월에 끝난다. 2027-01 은 2026학년도. */
export function schoolYearOf(d) {
  const y = +d.slice(0, 4), m = +d.slice(5, 7);
  return m >= 3 ? y : y - 1;
}
/** 한 학년도의 열두 달: ['2026-03', …, '2027-02'] */
export function schoolMonths(sy) {
  const out = [];
  for (let i = 0; i < 12; i++) {
    const m = (i + 2) % 12 + 1;
    out.push(`${m >= 3 ? sy : sy + 1}-${pad2(m)}`);
  }
  return out;
}
/** 이번 학년도에서 지금까지 지나온 달(이번 달 포함). */
export function monthsSoFar(now = today()) {
  const cur = monthOf(now);
  return schoolMonths(schoolYearOf(now)).filter(m => m <= cur);
}

/* ── 학생 ── */
export const maskName = n => n.length <= 1 ? n : n.length === 2 ? n[0] + '*' : n[0] + '*'.repeat(n.length - 2) + n[n.length - 1];
export const real = s => s ? `${s.ban}반 ${s.num}번 ${s.name}` : '(지운 학생)';

/** 설정 문서의 students 지도 → 배열. 빠진 칸은 기본값으로 채운다. */
export const studentList = map => Object.entries(map || {}).map(([id, s]) => ({ id, ban: 1, num: 0, name: '', hidden: false, ...s }));

export function sortStudents(list, how, count = () => 0) {
  const l = list.slice();
  if (how === 'name') l.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  else if (how === 'fruits') l.sort((a, b) => count(b.id) - count(a.id) || a.ban - b.ban || a.num - b.num);
  else l.sort((a, b) => a.ban - b.ban || a.num - b.num);
  return l;
}

/** 붙여 넣은 명단 글 → [{ban, num, name}]. 한 줄에 한 명, 칸은 탭·쉼표·빈칸으로 나뉜다. */
export function parseRoster(text) {
  const out = [];
  for (const line of String(text).split(/\r?\n/)) {
    const l = line.trim();
    if (!l) continue;
    let p = l.split(/[\t,]+/).map(x => x.trim()).filter(Boolean);
    if (p.length === 1) p = l.split(/\s+/);
    let ban = 0, num = 0, name = '';
    if (p.length >= 3 && /^\d+$/.test(p[0]) && /^\d+$/.test(p[1])) { ban = +p[0]; num = +p[1]; name = p.slice(2).join(' '); }
    else if (p.length >= 2 && /^\d+$/.test(p[0])) { num = +p[0]; name = p.slice(1).join(' '); }
    else name = p.join(' ');
    name = name.replace(/\s+/g, ' ').slice(0, 10);
    if (name) out.push({ ban, num, name });
  }
  return out;
}

/* ── 열매 ── */
const byDate = (a, b) => a.date.localeCompare(b.date) || String(a.approved || '').localeCompare(String(b.approved || '')) || a.id.localeCompare(b.id);
/** 숲 문서의 fruits 지도에서 한 학생의 열매만 날짜순으로. */
export const fruitsOf = (fruits, sid) => Object.entries(fruits || {}).filter(([, f]) => f.sid === sid).map(([id, f]) => ({ id, ...f })).sort(byDate);
/** 여러 달의 숲 { '2026-09': fruits, … } → 한 학생의 열매 전부. */
export const fruitsAcross = (forests, sid) => Object.values(forests || {}).flatMap(f => fruitsOf(f, sid)).sort(byDate);

/* ── 그 밖 ── */
const KEY_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
/** 헷갈리는 글자(0 O 1 l I)를 뺀 무작위 문자열. 링크의 열쇠가 된다. */
export function randKey(n) {
  const v = crypto.getRandomValues(new Uint32Array(n));
  let s = '';
  for (const x of v) s += KEY_CHARS[x % KEY_CHARS.length];
  return s;
}

export const param = name => new URLSearchParams(location.search).get(name) || '';

/** Firebase 오류를 선생님이 알아들을 말로. */
export function errorText(e) {
  const code = String(e?.code || '');
  const msg = String(e?.message || e || '');
  if (code === 'permission-denied') return '권한이 없습니다. 링크가 정확한지, 보안 규칙을 게시했는지 확인해 주세요.';
  if (code === 'unavailable' || code === 'auth/network-request-failed') return '서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.';
  if (/auth\/(operation-not-allowed|admin-restricted-operation|configuration-not-found)/.test(code)) return 'Firebase 에서 익명 로그인이 꺼져 있습니다. 설치안내 3단계를 확인해 주세요.';
  if (/database.*(does not exist|not found)/i.test(msg) || code === 'not-found') return 'Firestore 데이터베이스가 아직 없습니다. 설치안내 2단계를 확인해 주세요.';
  return msg || '알 수 없는 오류가 났습니다.';
}

let toastTimer;
/** 화면 아래 알림. action 을 주면 단추가 붙는다. */
export function toast(msg, action) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.innerHTML = `<span>${esc(msg)}</span>${action ? '<button type="button">' + esc(action.label) + '</button>' : ''}`;
  t.hidden = false;
  if (action) t.querySelector('button').onclick = () => { t.hidden = true; action.fn(); };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, action ? 6000 : 4000);
}

/** 페이지를 쓸 수 없을 때 한가운데에 사정을 적는다. */
export function fatal(el, title, detail) {
  el.innerHTML = `<div class="fatal"><h1>${esc(title)}</h1><p>${esc(detail)}</p></div>`;
}

export async function copyText(text, okMsg = '복사했습니다') {
  try { await navigator.clipboard.writeText(text); toast(okMsg); }
  catch { toast('이 브라우저에서는 복사가 막혀 있습니다. 직접 선택해 복사해 주세요.'); }
}

/** 입력 중인 칸이 있는지. 있으면 실시간 갱신으로 화면을 다시 그리지 않는다(글자가 날아간다). */
export function typingIn(root) {
  const a = document.activeElement;
  if (!a || !root.contains(a)) return false;
  return a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || (a.tagName === 'INPUT' && !['checkbox', 'radio', 'range', 'button'].includes(a.type));
}

/** 다시 그린 뒤 초점·커서 자리를 되돌린다. */
export function keepFocus(root, draw) {
  const a = document.activeElement;
  const id = a && root.contains(a) ? a.id : '';
  const sel = id && 'selectionStart' in a ? [a.selectionStart, a.selectionEnd] : null;
  draw();
  if (!id) return;
  const el = document.getElementById(id);
  if (!el) return;
  el.focus({ preventScroll: true });
  if (sel) try { el.setSelectionRange(sel[0], sel[1]); } catch { /* 고를 수 없는 칸 */ }
}
