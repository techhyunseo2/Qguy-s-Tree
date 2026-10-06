// 화면 점검용 가짜 저장소. tests/serve.mjs 가 /js/store.js 자리에 이 파일을 대신 내준다.
// Firebase 없이 세 화면을 띄워 보려는 것이고, 실제 배포에는 쓰이지 않는다.
import { today, monthOf, monthsSoFar, randKey, withDefaults } from './common.js';

export const configured = true;

const NOW = today(), months = monthsSoFar(NOW);
const back = k => months[Math.max(0, months.length - 1 - k)];
const day = (m, d) => `${m}-${String(d).padStart(2, '0')}`;

const db = {
  config: {
    settings: withDefaults({ season: 'autumn', review: true }),
    students: {
      s01: { ban: 1, num: 1, name: '강지우', hidden: false }, s02: { ban: 1, num: 2, name: '김하늘', hidden: false },
      s03: { ban: 1, num: 3, name: '박서준', hidden: false }, s04: { ban: 1, num: 4, name: '윤채원', hidden: false },
      s05: { ban: 1, num: 5, name: '이도윤', hidden: false }, s06: { ban: 2, num: 1, name: '최유나', hidden: false },
      s07: { ban: 2, num: 2, name: '한지호', hidden: false }, s08: { ban: 2, num: 3, name: '오세린', hidden: true },
      // 학년 칸이 없는 위 학생들은 1학년으로 읽힌다(학년을 넣기 전 명단). 아래는 2학년.
      t01: { grade: 2, ban: 1, num: 1, name: '서다온', hidden: false }, t02: { grade: 2, ban: 3, num: 4, name: '문예준', hidden: false }
    }
  },
  forests: {},
  questions: {}
};
const add = (id, sid, date, text, topic = '', note = '', star = false) => {
  const f = { sid, text, topic, date, note, star, approved: date };
  (db.forests[monthOf(date)] ||= {})[id] = f;
  db.questions[id] = { ...f, status: 'approved' };
};
add('a1', 's02', day(back(0), 1), '얼음은 왜 물 위에 뜨나요?', '과학 · 물질');
add('a2', 's02', day(back(0), 2), '방정식은 누가 처음 쓰기 시작했나요?', '수학');
add('a3', 's02', day(back(0), 3), '0으로 나누면 왜 답이 없다고 하나요?', '수학', '좋은 질문이에요.', true);
add('a4', 's06', day(back(0), 1), '돈을 많이 찍어 내면 왜 안 되나요?', '사회 · 경제', '원인과 결과를 끝까지 따라갔네요.', true);
add('a5', 's05', day(back(0), 2), '번개는 왜 지그재그로 치나요?', '과학');
add('a6', 's01', day(back(1), 9), '역사 속 인물이 지금 태어났다면 같은 선택을 했을까요?', '역사');
add('a7', 's02', day(back(1), 16), '꿀벌이 사라지면 우리 식탁은 어떻게 달라지나요?', '과학');
add('a8', 's06', day(back(2), 20), '무지개는 왜 늘 둥근 모양인가요?', '과학 · 빛');
add('a9', 's04', day(back(3), 12), '별은 반짝이는데 행성은 왜 덜 반짝이나요?', '과학 · 별');
add('b1', 't01', day(back(0), 3), '빛은 무게가 있나요?', '과학 · 빛');
db.questions.p1 = { sid: 's03', text: '빛보다 빠른 것은 정말 하나도 없나요?', topic: '과학 · 빛', date: NOW, status: 'pending' };
db.questions.p2 = { sid: 's05', text: '오늘 급식 뭐예요?', topic: '', date: NOW, status: 'pending' };
db.questions.h1 = { sid: 's07', text: 'ㅋㅋㅋ', topic: '', date: NOW, status: 'held' };

const subs = new Set();
const emit = () => setTimeout(() => subs.forEach(f => f()));
const on = fn => { subs.add(fn); setTimeout(fn); return () => subs.delete(fn); };
const clone = o => JSON.parse(JSON.stringify(o));

export const watchConfig = (c, cb) => on(() => cb(clone(db.config)));
export const watchForest = (c, m, cb) => on(() => cb(clone(db.forests[m] || {})));
export const getForest = async (c, m) => clone(db.forests[m] || {});
export async function submitQuestion(c, q) { db.questions['n' + randKey(6)] = { ...q, status: 'pending' }; emit(); }

export const isInstalled = async () => false;
export const install = async () => ({ c: 'CLASSCODE' + randKey(11), k: 'TEACHERKEY' + randKey(14) });

export const adminEnter = async () => 'MOCKCLASS';
export const watchInbox = (c, cb) => on(() => cb(Object.entries(db.questions).filter(([, q]) => ['pending', 'held'].includes(q.status)).map(([id, q]) => ({ id, ...q }))));
export const watchForests = (c, ms, cb) => on(() => cb(Object.fromEntries(ms.map(m => [m, clone(db.forests[m] || {})]))));
export async function approve(c, q, { text, note, star }) {
  const f = { sid: q.sid, text, topic: q.topic || '', date: q.date, note, star: !!star, approved: NOW };
  (db.forests[monthOf(q.date)] ||= {})[q.id] = f;
  db.questions[q.id] = { ...db.questions[q.id], ...f, status: 'approved' };
  emit(); return f;
}
export async function addApproved(c, { sid, text, date }) {
  const id = 'd' + randKey(6), f = { sid, text, topic: '', date, note: '', star: false, approved: date };
  (db.forests[monthOf(date)] ||= {})[id] = f; db.questions[id] = { ...f, status: 'approved' };
  emit(); return { id, ...f };
}
export async function unapprove(c, id, f) { delete db.forests[monthOf(f.date)][id]; db.questions[id].status = 'pending'; emit(); }
export async function setStar(c, id, f, star) { db.forests[monthOf(f.date)][id].star = star; emit(); }
export async function hold(c, id) { db.questions[id].status = 'held'; emit(); }
export async function reopen(c, id) { db.questions[id].status = 'pending'; emit(); }
export async function deleteQuestion(c, id) { delete db.questions[id]; emit(); }
export async function updateSettings(c, p) { Object.assign(db.config.settings, p); emit(); }
export async function addStudents(c, list) { list.forEach(s => { db.config.students[s.id] = { grade: s.grade, ban: s.ban, num: s.num, name: s.name, hidden: false }; }); emit(); }
export async function updateStudent(c, sid, field, v) { db.config.students[sid][field] = v; emit(); }
export async function deleteStudent(c, sid) {
  const gone = Object.entries(db.questions).filter(([, q]) => q.sid === sid).map(([id, q]) => ({ id, date: q.date }));
  gone.forEach(g => { delete db.questions[g.id]; delete db.forests[monthOf(g.date)]?.[g.id]; });
  delete db.config.students[sid]; emit(); return gone;
}
export const rekey = async () => 'NEWKEY' + randKey(18);
export const getSheet = async () => null;
export const saveSheet = async () => {};
export const clearSheet = async () => {};
export const dirtyQuestions = async () => [];
export const markClean = async () => {};
