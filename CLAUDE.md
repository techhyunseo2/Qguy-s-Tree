# 질문나무 (Q가이즈의 질문나무)

학생이 수업 중 한 좋은 질문을 학생별 나무의 열매로 모으는 웹 페이지. 사용자는 중학교 교사이고, 쓰는 사람은 교사와 학생이다. 공문 정리함(`../CLAUDE.md`)과는 **별개 프로젝트**다.

설계안(개요·미리보기)은 claude.ai 아티팩트로 먼저 검토받았다: https://claude.ai/artifact/MTBgzjNVu1kv5mAzk4VGaN
거기서 정한 기본값으로 만들었다. 기본값은 아래와 같다.
- 반 전체 숲
- 반별 탭
- 선생님 한마디 있음
- 학생에게 대기 상태 안 보임
- GitHub Pages
- 질문한 날짜의 달에 열림
- 엑셀 + 선택적 구글 시트
- 돌아보기는 교사가 켬
- 빛나는 질문 별표
- 지난 달 숲은 학생도 봄

## 구조

정적 HTML + ES 모듈. 빌드 없음. Firebase JS SDK 는 gstatic CDN(`js/firebase.js` 한 곳에서만 import, 판 10.14.1).

```
ask.html / tree.html / admin.html / setup.html / index.html
js/common.js      날짜·학년도·명단 붙여넣기·알림 등. Firebase 안 씀 → node 시험 가능
js/tree-draw.js   나무·열매 SVG. 씨앗(학생id:달)이 같으면 같은 그림
js/records.js     기록 표(HEAD), 엑셀(SheetJS CDN 지연 로드), 구글 시트 Apps Script 코드와 전송
js/firebase.js    SDK import 와 익명 로그인. configured=false 면 아무 데도 연결 안 함
js/store.js       모든 Firestore 경로와 읽고 쓰기. 페이지는 여기만 부른다
js/{ask,tree,admin,setup}.js  각 페이지
firestore.rules   보안 규칙 (콘솔에 붙여 넣음). 저장 구조 설명이 맨 위에 있다
tests/*.test.js   node --test. 계산, 나무, 기록, Apps Script(흉내 낸 시트에서 실행), 파일 맞물림, 규칙 정적 검사
tests/serve.mjs + mock-store.js   가짜 저장소로 화면 띄우기 (/js/store.js 자리에 mock 을 내줌)
tests/ui-smoke.mjs                Chrome 원격 조종으로 클릭 흐름 점검 (serve.mjs 켠 채로)
```

## 꼭 지킬 것

- **로그인 없이 링크가 열쇠.** 반 코드(20자)·교사 키(24자)는 `randKey`. 그래서 규칙에서 **list 를 절대 열지 않는다** — 열면 코드를 몰라도 다른 반을 찾아낸다. `tests/project.test.js` 가 지킨다.
- **교사 판별**: `classes/{c}/admins/{uid}.key` 가 살아 있는 `adminKeys/{key}` 를 가리키고 그 classId 가 c 일 때. 교사 키를 새로 만들면(`rekey`) 옛 키 문서가 지워져 옛 링크로 등록한 기기가 전부 막힌다.
- **설치는 한 묶음(batch)**: lock + adminKeys + config + admins. 규칙의 `inSetup()` = 잠금이 지금 없고 묶음 뒤에 생김. 묶음 구성을 바꾸면 규칙도 같이 바꿀 것.
- **승인된 열매는 `forests/{YYYY-MM}` 한 문서에 모은다.** 질문나무 한 번 여는 데 읽기 2번(config + 이번 달 숲). 질문을 하나씩 읽게 바꾸면 무료 한도(하루 5만 읽기)가 금방 찬다. 달마다 문서가 새로 생기는 것이 곧 "매달 초기화"다.
- 원본 `questions` 는 승인해도 지우지 않는다. 학생이 보낼 수 있는 칸은 규칙의 `hasOnly([...])` 와 `store.submitQuestion` 이 같아야 한다 (시험 있음).
- **실시간 갱신 중 입력 보호**: `requestRender` 는 입력 중이면 미루고, 승인 카드·붙여넣기·바로 달기는 초안(S.drafts 등)으로 지킨다. 미루기를 빼면 명단 이름 칸 글자가 날아간다 — `ui-smoke` 가 잡는다(빼서 확인함).
- **`[hidden]{display:none!important}`** 를 css 에서 빼지 말 것. 쪽지·알림이 `display` 를 갖고 있어 hidden 이 무시되고 닫힌 쪽지가 떠 있었다(실제로 겪음).
- 구글 시트: Apps Script 웹 앱에 `fetch(POST, 글 본문)` — 머리글을 붙이면 사전 확인(preflight)이 생겨 막힌다. **학년도마다 탭**(`2026학년도`). '다시 쓰기'는 올해 탭만 비운다. 학생을 지워도 시트 줄은 남긴다(보관용 기록). 못 보낸 변경은 질문 문서의 `sheetDirty` 로 표시해 다음 접속 때 다시 보낸다.
- 학년도 = 3월~이듬해 2월 (`schoolYearOf`).
- **referrer 는 `strict-origin`.** 처음엔 `no-referrer` 였는데, GitHub 가 API 키 감지 메일을 보내 Google Cloud 에서 키를 사이트 주소(HTTP referrer)로 제한하기로 하면서 바꿨다. no-referrer 면 Referer 가 안 가서 제한된 키로 Firebase 요청이 전부 거절된다. strict-origin 은 출처만 보내므로 링크의 ?k=/?c= 열쇠는 여전히 새지 않는다. 시험이 지킨다.

## 검증 상태

- `node --test tests/*.test.js` 37개 통과, `ui-smoke` 9개 통과.
- 고장을 일부러 넣어 시험이 실제로 잡는지 확인했다: 초안 무시, 입력 중 미루기 제거.
- **보안 규칙은 에뮬레이터로 돌려 보지 못했다.** 이 PC 에 Java 가 없다. 정적 검사만 있다.
  - JDK 를 깔면 `@firebase/rules-unit-testing` 으로 시험을 짜는 것이 다음 일순위다.
  - 살펴볼 곳: 설치 묶음, rekey 묶음, 학생 질문 create, list 거부.
- 실제 Firebase·Apps Script 와는 아직 한 번도 이어 보지 않았다. 첫 설치 때 나오는 오류를 받아 고칠 것.

## 작업 습관

사용자의 공문 정리함 작업 기준을 따른다.
- 고치기 전에 재현한다.
- 고친 뒤 되돌려서 시험이 잡는지 본다.
- 재현하지 못한 방어는 넣지 않는다.
- 커밋·푸시는 사용자가 한다.
