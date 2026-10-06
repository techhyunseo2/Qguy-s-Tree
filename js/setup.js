// 처음 한 번 설치 (setup.html). 반 코드와 교사 키를 만들고 스스로 잠긴다.
import { $, esc, withDefaults, DEFAULT_TITLE, fatal, errorText, copyText } from './common.js';
import * as store from './store.js';

const app = $('#app');
let links = null;

function intro() {
  app.innerHTML = `<div class="setup-card">
    <div><div class="kicker">처음 한 번만</div><h1 class="title">질문나무 설치</h1>
    <p class="muted">설치를 누르면 학생용 링크 둘과 교사용 링크 하나가 만들어집니다. 설치가 끝나면 이 화면은 잠겨서 다른 사람이 다시 설치할 수 없습니다.</p></div>
    <div class="field"><label for="title">질문나무 제목</label><input id="title" maxlength="30" value="${esc(DEFAULT_TITLE)}" autocomplete="off"></div>
    <button type="button" class="primary wide" id="go">설치하기</button>
    <p class="err" id="err" role="alert" hidden></p>
  </div>`;
  $('#go').onclick = install;
}

async function install() {
  const btn = $('#go'), err = $('#err');
  btn.disabled = true; btn.textContent = '설치하는 중…'; err.hidden = true;
  try {
    const title = $('#title').value.trim() || DEFAULT_TITLE;
    const { c, k } = await store.install(withDefaults({ title }));
    const at = page => new URL(page, location.href).href;
    links = { ask: at(`ask.html?c=${c}`), tree: at(`tree.html?c=${c}`), admin: at(`admin.html?k=${k}`) };
    done();
  } catch (e) {
    err.textContent = e?.code === 'permission-denied'
      ? '설치가 거절되었습니다. 보안 규칙을 게시했는지(설치안내 5단계), 이미 누군가 설치하지 않았는지 확인해 주세요.'
      : errorText(e);
    err.hidden = false; btn.disabled = false; btn.textContent = '설치하기';
  }
}

function done() {
  const row = (k, label, note) => `<div class="field"><label for="l-${k}">${label} <span class="lbl-note">${note}</span></label>
    <div class="paste"><input id="l-${k}" value="${esc(links[k])}" readonly><button type="button" class="ghost sm" data-copy="${k}">복사</button></div></div>`;
  app.innerHTML = `<div class="setup-card">
    <div><div class="kicker">설치 완료</div><h1 class="title">링크 세 개가 만들어졌습니다</h1></div>
    <div class="warn-box"><b>교사 링크를 지금 꼭 저장해 두세요.</b><p>이 화면을 닫으면 다시 볼 수 없습니다. 즐겨찾기에 넣거나 메모장에 붙여 두세요.</p></div>
    ${row('admin', '교사 · 검토', '(학생에게 알리지 마세요)')}
    ${row('ask', '학생 · 질문 등록', '(학생에게 나눠 주세요)')}
    ${row('tree', '학생 · 질문나무', '(교실 화면에 띄우거나 나눠 주세요)')}
    <a class="primary wide" style="text-align:center;text-decoration:none" href="${esc(links.admin)}">교사 화면으로 가서 학생 명단 등록하기</a>
  </div>`;
  app.addEventListener('click', e => {
    const k = e.target.dataset?.copy;
    if (k) copyText(links[k], '링크를 복사했습니다');
  });
}

(async () => {
  if (!store.configured) return fatal(app, 'Firebase 설정값이 아직 없습니다', 'js/firebase-config.js 에 Firebase 웹 앱 설정값을 붙여 넣은 뒤 다시 열어 주세요. 설치안내 4단계입니다.');
  try {
    if (await store.isInstalled()) return fatal(app, '이미 설치되었습니다', '교사 링크로 들어가세요. 교사 링크를 잃어버렸다면 설치안내의 "교사 링크를 잃어버렸을 때"를 보세요.');
  } catch (e) {
    return fatal(app, 'Firebase 에 연결하지 못했습니다', errorText(e));
  }
  intro();
})();
