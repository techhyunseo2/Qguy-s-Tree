// 질문 등록 화면 (ask.html?c=반코드)
import { $, esc, today, param, studentList, sortStudents, gradesOf, bansOf, withDefaults, fatal, errorText, keepFocus, typingIn } from './common.js';
import { treeSVG } from './tree-draw.js';
import * as store from './store.js';

const app = $('#app');
const S = { c: param('c'), cfg: null, grade: +param('g') || 0, ban: 0, sid: '', topic: '', text: '', err: '', sent: false, sending: false, deferred: false };

function render() {
  S.deferred = false;
  keepFocus(app, () => { app.innerHTML = view(); });
}
function requestRender() {
  if (typingIn(app)) { S.deferred = true; return; }
  render();
}

function view() {
  const st = withDefaults(S.cfg.settings);
  document.title = `질문 남기기 · ${st.title}`;
  let h = `<div class="ask-card"><div><div class="kicker">${esc(st.title)}</div><h1 class="title">질문 남기기</h1><p class="muted">수업 시간에 떠오른 질문을 적어 주세요. 선생님이 확인하면 이번 달 내 나무에 열매가 열립니다.</p></div>`;
  if (!st.open) return h + `<div class="closed"><b>지금은 질문을 받지 않고 있어요.</b><p class="muted">선생님이 다시 열면 남길 수 있습니다.</p></div></div>`;
  if (S.sent) return h + `<div class="sent">${treeSVG('sent', [{ id: 'x', text: '' }], { season: st.season, fruit: st.fruit })}<p class="sent-t">질문을 보냈어요</p><p class="muted">선생님이 읽고 승인하면 질문나무에 열매로 열립니다.</p><button type="button" class="ghost" id="again">질문 하나 더 남기기</button></div></div>`;

  const all = studentList(S.cfg.students).filter(s => !s.hidden);
  if (!all.length) return h + `<div class="closed"><b>아직 학생 명단이 없어요.</b><p class="muted">선생님이 명단을 등록하면 이름을 고를 수 있습니다.</p></div></div>`;
  const grades = gradesOf(all);
  if (!grades.includes(S.grade)) S.grade = grades[0];
  const bans = bansOf(all, S.grade);
  if (!bans.includes(S.ban)) S.ban = bans[0];
  const mine = sortStudents(all.filter(s => s.grade === S.grade && s.ban === S.ban), 'num');
  if (S.sid && !mine.some(s => s.id === S.sid)) S.sid = '';
  h += `<form class="ask-form" id="ask-form" novalidate>
    <div class="ask-who">
      ${grades.length > 1 ? `<div class="field ban"><label for="ask-grade">학년</label><select id="ask-grade">${grades.map(g => `<option value="${g}" ${g === S.grade ? 'selected' : ''}>${g}학년</option>`).join('')}</select></div>` : ''}
      ${bans.length > 1 ? `<div class="field ban"><label for="ask-ban">반</label><select id="ask-ban">${bans.map(b => `<option value="${b}" ${b === S.ban ? 'selected' : ''}>${b}반</option>`).join('')}</select></div>` : ''}
      <div class="field grow"><label for="ask-student">이름</label><select id="ask-student"><option value="">이름을 고르세요</option>${mine.map(s => `<option value="${esc(s.id)}" ${s.id === S.sid ? 'selected' : ''}>${s.num}번 ${esc(s.name)}</option>`).join('')}</select></div>
    </div>
    <div class="field"><label for="ask-topic">어떤 수업에서? <span class="lbl-note">(선택)</span></label><input id="ask-topic" maxlength="30" value="${esc(S.topic)}" placeholder="예: 과학 · 지구와 달" autocomplete="off"></div>
    <div class="field"><label for="ask-text">질문</label><textarea id="ask-text" rows="4" maxlength="200" placeholder="궁금했던 것을 그대로 적어 보세요">${esc(S.text)}</textarea><div class="counter"><span id="ask-count">${S.text.length}</span> / 200</div></div>
    <p class="err" id="ask-err" role="alert" ${S.err ? '' : 'hidden'}>${esc(S.err)}</p>
    <button class="primary wide" type="submit" ${S.sending ? 'disabled' : ''}>${S.sending ? '보내는 중…' : '질문 보내기'}</button>
  </form></div>`;
  return h;
}

app.addEventListener('input', e => {
  if (e.target.id === 'ask-text') { S.text = e.target.value; $('#ask-count').textContent = S.text.length; }
  if (e.target.id === 'ask-topic') S.topic = e.target.value;
});
app.addEventListener('change', e => {
  if (e.target.id === 'ask-grade') { S.grade = +e.target.value; S.ban = 0; S.sid = ''; render(); }
  if (e.target.id === 'ask-ban') { S.ban = +e.target.value; S.sid = ''; render(); }
  if (e.target.id === 'ask-student') S.sid = e.target.value;
});
app.addEventListener('focusout', e => {
  if (S.deferred && !(e.relatedTarget && app.contains(e.relatedTarget))) setTimeout(() => { if (S.deferred && !typingIn(app)) render(); });
});
app.addEventListener('click', e => {
  if (e.target.id === 'again') { S.sent = false; S.text = ''; S.err = ''; render(); $('#ask-text')?.focus(); }
});
app.addEventListener('submit', async e => {
  e.preventDefault();
  if (S.sending) return;
  const text = S.text.trim(), topic = S.topic.trim();
  S.err = !S.sid ? '이름을 먼저 골라 주세요.' : !text ? '질문을 적어 주세요.' : '';
  if (S.err) return render();
  S.sending = true; render();
  try {
    await store.submitQuestion(S.c, { sid: S.sid, text, topic, date: today() });
    S.sent = true; S.text = '';
  } catch (err) {
    S.err = err?.code === 'permission-denied'
      ? '질문을 보내지 못했어요. 선생님이 질문 받기를 닫았거나 명단이 바뀌었을 수 있어요. 화면을 새로 고쳐 보세요.'
      : errorText(err);
  }
  S.sending = false; render();
});

if (!store.configured) fatal(app, '아직 설치가 끝나지 않았습니다', 'Firebase 설정값을 js/firebase-config.js 에 붙여 넣어 주세요.');
else if (!S.c) fatal(app, '선생님께 받은 링크로 들어와 주세요', '질문을 남기는 링크는 ask.html?c=… 모양입니다.');
else store.watchConfig(S.c, cfg => {
  if (!cfg) return fatal(app, '찾을 수 없는 링크입니다', '링크가 잘렸거나 바뀌었을 수 있습니다. 선생님께 다시 받아 주세요.');
  S.cfg = cfg; requestRender();
}, err => fatal(app, '불러오지 못했습니다', errorText(err)));
