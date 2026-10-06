// 질문나무 화면 (tree.html?c=반코드). 이번 달 숲, 지난 달 숲, 한 해 돌아보기.
import { $, esc, fmt, today, monthOf, mLabel, monthsSoFar, schoolYearOf, schoolMonths, param, maskName,
  studentList, sortStudents, withDefaults, fruitsOf, fruitsAcross, fatal, errorText } from './common.js';
import { treeSVG, stageLabel, SEASONS, FRUITS } from './tree-draw.js';
import * as store from './store.js';

const app = $('#app');
const NOW = today(), CUR = monthOf(NOW);
const S = {
  c: param('c'), cfg: null,
  months: monthsSoFar(NOW), month: CUR,
  mode: location.hash === '#year' ? 'year' : 'month',
  ban: 'all', focus: null,
  forests: {},          // { '2026-10': fruits } 불러온 달만
  fresh: new Set(), seenLive: null
};

const st = () => withDefaults(S.cfg.settings);
const students = () => studentList(S.cfg.students).filter(s => !s.hidden);
const shown = s => st().mask ? maskName(s.name) : s.name;
const yearView = () => S.mode === 'year';
const viewFruits = sid => yearView() ? fruitsAcross(S.forests, sid) : fruitsOf(S.forests[S.month], sid);
const seedOf = sid => sid + ':' + (yearView() ? 'y' + schoolYearOf(NOW) : S.month);

/* ───── 그리기 ───── */
function render() {
  const s = st();
  document.title = s.title;
  document.body.style.setProperty('--sky', (SEASONS[s.season] || SEASONS.spring).sky);
  if (!s.review && yearView()) S.mode = 'month';
  const focus = S.focus && students().find(x => x.id === S.focus);
  app.innerHTML = focus ? focusView(focus) : forestView();
  S.fresh.clear();
}

function head(total, stars) {
  const s = st(), i = S.months.indexOf(S.month);
  let h = `<div class="tree-head"><h1 class="tree-title">${esc(s.title)}</h1>`;
  if (s.review) h += `<div class="mode-tabs" role="group" aria-label="보기"><button type="button" class="mode-tab" aria-pressed="${!yearView()}" data-act="mode" data-id="month">달마다 숲</button><button type="button" class="mode-tab" aria-pressed="${yearView()}" data-act="mode" data-id="year">한 해 돌아보기</button></div>`;
  if (!yearView()) {
    h += `<div class="month-nav"><button type="button" class="arr" data-act="month" data-id="${S.months[i - 1] || ''}" ${i <= 0 ? 'disabled' : ''} aria-label="지난 달">‹</button><span class="lab">${mLabel(S.month)}의 숲</span><button type="button" class="arr" data-act="month" data-id="${S.months[i + 1] || ''}" ${i >= S.months.length - 1 ? 'disabled' : ''} aria-label="다음 달">›</button></div>`;
    h += `<p class="muted">${S.month === CUR ? '이번 달' : '<span class="arch">지난 달 · 보관된 숲</span>'} 열린 열매 <b>${total}</b>개</p>`;
  } else {
    h += `<p class="muted">${schoolYearOf(NOW)}학년도 3월부터 지금까지 열린 열매 <b>${total}</b>개 · 빛나는 질문 <b>${stars}</b>개</p>`;
  }
  return h + '</div>';
}

function forestView() {
  const s = st(), all = students();
  const bans = [...new Set(all.map(x => x.ban))].sort((a, b) => a - b);
  if (S.ban !== 'all' && !bans.includes(S.ban)) S.ban = 'all';
  const pool = all.filter(x => S.ban === 'all' || x.ban === S.ban);
  const loaded = yearView() ? S.months.every(m => m in S.forests) : S.month in S.forests;
  const counts = new Map(pool.map(x => [x.id, viewFruits(x.id)]));
  const total = [...counts.values()].reduce((n, l) => n + l.length, 0);
  const stars = [...counts.values()].reduce((n, l) => n + l.filter(f => f.star).length, 0);
  let h = head(total, stars);
  if (bans.length > 1) h += `<div class="ban-tabs">${['all', ...bans].map(b => `<button type="button" class="ban-tab" aria-pressed="${S.ban === b}" data-act="ban" data-id="${b}">${b === 'all' ? '전체' : b + '반'}</button>`).join('')}</div>`;
  if (!pool.length) return h + '<div class="empty"><b>아직 나무가 없습니다</b><p class="muted">선생님이 학생 명단을 등록하면 나무가 생깁니다.</p></div>';
  if (!loaded) return h + '<p class="loading">숲을 불러오는 중…</p>';
  if (yearView()) h += yearChart(pool);
  h += `<div class="forest" style="--per:${s.perRow}">` + sortStudents(pool, s.sort, id => counts.get(id).length).map(x => {
    const fr = counts.get(x.id), ns = fr.filter(f => f.star).length;
    const cnt = (fr.length ? `열매 ${fr.length}` : '새싹') + (ns ? ` · <span class="g">빛나는 ${ns}</span>` : '');
    return `<button type="button" class="tree-card" data-act="focus" data-id="${esc(x.id)}" aria-label="${esc(shown(x))}의 나무, 열매 ${fr.length}개">${treeSVG(seedOf(x.id), fr, { season: s.season, fruit: s.fruit, year: yearView(), fresh: S.fresh })}<span class="tc-name">${esc(shown(x))}</span><span class="tc-count">${bans.length > 1 && S.ban === 'all' ? x.ban + '반 · ' : ''}${cnt}</span></button>`;
  }).join('') + '</div>';
  return h;
}

/* 달마다 열린 열매 막대그래프. 막대 하나 = 한 달, 짙은 막대 = 이번 달. */
function yearChart(pool) {
  const ids = new Set(pool.map(x => x.id));
  const data = schoolMonths(schoolYearOf(NOW)).map(m => ({
    m, future: m > CUR,
    n: Object.values(S.forests[m] || {}).filter(f => ids.has(f.sid)).length
  }));
  const top = Math.ceil(Math.max(4, ...data.map(d => d.n)) / 4) * 4;
  const W = 600, H = 190, L = 28, B = 160, T = 18, step = (W - L) / 12, bw = 22;
  const y = v => B - (B - T) * v / top;
  const peak = Math.max(...data.map(d => d.n));
  const r1 = n => (Math.round(n * 10) / 10).toString();
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="달마다 열린 열매 수">`;
  for (const t of [0, top / 2, top]) s += `<line x1="${L}" x2="${W}" y1="${r1(y(t))}" y2="${r1(y(t))}" stroke="#e3e8df" stroke-width="1"/><text class="tick" x="${L - 6}" y="${r1(y(t) + 4)}" text-anchor="end">${t}</text>`;
  data.forEach((d, i) => {
    const cx = L + step * i + step / 2, x = cx - bw / 2, yt = y(d.n), cur = d.m === CUR;
    s += `<rect class="hit" x="${r1(L + step * i)}" y="${T}" width="${r1(step)}" height="${B - T}" tabindex="0" data-tip="${mLabel(d.m)} · ${d.future ? '아직 오지 않은 달' : '열매 ' + d.n + '개'}" data-x="${r1(cx)}" data-y="${r1(Math.min(yt, B) - 6)}" aria-label="${mLabel(d.m)} 열매 ${d.n}개"/>`;
    if (d.n > 0) {
      const rr = Math.min(4, B - yt);
      s += `<path d="M${r1(x)} ${B} V${r1(yt + rr)} Q${r1(x)} ${r1(yt)} ${r1(x + rr)} ${r1(yt)} H${r1(x + bw - rr)} Q${r1(x + bw)} ${r1(yt)} ${r1(x + bw)} ${r1(yt + rr)} V${B}Z" fill="${cur ? '#356f44' : '#6aa577'}" pointer-events="none"/>`;
      if (cur || d.n === peak) s += `<text class="val" x="${r1(cx)}" y="${r1(yt - 6)}" text-anchor="middle">${d.n}</text>`;
    }
    s += `<text class="mlab${cur ? ' cur' : ''}" x="${r1(cx)}" y="${B + 20}" text-anchor="middle">${mLabel(d.m)}</text>`;
  });
  s += `<line x1="${L}" x2="${W}" y1="${B}" y2="${B}" stroke="#c9d2c4" stroke-width="1"/></svg>`;
  const past = data.filter(d => !d.future);
  return `<figure class="year-chart" id="year-chart"><figcaption><b>달마다 열린 열매</b><span class="muted">짙은 막대가 이번 달</span></figcaption>${s}<div class="tip" id="chart-tip" hidden></div>
    <details><summary>숫자로 보기</summary><table><tr>${past.map(d => `<th>${mLabel(d.m)}</th>`).join('')}</tr><tr>${past.map(d => `<td>${d.n}</td>`).join('')}</tr></table></details></figure>`;
}

function focusView(x) {
  const s = st(), fr = viewFruits(x.id), year = yearView(), ns = fr.filter(f => f.star).length;
  let info;
  if (!fr.length) {
    info = year ? '<p class="muted">올해는 아직 열매가 없어요.</p>'
      : `<p class="muted">${S.month === CUR ? '이번 달은 아직 열매가 없어요. 수업 중에 떠오른 질문을 남기면 첫 열매가 열립니다.' : '이 달에는 열매가 열리지 않았어요.'}</p>`
        + (S.month === CUR ? `<a class="ghost" style="justify-self:start;text-decoration:none" href="ask.html?c=${encodeURIComponent(S.c)}">질문 남기러 가기</a>` : '');
  } else if (year) {
    const byM = schoolMonths(schoolYearOf(NOW)).map(m => [m, fr.filter(f => monthOf(f.date) === m)]).filter(([, l]) => l.length);
    info = `<p class="muted">한 해 동안 한 질문이 모두 열렸습니다. 열매나 아래 질문을 누르면 쪽지가 펼쳐집니다.</p><ol class="timeline">${byM.map(([m, l]) => `<li><span class="m">${mLabel(m)}</span><ul>${l.map(f => `<li><button type="button" class="link-btn" data-act="open-q" data-id="${esc(f.id)}">${esc(f.text)}</button>${f.star ? '<span class="g">빛나는 질문</span>' : ''}</li>`).join('')}</ul></li>`).join('')}</ol>`;
  } else {
    info = `<p class="muted">열매를 누르면 내가 했던 질문이 쪽지로 펼쳐집니다.</p><details class="qlist"><summary>질문 목록으로 보기</summary><ol>${fr.map(f => `<li><button type="button" class="link-btn" data-act="open-q" data-id="${esc(f.id)}">${esc(f.text)}</button></li>`).join('')}</ol></details>`;
  }
  return `<button type="button" class="ghost back" id="back-btn" data-act="unfocus">← ${year ? '돌아보기' : mLabel(S.month) + '의 숲'}으로</button>
    <div class="focus"><div class="focus-tree">${treeSVG(seedOf(x.id), fr, { season: s.season, fruit: s.fruit, interactive: true, year, fresh: S.fresh })}</div>
    <div class="focus-info"><div class="kicker">${x.ban}반 ${x.num}번 · ${year ? schoolYearOf(NOW) + '학년도' : mLabel(S.month)}</div>
    <h1 class="focus-name">${esc(shown(x))}의 ${year ? '한 해' : '나무'}</h1>
    <p class="stage">${stageLabel(fr.length, year)} · 열매 ${fr.length}개${ns ? ` · 빛나는 질문 ${ns}개` : ''}</p>${info}</div></div>`;
}

/* ───── 열매 쪽지 ───── */
let NOTE = { list: [], i: 0, opener: null };
function openNote(id) {
  const all = yearView() ? Object.values(S.forests) : [S.forests[S.month]];
  const owner = all.map(f => f?.[id]).find(Boolean);
  if (!owner) return;
  const list = viewFruits(owner.sid);
  NOTE = { list, i: list.findIndex(f => f.id === id), opener: document.activeElement };
  showNote();
  $('#note').hidden = false;
  $('#note-close').focus();
}
function showNote() {
  const f = NOTE.list[NOTE.i], who = students().find(x => x.id === f.sid), s = st();
  const scope = yearView() ? '올해' : mLabel(monthOf(f.date));
  const bits = [`${esc(who ? shown(who) : '')}의 ${scope} ${NOTE.i + 1}번째 열매`];
  if (f.topic) bits.push(esc(f.topic));
  if (s.showDate) bits.push(fmt(f.date));
  if (f.star) bits.push('<span class="note-star">빛나는 질문</span>');
  $('#note-meta').innerHTML = bits.join(' · ');
  $('#note-q').textContent = f.text;
  const tn = $('#note-teacher');
  tn.textContent = f.note ? `선생님 한마디 · ${f.note}` : '';
  tn.hidden = !f.note;
  $('#note-pos').textContent = `${NOTE.i + 1} / ${NOTE.list.length}`;
  $('#note-prev').disabled = NOTE.i === 0;
  $('#note-next').disabled = NOTE.i === NOTE.list.length - 1;
  $('.note').style.setProperty('--note-pin', f.star ? '#e0a812' : (FRUITS[s.fruit] || FRUITS.apple).color);
}
function closeNote() {
  $('#note').hidden = true;
  if (S.stale) { S.stale = false; render(); }
  const o = NOTE.opener;
  const again = o?.dataset?.q && app.querySelector(`[data-q="${CSS.escape(o.dataset.q)}"]`);
  if (again) again.focus();
  else if (o && document.contains(o)) o.focus();
}
$('#note-close').onclick = closeNote;
$('#note-prev').onclick = () => { if (NOTE.i > 0) { NOTE.i--; showNote(); } };
$('#note-next').onclick = () => { if (NOTE.i < NOTE.list.length - 1) { NOTE.i++; showNote(); } };
$('#note').addEventListener('click', e => { if (e.target.id === 'note') closeNote(); });
document.addEventListener('keydown', e => {
  if ($('#note').hidden) return;
  if (e.key === 'Escape') closeNote();
  if (e.key === 'ArrowLeft') $('#note-prev').click();
  if (e.key === 'ArrowRight') $('#note-next').click();
});

/* ───── 지난 달 불러오기 ───── */
async function ensureMonths(list) {
  const need = list.filter(m => !(m in S.forests));
  if (!need.length) return;
  try {
    const got = await Promise.all(need.map(m => store.getForest(S.c, m)));
    need.forEach((m, i) => { if (!(m in S.forests)) S.forests[m] = got[i]; });
  } catch (err) {
    need.forEach(m => { if (!(m in S.forests)) S.forests[m] = {}; });
    fatal(app, '숲을 불러오지 못했습니다', errorText(err));
    return;
  }
  render();
}

/* ───── 손님 동작 ───── */
app.addEventListener('click', e => {
  const fq = e.target.closest('[data-q]');
  if (fq) return openNote(fq.dataset.q);
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const { act, id } = b.dataset;
  if (act === 'mode') {
    S.mode = id; S.focus = null;
    history.replaceState(null, '', id === 'year' ? '#year' : location.pathname + location.search);
    if (id === 'year') ensureMonths(S.months);
  }
  if (act === 'month' && id) { S.month = id; ensureMonths([id]); }
  if (act === 'ban') S.ban = id === 'all' ? 'all' : +id;
  if (act === 'open-q') return openNote(id);
  if (act === 'focus') { S.focus = id; render(); $('#back-btn')?.focus({ preventScroll: true }); scrollTo({ top: 0 }); return; }
  if (act === 'unfocus') {
    const was = S.focus; S.focus = null; render();
    app.querySelector(`.tree-card[data-id="${CSS.escape(was)}"]`)?.focus({ preventScroll: false });
    return;
  }
  render();
});
app.addEventListener('keydown', e => {
  const fq = e.target.closest?.('[data-q]');
  if (fq && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openNote(fq.dataset.q); }
});
function showTip(t) {
  const fig = $('#year-chart'), tip = $('#chart-tip');
  if (!fig || !tip) return;
  const box = fig.querySelector('svg').getBoundingClientRect(), fb = fig.getBoundingClientRect(), k = box.width / 600;
  tip.textContent = t.dataset.tip; tip.hidden = false;
  tip.style.left = (box.left - fb.left + (+t.dataset.x) * k) + 'px';
  tip.style.top = (box.top - fb.top + (+t.dataset.y) * k) + 'px';
}
const hideTip = () => { const t = $('#chart-tip'); if (t) t.hidden = true; };
app.addEventListener('mouseover', e => { const t = e.target.closest?.('.hit'); if (t) showTip(t); });
app.addEventListener('mouseout', e => { if (e.target.closest?.('.hit')) hideTip(); });
app.addEventListener('focusin', e => { if (e.target.classList?.contains('hit')) showTip(e.target); });
app.addEventListener('focusout', e => { if (e.target.classList?.contains('hit')) hideTip(); });

/* ───── 시작 ───── */
if (!store.configured) fatal(app, '아직 설치가 끝나지 않았습니다', 'Firebase 설정값을 js/firebase-config.js 에 붙여 넣어 주세요.');
else if (!S.c) fatal(app, '선생님께 받은 링크로 들어와 주세요', '질문나무 링크는 tree.html?c=… 모양입니다.');
else {
  const onErr = err => fatal(app, '불러오지 못했습니다', errorText(err));
  store.watchConfig(S.c, cfg => {
    if (!cfg) return fatal(app, '찾을 수 없는 질문나무입니다', '링크가 잘렸거나 바뀌었을 수 있습니다. 선생님께 다시 받아 주세요.');
    const first = !S.cfg;
    S.cfg = cfg;
    if (first && yearView()) ensureMonths(S.months);
    if (!$('#note').hidden) { S.stale = true; return; }   // 쪽지를 읽는 동안에는 뒤를 다시 그리지 않는다
    render();
  }, onErr);
  // 이번 달 숲은 실시간으로. 교실 화면에 띄워 두면 승인하는 대로 열매가 톡 열린다.
  store.watchForest(S.c, CUR, fruits => {
    const ids = Object.keys(fruits);
    if (S.seenLive) ids.filter(id => !S.seenLive.has(id)).forEach(id => S.fresh.add(id));
    S.seenLive = new Set(ids);
    S.forests[CUR] = fruits;
    if (!S.cfg) return;
    if ($('#note').hidden) render(); else S.stale = true;
  }, onErr);
}
