// 교사 화면 (admin.html?k=교사키): 검토 · 열린 열매 · 보류 · 기록 · 설정
import { $, esc, fmt, today, monthOf, mLabel, monthsSoFar, schoolYearOf, param, real, studentList, sortStudents, gradesOf, GRADES, isGrade,
  parseRoster, withDefaults, DEFAULT_TITLE, toast, fatal, errorText, copyText, randKey, typingIn, keepFocus } from './common.js';
import { treeSVG, SEASONS, FRUITS } from './tree-draw.js';
import * as store from './store.js';
import { HEAD, recordRows, postSheet, upsertOp, removeOp, sheetNameOf, appsScript, downloadXlsx, SCRIPT_VERSION } from './records.js';

const app = $('#app');
const NOW = today(), CUR = monthOf(NOW), SY = schoolYearOf(NOW);
const TABS = [['pending', '검토 대기'], ['approved', '열린 열매'], ['held', '보류'], ['record', '기록'], ['settings', '설정']];
const S = {
  k: param('k'), c: '', cfg: null, inbox: [], forests: {}, months: monthsSoFar(NOW),
  tab: TABS.some(([t]) => '#' + t === location.hash) ? location.hash.slice(1) : 'pending',
  apprMonth: CUR, apprFilter: '', apprGrade: 0, recMonth: '', recGrade: 0, pasteGrade: 0,
  drafts: {}, paste: '', direct: { sid: '', text: '' }, confirm: null, busy: new Set(), deferred: false,
  sheet: null, sheetDraft: null, sheetError: '', lastSync: null
};

/* ───── 자주 쓰는 것 ───── */
const st = () => withDefaults(S.cfg.settings);
const studentsMap = () => S.cfg.students || {};
const stu = id => { const s = studentsMap()[id]; return s ? { id, grade: 1, ban: 1, num: 0, hidden: false, ...s } : null; };
const allFruits = () => Object.values(S.forests).flatMap(fr => Object.entries(fr).map(([id, f]) => ({ id, ...f })));
const findFruit = id => { for (const fr of Object.values(S.forests)) if (fr[id]) return { id, ...fr[id] }; return null; };
const sheetOn = () => !!S.sheet?.url;
/** 연결은 됐지만 시트 코드가 예전 판이면 보내지 않는다(칸이 어긋나 적힌다). 바뀐 것은 sheetDirty 로 쌓아 둔다. */
const sheetOk = () => sheetOn() && S.sheet.version === SCRIPT_VERSION;
const grades = () => gradesOf(studentList(studentsMap()));
const gradeOptions = (sel, allLabel) => `<option value="0">${allLabel}</option>` + grades().map(g => `<option value="${g}" ${g === sel ? 'selected' : ''}>${g}학년</option>`).join('');
const gradeFilter = (id, sel) => grades().length > 1 ? `<div class="field"><label for="${id}">학년</label><select id="${id}">${gradeOptions(sel, '모든 학년')}</select></div>` : '';
const pageLink = (page, q) => new URL(`${page}?${q}`, location.href).href;
const links = () => {
  const l = { ask: pageLink('ask.html', 'c=' + S.c), tree: pageLink('tree.html', 'c=' + S.c), admin: pageLink('admin.html', 'k=' + S.k) };
  for (const g of grades()) { l['ask-' + g] = pageLink('ask.html', `c=${S.c}&g=${g}`); l['tree-' + g] = pageLink('tree.html', `c=${S.c}&g=${g}`); }
  return l;
};
/** 학년이 없는 붙여넣기 줄의 학년: 고른 값, 없으면 명단의 첫 학년, 그것도 없으면 1학년. */
const pasteGrade = () => S.pasteGrade || grades().find(isGrade) || 1;
const empty = (t, d) => `<div class="empty"><b>${t}</b><p class="muted">${d}</p></div>`;
const busy = id => S.busy.has(id) ? 'disabled' : '';
const studentOptions = (sel = '') => sortStudents(studentList(studentsMap()).filter(s => !s.hidden), 'num')
  .map(s => `<option value="${esc(s.id)}" ${s.id === sel ? 'selected' : ''}>${esc(real(s))}</option>`).join('');
const monthOptions = (sel, allLabel) => `<option value="">${allLabel}</option>` + S.months.slice().reverse()
  .map(m => `<option value="${m}" ${m === sel ? 'selected' : ''}>${mLabel(m)}${m === CUR ? ' (이번 달)' : ''}</option>`).join('');

/* ───── 그리기 ───── */
function render() {
  if (!S.cfg) return;
  S.deferred = false;
  keepFocus(app, () => { app.innerHTML = view(); });
}
/** 실시간 갱신은 입력 중이면 미룬다. 미루지 않으면 쓰던 글자가 날아간다. */
function requestRender() {
  if (typingIn(app)) { S.deferred = true; return; }
  render();
}

function view() {
  document.title = `교사 검토 · ${st().title}`;
  const n = { pending: S.inbox.filter(q => q.status === 'pending').length, approved: allFruits().length, held: S.inbox.filter(q => q.status === 'held').length };
  let h = `<div class="row-between"><div><div class="kicker">교사 전용 · ${esc(st().title)}</div><h1 class="title">질문 검토</h1></div><p class="muted small">이 링크는 학생에게 알려 주지 마세요.</p></div>
    <div class="subtabs" role="tablist">${TABS.map(([t, l]) => `<button type="button" class="subtab" role="tab" id="tab-${t}" aria-selected="${S.tab === t}" data-act="tab" data-id="${t}">${l}${t in n ? `<span class="num${t === 'pending' && n[t] ? ' hot' : ''}">${n[t]}</span>` : ''}</button>`).join('')}</div>`;
  return h + { pending: pendingView, approved: approvedView, held: heldView, record: recordView, settings: settingsView }[S.tab]();
}

function pendingView() {
  const list = S.inbox.filter(q => q.status === 'pending').sort((a, b) => a.date.localeCompare(b.date));
  if (!list.length) return empty('검토할 질문이 없습니다', '학생이 질문을 보내면 여기에 차례로 쌓입니다.');
  let h = `<div class="row-between"><p class="muted">맞춤법을 다듬어 승인할 수 있습니다. 승인하면 질문한 달의 나무에 열매가 열리고 기록에 한 줄이 남습니다.</p>${list.length > 1 ? '<button type="button" class="ghost" data-act="approve-all">모두 승인</button>' : ''}</div><div class="cards">`;
  for (const q of list) {
    const d = S.drafts[q.id] || {};
    h += `<article class="q-card"><div class="q-meta"><b>${esc(real(stu(q.sid)))}</b>${q.topic ? `<span class="chip">${esc(q.topic)}</span>` : ''}<time>${fmt(q.date)}</time></div>
      <label class="sr" for="edit-${q.id}">질문 내용</label><textarea id="edit-${q.id}" rows="2" maxlength="200">${esc(d.text ?? q.text)}</textarea>
      <div class="field"><label for="tnote-${q.id}">선생님 한마디 <span class="lbl-note">(선택 · 열매를 열면 함께 보여요)</span></label><input id="tnote-${q.id}" maxlength="60" value="${esc(d.note ?? q.note ?? '')}" placeholder="예: 원인과 결과를 나눠 생각한 좋은 질문!" autocomplete="off"></div>
      <div class="btns"><button type="button" class="primary" data-act="approve" data-id="${q.id}" ${busy(q.id)}>승인하고 열매 달기</button><button type="button" class="ghost" data-act="approve-star" data-id="${q.id}" ${busy(q.id)}>빛나는 질문으로 승인</button><button type="button" class="ghost" data-act="hold" data-id="${q.id}" ${busy(q.id)}>보류</button></div></article>`;
  }
  return h + '</div>';
}

function approvedView() {
  const f = S.apprFilter, m = S.apprMonth, g = S.apprGrade;
  const list = allFruits().filter(x => (!f || x.sid === f) && (!m || monthOf(x.date) === m) && (!g || (stu(x.sid)?.grade ?? 1) === g))
    .sort((a, b) => b.date.localeCompare(a.date) || String(b.approved).localeCompare(String(a.approved)));
  let h = `<form class="direct" id="direct-form"><div class="field who-pick"><label for="direct-student">학생</label><select id="direct-student"><option value="">학생 고르기</option>${studentOptions(S.direct.sid)}</select></div>
    <div class="field grow"><label for="direct-text">수업 중에 말로 한 질문</label><input id="direct-text" maxlength="200" value="${esc(S.direct.text)}" placeholder="선생님이 들은 질문을 바로 이번 달 열매로 달 수 있습니다" autocomplete="off"></div>
    <button class="primary" type="submit" ${busy('direct')}>바로 열매 달기</button></form>
    <div class="row-between"><div class="filters"><div class="field"><label for="appr-month">달</label><select id="appr-month">${monthOptions(m, `${SY}학년도 전체`)}</select></div>${gradeFilter('appr-grade', g)}<div class="field"><label for="appr-filter">학생</label><select id="appr-filter"><option value="">모든 학생</option>${studentOptions(f)}</select></div></div><p class="muted">열매 ${list.length}개</p></div>`;
  if (!list.length) return h + empty('이 조건에 맞는 열매가 없습니다', '검토 대기에서 질문을 승인하면 여기에 모입니다.');
  return h + `<div class="q-list">${list.map(x => `<div class="q-row"><div class="q-row-main"><div class="q-meta"><b>${esc(real(stu(x.sid)))}</b>${x.topic ? `<span class="chip">${esc(x.topic)}</span>` : ''}<time>${fmt(x.date)}</time>${x.star ? '<span class="chip gold">빛나는 질문</span>' : ''}</div><p>${esc(x.text)}</p>${x.note ? `<p class="tnote">한마디 · ${esc(x.note)}</p>` : ''}</div>
    <div class="q-row-acts"><button type="button" class="ghost sm${x.star ? ' on' : ''}" aria-pressed="${!!x.star}" data-act="star" data-id="${x.id}" ${busy(x.id)}>${x.star ? '★ 빛나는 질문' : '☆ 빛나는 질문'}</button><button type="button" class="ghost sm" data-act="unapprove" data-id="${x.id}" ${busy(x.id)}>열매 떼기</button></div></div>`).join('')}</div>`;
}

function heldView() {
  const list = S.inbox.filter(q => q.status === 'held').sort((a, b) => b.date.localeCompare(a.date));
  if (!list.length) return empty('보류한 질문이 없습니다', '보류한 질문은 학생에게 알리지 않고 여기에만 남습니다. 기록에도 올라가지 않습니다.');
  return `<p class="muted">학생에게는 보이지 않습니다. 다시 검토하거나 지울 수 있습니다.</p><div class="q-list">${list.map(q => {
    const c = S.confirm === 'delq:' + q.id;
    return `<div class="q-row"><div class="q-row-main"><div class="q-meta"><b>${esc(real(stu(q.sid)))}</b><time>${fmt(q.date)}</time></div><p>${esc(q.text)}</p></div><div class="q-row-acts"><button type="button" class="ghost sm" data-act="reopen" data-id="${q.id}" ${busy(q.id)}>다시 검토</button><button type="button" class="ghost sm${c ? ' danger' : ''}" data-act="delq" data-id="${q.id}" ${busy(q.id)}>${c ? '정말 지우기' : '지우기'}</button></div></div>`;
  }).join('')}</div>`;
}

const SHEET_ICON = '<svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true"><rect x="3" y="2" width="16" height="18" rx="2" fill="none" stroke="#356f44" stroke-width="1.6"/><path d="M3 8h16M3 14h16M9 8v12" stroke="#356f44" stroke-width="1.6"/></svg>';
function sheetCard() {
  if (S.sheetDraft) {
    return `<div class="sheet-card"><div class="sheet-ico">${SHEET_ICON}</div><div class="sheet-body">
      <div class="st">구글 시트 연결하기</div>
      <ol>
        <li>구글 드라이브에서 새 스프레드시트를 만들고, 메뉴의 <b>확장 프로그램 → Apps Script</b>를 엽니다.</li>
        <li>원래 있던 글을 모두 지우고 아래 코드를 통째로 붙여 넣은 뒤 저장합니다. <button type="button" class="link-btn" data-act="sheet-copy">코드 복사</button></li>
        <li><b>배포 → 새 배포</b>에서 유형을 <b>웹 앱</b>으로 고르고, 실행 사용자 <b>나</b>, 액세스 권한 <b>모든 사용자</b>로 배포합니다. 권한 허용을 물으면 허용합니다.</li>
        <li>나온 <b>웹 앱 URL</b>을 아래에 붙여 넣고 연결을 누릅니다.</li>
      </ol>
      <label class="sr" for="sheet-code">Apps Script 코드</label><textarea id="sheet-code" class="code-box" readonly>${esc(appsScript(S.sheetDraft.token))}</textarea>
      <div class="field"><label for="sheet-url">웹 앱 URL</label><input id="sheet-url" value="${esc(S.sheetDraft.url)}" placeholder="https://script.google.com/macros/s/…/exec" autocomplete="off"></div>
      </div><div class="acts"><button type="button" class="primary" data-act="sheet-test" ${busy('sheet')}>${S.busy.has('sheet') ? '확인하는 중…' : '연결'}</button><button type="button" class="ghost sm" data-act="sheet-cancel">그만두기</button></div></div>`;
  }
  if (sheetOn() && !sheetOk()) {
    return `<div class="sheet-card bad"><div class="sheet-ico">${SHEET_ICON}</div><div class="sheet-body">
      <div class="st"><i></i>시트 코드를 새로 붙여 넣어야 합니다</div>
      <p class="muted small">기록 표에 '학년' 칸이 생겨서, 예전에 붙여 넣은 코드로는 칸이 어긋나게 적힙니다. 그래서 시트로 보내기를 멈춰 두었습니다. 그동안 바뀐 것은 모아 두었다가, 다시 연결하면 올해 탭을 새로 씁니다.</p></div>
      <div class="acts"><button type="button" class="primary" data-act="sheet-start">새 코드로 다시 연결</button></div></div>`;
  }
  if (sheetOn()) {
    const bad = !!S.sheetError, off = S.confirm === 'sheet-off';
    return `<div class="sheet-card${bad ? ' bad' : ''}"><div class="sheet-ico">${SHEET_ICON}</div><div class="sheet-body">
      <div class="st"><i></i>${bad ? '구글 시트에 기록하지 못한 줄이 있습니다' : '구글 시트에 자동 기록 중'}</div>
      <p class="muted small">${bad ? esc(S.sheetError) + ' 다음에 교사 화면을 열 때 다시 보냅니다.' : (S.lastSync ? `마지막 기록 ${S.lastSync.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} · ` : '') + `승인하거나 고칠 때마다 '${SY}학년도' 탭의 같은 줄이 바뀝니다.`}</p></div>
      <div class="acts"><button type="button" class="ghost sm" data-act="resync" ${busy('sheet')}>올해 탭 다시 쓰기</button><button type="button" class="ghost sm${off ? ' danger' : ''}" data-act="sheet-off" ${busy('sheet')}>${off ? '정말 연결 끊기' : '연결 끊기'}</button></div></div>`;
  }
  return `<div class="sheet-card off"><div class="sheet-ico">${SHEET_ICON}</div><div class="sheet-body"><div class="st"><i></i>구글 시트에 연결되어 있지 않습니다</div>
    <p class="muted small">연결하면 승인할 때마다 시트에 한 줄씩 자동으로 쌓입니다. 엑셀 내려받기는 연결 없이도 됩니다.</p></div>
    <div class="acts"><button type="button" class="ghost" data-act="sheet-start">구글 시트 연결</button></div></div>`;
}

function recordView() {
  const m = S.recMonth, g = S.recGrade, rows = recordRows(S.forests, studentsMap(), m, g);
  return `${sheetCard()}
    <div class="row-between"><div class="filters"><div class="field"><label for="rec-month">기간</label><select id="rec-month">${monthOptions(m, `${SY}학년도 전체`)}</select></div>${gradeFilter('rec-grade', g)}</div>
      <button type="button" class="primary" data-act="xlsx" ${busy('xlsx') || (rows.length ? '' : 'disabled')}>엑셀 파일로 내려받기</button></div>
    <p class="muted small">아래 표가 내려받는 파일과 시트에 그대로 들어갑니다. ${g ? g + '학년 ' : ''}${m ? mLabel(m) : '올해'} 열매 ${rows.length}개. 지난 학년도 기록은 그해에 내려받은 파일이나 시트의 그 학년도 탭에 있습니다.</p>
    ${rows.length ? `<div class="rec-wrap"><table class="rec"><thead><tr>${HEAD.map(t => `<th>${t}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map((v, i) => `<td class="${HEAD[i] === '질문' ? 'q' : HEAD[i] === '선생님 한마디' ? 'w' : 'n'}">${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
      : empty('이 기간에는 열매가 없습니다', '다른 달을 골라 보세요.')}`;
}

function settingsView() {
  const s = st(), u = links();
  const counts = new Map();
  allFruits().forEach(f => counts.set(f.sid, (counts.get(f.sid) || 0) + 1));
  const rows = sortStudents(studentList(studentsMap()), 'num').map(x => {
    const n = counts.get(x.id) || 0, c = S.confirm === 'dels:' + x.id;
    return `<tr class="${x.hidden ? 'is-hidden' : ''}"><td><input class="num-in" type="number" id="stu-grade-${x.id}" min="1" max="${GRADES.length}" value="${x.grade}" aria-label="${esc(x.name)} 학년"></td><td><input class="num-in" type="number" id="stu-ban-${x.id}" min="1" max="30" value="${x.ban}" aria-label="${esc(x.name)} 반"></td><td><input class="num-in" type="number" id="stu-num-${x.id}" min="1" max="99" value="${x.num}" aria-label="${esc(x.name)} 번호"></td><td><input id="stu-name-${x.id}" maxlength="10" value="${esc(x.name)}" aria-label="이름" autocomplete="off"></td><td class="c">${n}</td><td class="c"><input type="checkbox" id="stu-hide-${x.id}" ${x.hidden ? 'checked' : ''} aria-label="${esc(x.name)} 숨기기"></td><td><button type="button" class="link-btn${c ? ' danger' : ''}" data-act="dels" data-id="${x.id}" ${busy(x.id)}>${c ? (n ? `열매 ${n}개도 지워집니다. 지우기` : '정말 지우기') : '지우기'}</button></td></tr>`;
  }).join('');
  const radio = (name, map) => Object.entries(map).map(([k, v]) => `<label class="chip-radio"><input type="radio" name="${name}" id="${name}-${k}" value="${k}" ${s[name] === k ? 'checked' : ''}><span>${v.name}</span></label>`).join('');
  const linkRow = (k, label, url, cls = '') => `<div class="link-row ${cls}"><span>${label}</span><code>${esc(url)}</code><button type="button" class="ghost sm" data-act="copy" data-id="${k}">복사</button></div>`;
  const sample = [{ id: 'a', text: '' }, { id: 'b', text: '', star: true }, { id: 'c', text: '' }];
  return `
  <section class="set-sec"><h2>학생 명단</h2>
    <p class="muted">이름을 고치면 그 학생의 나무와 열매, 기록이 그대로 따라갑니다. 숨기기는 전학 간 학생처럼 화면에서만 빼 둘 때 씁니다. 열매 수는 ${SY}학년도 전체입니다.</p>
    ${rows ? `<div class="tbl-wrap"><table class="roster"><thead><tr><th>학년</th><th>반</th><th>번호</th><th>이름</th><th class="c">열매</th><th class="c">숨김</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="muted">아직 학생이 없습니다. 아래에 붙여 넣어 등록하세요.</p>'}
    <div class="paste"><div class="field"><label for="paste-box">한꺼번에 추가 <span class="lbl-note">엑셀이나 나이스에서 학년·반·번호·이름 네 칸(또는 반·번호·이름 세 칸)을 복사해 붙여 넣으세요. 이름만 넣어도 됩니다.</span></label><textarea id="paste-box" rows="4" placeholder="1&#9;7&#9;홍길동&#10;2&#9;5&#9;김예시">${esc(S.paste)}</textarea></div><div class="field" style="flex:0 0 130px"><label for="paste-grade">학년이 없는 줄</label><select id="paste-grade">${GRADES.map(n => `<option value="${n}" ${n === pasteGrade() ? 'selected' : ''}>${n}학년</option>`).join('')}</select></div><button type="button" class="primary" data-act="paste" ${busy('paste')}>명단에 추가</button></div>
  </section>
  <section class="set-sec"><h2>화면 조절</h2>
    <div class="set-grid"><div class="set-controls">
      <div class="field"><label for="set-title">질문나무 제목</label><input id="set-title" maxlength="30" value="${esc(s.title)}" autocomplete="off"></div>
      <fieldset><legend>계절</legend><div class="chips">${radio('season', SEASONS)}</div></fieldset>
      <fieldset><legend>열매 모양</legend><div class="chips">${radio('fruit', FRUITS)}</div></fieldset>
      <div class="field"><label for="set-perRow">한 줄에 나무 몇 그루</label><div class="range-row"><input type="range" id="set-perRow" min="2" max="6" value="${s.perRow}"><output id="perrow-out" for="set-perRow">${s.perRow}</output></div></div>
      <div class="field"><label for="set-sort">나무 순서</label><select id="set-sort"><option value="num" ${s.sort === 'num' ? 'selected' : ''}>반·번호 순</option><option value="name" ${s.sort === 'name' ? 'selected' : ''}>이름 순</option><option value="fruits" ${s.sort === 'fruits' ? 'selected' : ''}>열매 많은 순</option></select></div>
      <div class="toggles">
        <label class="toggle"><input type="checkbox" id="set-open" ${s.open ? 'checked' : ''}> 질문 받기 <span class="muted small">(끄면 등록 화면이 닫힙니다)</span></label>
        <label class="toggle"><input type="checkbox" id="set-review" ${s.review ? 'checked' : ''}> 한 해 돌아보기 열기 <span class="muted small">(연말에 켜세요)</span></label>
        <label class="toggle"><input type="checkbox" id="set-mask" ${s.mask ? 'checked' : ''}> 질문나무에서 이름 가운데 가리기 (김*늘)</label>
        <label class="toggle"><input type="checkbox" id="set-showDate" ${s.showDate ? 'checked' : ''}> 열매 쪽지에 질문한 날짜 보이기</label>
      </div>
    </div>
    <figure class="mini" style="--sky:${SEASONS[s.season]?.sky}">${treeSVG('preview', sample, { season: s.season, fruit: s.fruit })}<figcaption>바꾸는 대로 질문나무에 바로 적용됩니다</figcaption></figure></div>
  </section>
  <section class="set-sec"><h2>링크</h2>
    <div class="links">${linkRow('ask', '학생 · 질문 등록', u.ask)}${linkRow('tree', '학생 · 질문나무', u.tree)}${linkRow('admin', '교사 · 검토', u.admin, 'admin')}</div>
    ${grades().length > 1 ? `<details><summary class="muted small">학년별 링크 (그 학년이 먼저 골라진 채 열립니다)</summary><div class="links" style="margin-top:10px">${grades().map(g => linkRow('ask-' + g, `${g}학년 · 질문 등록`, u['ask-' + g]) + linkRow('tree-' + g, `${g}학년 · 질문나무`, u['tree-' + g])).join('')}</div></details>` : ''}
    <div class="row-between"><p class="muted small">교사 링크가 새어 나갔다면 새로 만드세요. 학생 링크는 바뀌지 않습니다.</p><button type="button" class="ghost${S.confirm === 'rekey' ? ' danger' : ''}" data-act="rekey" ${busy('rekey')}>${S.confirm === 'rekey' ? '예전 교사 링크를 막고 새로 만들기' : '교사 링크 새로 만들기'}</button></div>
  </section>`;
}

/* ───── 시트로 보내기 ───── */
async function syncOps(ops, cleanIds = []) {
  if (!sheetOk() || !ops.length) return;
  try {
    await postSheet(S.sheet.url, { token: S.sheet.token, ops });
    S.lastSync = new Date(); S.sheetError = '';
    await store.markClean(S.c, cleanIds);
  } catch (e) {
    S.sheetError = e.message;
    toast('시트에 기록하지 못했습니다. 기록 탭을 확인해 주세요.');
  }
  requestRender();
}
/** 지난번에 못 보낸 줄들을 다시 보낸다. */
async function flushSheet() {
  if (!sheetOk()) return;
  let list;
  try { list = await store.dirtyQuestions(S.c); } catch { return; }
  if (!list.length) return;
  await syncOps(list.map(q => q.status === 'approved' ? upsertOp(q.id, q, stu(q.sid)) : removeOp(q.id, q.date)), list.map(q => q.id));
}
async function replaceThisYear() {
  const rows = recordRows(S.forests, studentsMap());
  await postSheet(S.sheet.url, { token: S.sheet.token, action: 'replaceAll', sheet: `${SY}학년도`, rows });
  S.lastSync = new Date(); S.sheetError = '';
  return rows.length;
}

/* ───── 동작 ───── */
/** 버튼 하나의 일. 도는 동안 같은 버튼을 다시 못 누르게 하고, 오류는 알림으로. */
async function run(key, fn) {
  if (S.busy.has(key)) return;
  S.busy.add(key); render();
  try { await fn(); }
  catch (e) { toast(errorText(e)); }
  finally { S.busy.delete(key); render(); }
}
const treeAction = { label: '질문나무 보기', fn: () => window.open(links().tree, '_blank', 'noopener') };

async function approveOne(q, star) {
  const d = S.drafts[q.id] || {};
  const text = String(d.text ?? q.text).trim();
  if (!text) throw new Error('질문 내용이 비어 있습니다.');
  const fruit = await store.approve(S.c, q, { text, note: String(d.note ?? q.note ?? '').trim(), star: star || !!q.star }, sheetOn());
  delete S.drafts[q.id];
  return upsertOp(q.id, fruit, stu(q.sid));
}

const actions = {
  tab(id) { S.tab = id; history.replaceState(null, '', location.pathname + location.search + '#' + id); },

  approve(id, star = false) {
    const q = S.inbox.find(x => x.id === id);
    if (!q) return;
    run(id, async () => {
      const op = await approveOne(q, star);
      const s = stu(q.sid);
      toast(`${s ? s.name + '의 ' : ''}${mLabel(monthOf(q.date))} 나무에 ${star ? '빛나는 ' : ''}열매가 열렸습니다`, treeAction);
      syncOps([op], [id]);
    });
  },
  'approve-star'(id) { actions.approve(id, true); },
  'approve-all'() {
    const list = S.inbox.filter(q => q.status === 'pending');
    run('all', async () => {
      const ops = [];
      for (const q of list) ops.push(await approveOne(q, false));
      toast(`${ops.length}개의 열매가 열렸습니다`, treeAction);
      syncOps(ops, list.map(q => q.id));
    });
  },
  hold(id) { run(id, async () => { await store.hold(S.c, id); toast('보류했습니다. 학생에게는 알리지 않습니다'); }); },
  reopen(id) { run(id, async () => { await store.reopen(S.c, id); toast('검토 대기로 옮겼습니다'); }); },
  delq(id) {
    if (S.confirm !== 'delq:' + id) { S.confirm = 'delq:' + id; return; }
    S.confirm = null;
    run(id, async () => { await store.deleteQuestion(S.c, id); toast('질문을 지웠습니다'); });
  },
  unapprove(id) {
    const f = findFruit(id);
    if (!f) return;
    run(id, async () => {
      await store.unapprove(S.c, id, f, sheetOn());
      toast('열매를 떼어 검토 대기로 돌렸습니다');
      syncOps([removeOp(id, f.date)], [id]);
    });
  },
  star(id) {
    const f = findFruit(id);
    if (!f) return;
    run(id, async () => {
      await store.setStar(S.c, id, f, !f.star, sheetOn());
      toast(f.star ? '빛나는 질문 표시를 뺐습니다' : '빛나는 질문으로 표시했습니다');
      syncOps([upsertOp(id, { ...f, star: !f.star }, stu(f.sid))], [id]);
    });
  },

  paste() {
    const got = parseRoster(S.paste);
    if (!got.length) return toast('넣을 이름을 찾지 못했습니다. 한 줄에 한 명씩 붙여 넣어 주세요');
    const have = studentList(studentsMap());
    const add = [], out = [];
    for (const g of got) {
      const grade = g.grade || pasteGrade(), ban = g.ban || 1;
      if (!isGrade(grade)) { out.push(g); continue; }
      const same = x => x.grade === grade && x.ban === ban;
      if ([...have, ...add].some(x => same(x) && x.name === g.name && (!g.num || x.num === g.num))) continue;
      const num = g.num || Math.max(0, ...[...have, ...add].filter(same).map(x => x.num)) + 1;
      add.push({ id: 's' + randKey(10), grade, ban, num, name: g.name });
    }
    // 1~3학년이 아닌 줄은 넣지 않고 칸에 남겨 둔다. 고쳐서 다시 누를 수 있게.
    const outText = out.map(g => [g.grade, g.ban, g.num, g.name].join('\t')).join('\n');
    const outMsg = out.length ? ` ${out.length}명은 학년이 1~${GRADES.length}학년이 아니라 넣지 않았습니다(칸에 남겨 둠).` : '';
    if (!add.length) { S.paste = outText || S.paste; return toast(out.length ? outMsg.trim() : '붙여 넣은 학생이 모두 이미 명단에 있습니다'); }
    const skipped = got.length - add.length - out.length;
    run('paste', async () => {
      await store.addStudents(S.c, add);
      S.paste = outText;
      toast(`${add.length}명을 명단에 넣었습니다${skipped ? ` (이미 있는 ${skipped}명은 건너뜀)` : ''}.${outMsg}`);
    });
  },
  dels(id) {
    if (S.confirm !== 'dels:' + id) { S.confirm = 'dels:' + id; return; }
    S.confirm = null;
    const name = stu(id)?.name || '';
    run(id, async () => {
      // 시트는 보관용 기록이라 건드리지 않는다. 앱에서 지워도 이미 적힌 줄은 남는다.
      const gone = await store.deleteStudent(S.c, id, S.forests);
      toast(`${name} 학생과 질문 ${gone.length}개를 지웠습니다${sheetOn() ? '. 시트에 적힌 기록은 남습니다' : ''}`);
    });
  },

  copy(id) { copyText(links()[id], '링크를 복사했습니다'); },
  rekey() {
    if (S.confirm !== 'rekey') { S.confirm = 'rekey'; return; }
    S.confirm = null;
    run('rekey', async () => {
      const nk = await store.rekey(S.c, S.k);
      S.k = nk;
      history.replaceState(null, '', location.pathname + '?k=' + nk + location.hash);
      toast('새 교사 링크를 만들었습니다. 지금 주소창의 링크를 즐겨찾기에 저장해 두세요.');
    });
  },

  xlsx() {
    const rows = recordRows(S.forests, studentsMap(), S.recMonth, S.recGrade);
    run('xlsx', () => downloadXlsx(rows, `질문나무_${SY}학년도${S.recGrade ? '_' + S.recGrade + '학년' : ''}${S.recMonth ? '_' + mLabel(S.recMonth) : ''}.xlsx`));
  },
  'sheet-start'() { S.sheetDraft = { token: randKey(24), url: '' }; },
  'sheet-cancel'() { S.sheetDraft = null; },
  'sheet-copy'() { copyText(appsScript(S.sheetDraft.token), '코드를 복사했습니다. Apps Script 에 붙여 넣으세요.'); },
  'sheet-test'() {
    const url = S.sheetDraft.url.trim();
    if (!/^https:\/\/script\.google\.com\/.+\/exec$/.test(url)) return toast('https://script.google.com/… 으로 시작해 /exec 로 끝나는 웹 앱 URL을 붙여 넣어 주세요');
    run('sheet', async () => {
      const token = S.sheetDraft.token;
      const pong = await postSheet(url, { token, action: 'ping' });
      if (pong.version !== SCRIPT_VERSION) throw new Error('시트에 붙여 넣은 코드가 예전 판입니다. 위의 코드 복사로 새 코드를 받아 통째로 바꿔 붙여 넣고, 배포 관리 → 수정 → 새 버전으로 다시 배포해 주세요.');
      await store.saveSheet(S.c, { url, token, version: SCRIPT_VERSION });
      S.sheet = { url, token, version: SCRIPT_VERSION }; S.sheetDraft = null;
      const n = await replaceThisYear();
      toast(`시트에 연결했습니다. 올해 열매 ${n}개를 '${SY}학년도' 탭에 적었습니다.`);
    });
  },
  resync() {
    run('sheet', async () => { const n = await replaceThisYear(); toast(`'${SY}학년도' 탭을 원본 기준으로 다시 썼습니다 (${n}줄)`); });
  },
  'sheet-off'() {
    if (S.confirm !== 'sheet-off') { S.confirm = 'sheet-off'; return; }
    S.confirm = null;
    run('sheet', async () => { await store.clearSheet(S.c); S.sheet = null; S.sheetError = ''; toast('시트 연결을 끊었습니다. 이미 적힌 줄은 시트에 그대로 남습니다'); });
  }
};

app.addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (!b || b.disabled) return;
  const { act, id } = b.dataset;
  if (!['delq', 'dels', 'rekey', 'sheet-off'].includes(act)) S.confirm = null;
  actions[act]?.(id);
  render();
});
app.addEventListener('input', e => {
  const t = e.target;
  const m = t.id.match(/^(edit|tnote)-(.+)$/);
  if (m) (S.drafts[m[2]] ||= {})[m[1] === 'edit' ? 'text' : 'note'] = t.value;
  if (t.id === 'set-perRow') $('#perrow-out').textContent = t.value;
  if (t.id === 'paste-box') S.paste = t.value;
  if (t.id === 'direct-text') S.direct.text = t.value;
  if (t.id === 'sheet-url' && S.sheetDraft) S.sheetDraft.url = t.value;
});
app.addEventListener('change', e => {
  const t = e.target, id = t.id;
  const save = p => store.updateSettings(S.c, p).catch(err => toast(errorText(err)));
  if (id === 'appr-month') S.apprMonth = t.value;
  else if (id === 'appr-filter') S.apprFilter = t.value;
  else if (id === 'appr-grade') S.apprGrade = +t.value;
  else if (id === 'rec-grade') S.recGrade = +t.value;
  else if (id === 'paste-grade') { S.pasteGrade = +t.value; return; }
  else if (id === 'rec-month') S.recMonth = t.value;
  else if (id === 'direct-student') { S.direct.sid = t.value; return; }
  else if (t.name === 'season' || t.name === 'fruit') save({ [t.name]: t.value });
  else if (id === 'set-title') save({ title: t.value.trim() || DEFAULT_TITLE });
  else if (id === 'set-perRow') save({ perRow: +t.value });
  else if (id === 'set-sort') save({ sort: t.value });
  else if (['set-open', 'set-review', 'set-mask', 'set-showDate'].includes(id)) save({ [id.slice(4)]: t.checked });
  else if (id.startsWith('stu-')) {
    const [, field, sid] = id.split('-');
    const cur = stu(sid);
    if (!cur) return;
    let v;
    if (field === 'hide') v = t.checked;
    else if (field === 'name') { v = t.value.trim().slice(0, 10); if (!v) { t.value = cur.name; return; } }
    else {
      v = parseInt(t.value, 10);
      if (!(v >= 1) || (field === 'grade' && !isGrade(v))) { t.value = cur[field]; if (field === 'grade') toast(`학년은 1~${GRADES.length} 사이로 적어 주세요`); return; }
    }
    store.updateStudent(S.c, sid, field === 'hide' ? 'hidden' : field, v).catch(err => toast(errorText(err)));
    return;
  } else return;
  render();
});
app.addEventListener('submit', e => {
  e.preventDefault();
  if (e.target.id !== 'direct-form') return;
  const sid = S.direct.sid, text = S.direct.text.trim();
  if (!sid || !text) return toast('학생을 고르고 질문을 적어 주세요');
  run('direct', async () => {
    const r = await store.addApproved(S.c, { sid, text, date: NOW }, sheetOn());
    S.direct.text = '';
    toast(`${stu(sid)?.name || ''}의 ${mLabel(CUR)} 나무에 열매가 열렸습니다`, treeAction);
    syncOps([upsertOp(r.id, r, stu(sid))], [r.id]);
  });
});
app.addEventListener('focusout', e => {
  if (S.deferred && !(e.relatedTarget && app.contains(e.relatedTarget))) setTimeout(() => { if (S.deferred && !typingIn(app)) render(); });
});

/* ───── 시작 ───── */
async function boot() {
  if (!store.configured) return fatal(app, '아직 설치가 끝나지 않았습니다', 'Firebase 설정값을 js/firebase-config.js 에 붙여 넣어 주세요. 설치안내 4단계입니다.');
  if (!S.k) return fatal(app, '교사 링크로 들어와 주세요', '설치할 때 받은 admin.html?k=… 링크가 필요합니다.');
  try { S.c = await store.adminEnter(S.k); }
  catch (e) { return fatal(app, '교사 화면을 열지 못했습니다', errorText(e)); }
  if (!S.c) return fatal(app, '더 이상 쓸 수 없는 교사 링크입니다', '교사 링크를 새로 만들었다면 새 링크로 들어와 주세요. 링크를 잃어버렸다면 설치안내의 "교사 링크를 잃어버렸을 때"를 보세요.');
  try { S.sheet = await store.getSheet(S.c); } catch { S.sheet = null; }
  const onErr = e => toast(errorText(e));
  let first = true;
  store.watchConfig(S.c, cfg => {
    S.cfg = cfg || { settings: {}, students: {} };
    if (first) { first = false; render(); flushSheet(); } else requestRender();
  }, e => fatal(app, '불러오지 못했습니다', errorText(e)));
  store.watchInbox(S.c, list => { S.inbox = list; requestRender(); }, onErr);
  store.watchForests(S.c, S.months, f => { S.forests = f; requestRender(); }, onErr);
}
boot();
