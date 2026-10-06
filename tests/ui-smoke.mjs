// 화면을 실제로 눌러 보는 점검. Chrome 이 있어야 하고 Firebase 대신 가짜 저장소를 쓴다.
//   1) node tests/serve.mjs        (다른 창에서 켜 둔다)
//   2) node tests/ui-smoke.mjs     → 통과/실패를 적고, 화면 사진을 tests/shots/ 에 남긴다
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const BASE = 'http://localhost:8765/';
const CHROME = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(p => p && existsSync(p));
const shots = join(import.meta.dirname, 'shots');
mkdirSync(shots, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

const port = 9333;
const proc = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', `--remote-debugging-port=${port}`,
  `--user-data-dir=${join(tmpdir(), 'qtree-smoke-' + Date.now())}`, '--window-size=1200,1000', 'about:blank'], { stdio: 'ignore' });

let ws, seq = 0;
const pending = new Map();
function cdp(method, params = {}) {
  const id = ++seq;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((ok, no) => pending.set(id, { ok, no }));
}
async function connect() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = list.find(t => t.type === 'page');
      if (page) {
        ws = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise(r => ws.addEventListener('open', r, { once: true }));
        ws.addEventListener('message', e => {
          const m = JSON.parse(e.data);
          if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.no(new Error(m.error.message)) : p.ok(m.result); }
        });
        return;
      }
    } catch { /* 아직 안 떴다 */ }
    await sleep(200);
  }
  throw new Error('Chrome 에 연결하지 못했습니다');
}
async function js(expr) {
  const r = await cdp('Runtime.evaluate', { expression: `(async () => { ${expr} })()`, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}
// 매번 빈 페이지를 거친다. 주소의 # 뒤만 다르면 브라우저가 다시 불러오지 않아 앞 시험의 화면이 남는다.
async function open(path) { await cdp('Page.navigate', { url: 'about:blank' }); await sleep(100); await cdp('Page.navigate', { url: BASE + path }); await sleep(900); }
async function shot(name) { const r = await cdp('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(shots, name + '.png'), Buffer.from(r.data, 'base64')); }
const H = `const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)], wait = ms => new Promise(r => setTimeout(r, ms));
  const click = el => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); };
  const type = (el, v) => { el.focus(); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); el.blur(); };`;

let fails = 0;
async function check(name, fn) {
  try { await fn(); console.log('통과  ' + name); }
  catch (e) { fails++; console.log('실패  ' + name + '\n      ' + e.message); }
}
const expect = (v, msg) => { if (!v) throw new Error(msg); };

try {
  await connect();
  await cdp('Page.enable'); await cdp('Runtime.enable');

  await check('질문나무: 나무를 누르면 크게, 열매를 누르면 쪽지, 다음 열매로 넘기고 닫기', async () => {
    await open('tree.html?c=x');
    const r = await js(`${H}
      const card = $$('.tree-card').find(c => c.textContent.includes('김하늘')); click(card); await wait(100);
      const fruits = $$('.focus [data-q]').length;
      click($$('.focus [data-q]')[0]); await wait(100);
      const opened = !$('#note').hidden, q1 = $('#note-q').textContent, pos = $('#note-pos').textContent;
      click($('#note-next')); const q2 = $('#note-q').textContent;
      click($('#note-close')); await wait(50);
      return { fruits, opened, q1, q2, pos, closed: $('#note').hidden };`);
    expect(r.fruits === 3, `열매 ${r.fruits}개 (3개여야 함)`);
    expect(r.opened && r.q1 && r.q2 && r.q1 !== r.q2, '쪽지가 열리지 않거나 다음 열매로 넘어가지 않음');
    expect(r.pos.endsWith('/ 3'), '쪽지 위치 표시 ' + r.pos);
    expect(r.closed, '쪽지가 닫히지 않음');
  });
  await shot('tree-focus');

  await check('질문나무: 지난 달로 넘기고, 한 해 돌아보기에 그래프가 나온다', async () => {
    await open('tree.html?c=x');
    const r = await js(`${H}
      const before = $('.month-nav .lab').textContent;
      click($('.month-nav .arr')); await wait(400);
      const after = $('.month-nav .lab').textContent, arch = !!$('.arch');
      click($$('.mode-tab')[1]); await wait(400);
      return { before, after, arch, chart: !!$('#year-chart'), bars: $$('#year-chart .hit').length, hash: location.hash };`);
    expect(r.before !== r.after, '달이 바뀌지 않음');
    expect(r.arch, '지난 달 표시 없음');
    expect(r.chart && r.bars === 12, '한 해 그래프 막대 ' + r.bars);
    expect(r.hash === '#year', '주소에 #year 가 남지 않음');
  });
  await shot('tree-year');

  await check('질문 등록: 이름 없이 보내면 막고, 고르고 쓰면 보낸다', async () => {
    await open('ask.html?c=x');
    const r = await js(`${H}
      type($('#ask-text'), '왜 하늘은 파란가요?');
      $('#ask-form').requestSubmit(); await wait(100);
      const err = $('#ask-err').hidden ? '' : $('#ask-err').textContent;
      const sel = $('#ask-student'); sel.value = sel.options[1].value; sel.dispatchEvent(new Event('change', { bubbles: true }));
      $('#ask-form').requestSubmit(); await wait(300);
      return { err, sent: !!$('.sent'), kept: err ? true : false };`);
    expect(r.err.includes('이름'), '이름을 안 골랐는데 막지 않음');
    expect(r.sent, '보낸 뒤 완료 화면이 안 나옴');
  });
  await shot('ask-sent');

  await check('교사: 고친 글로 승인되고, 열린 열매·기록에 바로 나온다', async () => {
    await open('admin.html?k=x#pending');
    const r = await js(`${H}
      const n0 = $$('.q-card').length;
      const ta = $('.q-card textarea'); type(ta, '빛보다 빠른 것은 정말 없나요? (고침)');
      type($('.q-card input'), '좋은 질문!');
      click($('.q-card [data-act="approve"]')); await wait(400);
      const n1 = $$('.q-card').length;
      click($('#tab-approved')); await wait(100);
      const inList = document.body.textContent.includes('(고침)') && document.body.textContent.includes('한마디 · 좋은 질문!');
      click($('#tab-record')); await wait(100);
      const rows = $$('.rec tbody tr').length;
      return { n0, n1, inList, rows };`);
    expect(r.n1 === r.n0 - 1, `대기 ${r.n0} → ${r.n1}`);
    expect(r.inList, '고친 글이나 한마디가 열린 열매에 없음');
    expect(r.rows === 10, `기록 줄 ${r.rows} (10이어야 함)`);
  });
  await shot('admin-record');

  await check('교사: 입력하는 동안 실시간 갱신이 와도 쓰던 글이 남는다', async () => {
    // 승인 카드는 초안(drafts)으로 지켜지지만, 명단 이름 칸은 초안이 없다. 갱신을 미루는 장치만이 지킨다.
    await open('admin.html?k=x#settings');
    const r = await js(`${H}
      const name = $('[id^="stu-name-"]'); const id = name.id;
      name.focus(); name.value = '고치는 중'; name.dispatchEvent(new Event('input', { bubbles: true }));
      const store = await import('/js/store.js');
      await store.updateSettings('x', { perRow: 5 }); await wait(300);   // 다른 기기에서 설정이 바뀐 것처럼
      const el = document.getElementById(id);
      return { value: el.value, focused: document.activeElement === el };`);
    expect(r.value === '고치는 중' && r.focused, '쓰던 글이나 커서가 사라짐 ' + JSON.stringify(r));
  });

  await check('교사: 명단 붙여넣기 — 새 학생만 들어가고 이미 있는 학생은 건너뛴다', async () => {
    await open('admin.html?k=x#settings');
    const r = await js(`${H}
      const n0 = $$('.roster tbody tr').length;
      type($('#paste-box'), '1\\t1\\t강지우\\n3\\t1\\t새학생\\n이름만');
      click($('[data-act="paste"]')); await wait(400);
      const names = $$('.roster tbody input[id^="stu-name-"]').map(i => i.value);
      return { n0, n1: names.length, names, box: $('#paste-box').value };`);
    expect(r.n1 === r.n0 + 2, `명단 ${r.n0} → ${r.n1}`);
    expect(r.names.includes('새학생') && r.names.includes('이름만'), '새 학생이 안 들어감');
    expect(r.box === '', '붙여넣기 칸이 비워지지 않음');
  });

  await check('교사: 계절을 바꾸면 미리보기 나무가 바뀐다', async () => {
    await open('admin.html?k=x#settings');
    const r = await js(`${H}
      const before = $('.mini svg').outerHTML;
      const w = $('#season-winter'); w.checked = true; w.dispatchEvent(new Event('change', { bubbles: true })); await wait(300);
      return { changed: $('.mini svg').outerHTML !== before, snow: $('.mini svg').outerHTML.includes('#fbfdff'), checked: $('#season-winter').checked };`);
    expect(r.changed && r.snow && r.checked, '겨울로 바뀌지 않음');
  });
  await shot('admin-settings');

  await check('교사: 지우기는 두 번 눌러야 지워진다', async () => {
    await open('admin.html?k=x#held');
    const r = await js(`${H}
      const b = () => $('[data-act="delq"]');
      click(b()); await wait(100);
      const asked = b().textContent, stillThere = $$('.q-row').length;
      click(b()); await wait(400);
      return { asked, stillThere, after: $$('.q-row').length };`);
    expect(r.asked.includes('정말'), '확인을 묻지 않음');
    expect(r.stillThere === 1 && r.after === 0, `보류 ${r.stillThere} → ${r.after}`);
  });

  await check('설치: 링크 세 개가 나온다', async () => {
    await open('setup.html');
    const r = await js(`${H} click($('#go')); await wait(400); return $$('input[readonly]').map(i => i.value);`);
    expect(r.length === 3 && r.some(v => v.includes('admin.html?k=')) && r.some(v => v.includes('ask.html?c=')), '링크 ' + JSON.stringify(r));
  });
  await shot('setup-done');
} finally {
  try { ws?.close(); } catch { }
  proc.kill();
}
console.log(fails ? `\n${fails}개 실패` : '\n모두 통과');
process.exit(fails ? 1 : 0);
