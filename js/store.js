// 데이터 읽고 쓰기. 페이지들은 Firestore 를 직접 만지지 않고 여기 함수만 부른다.
// 저장 구조와 그 이유는 firestore.rules 맨 위 설명에 있다.
import {
  configured, db, signIn, doc, collection, getDoc, getDocs, setDoc, updateDoc, addDoc, deleteDoc,
  onSnapshot, query, where, writeBatch, serverTimestamp, deleteField, FieldPath
} from './firebase.js';
import { randKey, monthOf, today } from './common.js';

export { configured };

const P = {
  lock:      ()       => doc(db, 'meta', 'lock'),
  key:       k        => doc(db, 'adminKeys', k),
  config:    c        => doc(db, 'classes', c, 'public', 'config'),
  forest:    (c, m)   => doc(db, 'classes', c, 'forests', m),
  questions: c        => collection(db, 'classes', c, 'questions'),
  question:  (c, id)  => doc(db, 'classes', c, 'questions', id),
  admin:     (c, uid) => doc(db, 'classes', c, 'admins', uid),
  sheet:     c        => doc(db, 'classes', c, 'private', 'sheet')
};
const fruitsIn = snap => snap.exists() ? (snap.data().fruits || {}) : {};
const dirty = on => on ? { sheetDirty: true } : {};

/* ───────── 학생 화면 ───────── */

/** 설정과 명단. 없는 반 코드면 null. */
export const watchConfig = (c, cb, onErr) =>
  onSnapshot(P.config(c), s => cb(s.exists() ? s.data() : null), onErr);

/** 한 달의 숲(열매 지도). 그 달에 열매가 없으면 {}. */
export const watchForest = (c, m, cb, onErr) => onSnapshot(P.forest(c, m), s => cb(fruitsIn(s)), onErr);
export const getForest = async (c, m) => fruitsIn(await getDoc(P.forest(c, m)));

export async function submitQuestion(c, { sid, text, topic, date }) {
  await addDoc(P.questions(c), { sid, text, topic, date, askedAt: serverTimestamp(), status: 'pending' });
}

/* ───────── 처음 설치 ───────── */

export const isInstalled = async () => (await getDoc(P.lock())).exists();

/** 반 코드와 교사 키를 만들고 설치를 잠근다. 보안 규칙이 이 한 묶음일 때만 허락한다. */
export async function install(settings) {
  const u = await signIn();
  const c = randKey(20), k = randKey(24);
  const b = writeBatch(db);
  b.set(P.lock(), { at: serverTimestamp() });
  b.set(P.key(k), { classId: c, at: serverTimestamp() });
  b.set(P.config(c), { settings, students: {} });
  b.set(P.admin(c, u.uid), { key: k, at: serverTimestamp() });
  await b.commit();
  return { c, k };
}

/* ───────── 교사 화면 ───────── */

/** 교사 키로 반을 찾고 이 기기를 교사로 등록한다. 쓸 수 없는 키면 null. */
export async function adminEnter(k) {
  const u = await signIn();
  const ks = await getDoc(P.key(k));
  if (!ks.exists()) return null;
  const c = ks.data().classId;
  const me = await getDoc(P.admin(c, u.uid));
  if (!me.exists() || me.data().key !== k) await setDoc(P.admin(c, u.uid), { key: k, at: serverTimestamp() });
  return c;
}

/** 검토 대기와 보류. 승인된 질문은 숲에서 읽으므로 여기 오지 않는다. */
export const watchInbox = (c, cb, onErr) =>
  onSnapshot(query(P.questions(c), where('status', 'in', ['pending', 'held'])),
    s => cb(s.docs.map(d => ({ id: d.id, ...d.data() }))), onErr);

/** 여러 달의 숲을 한꺼번에 지켜본다. cb({ '2026-09': fruits, … }) */
export function watchForests(c, months, cb, onErr) {
  const all = {};
  const offs = months.map(m => onSnapshot(P.forest(c, m), s => { all[m] = fruitsIn(s); cb({ ...all }); }, onErr));
  return () => offs.forEach(off => off());
}

/** 승인: 원본 질문을 고치고, 질문한 달의 숲에 열매를 단다. */
export async function approve(c, q, { text, note, star }, sheetOn) {
  const fruit = { sid: q.sid, text, topic: q.topic || '', date: q.date, note: note || '', star: !!star, approved: today() };
  const b = writeBatch(db);
  b.update(P.question(c, q.id), {
    text, note: fruit.note, star: fruit.star, status: 'approved', approved: fruit.approved,
    approvedAt: serverTimestamp(), ...dirty(sheetOn)
  });
  b.set(P.forest(c, monthOf(q.date)), { fruits: { [q.id]: fruit } }, { merge: true });
  await b.commit();
  return fruit;
}

/** 수업 중에 들은 질문을 선생님이 바로 열매로. */
export async function addApproved(c, { sid, text, date }, sheetOn) {
  const ref = doc(P.questions(c));
  const fruit = { sid, text, topic: '', date, note: '', star: false, approved: date };
  const b = writeBatch(db);
  b.set(ref, { ...fruit, status: 'approved', byTeacher: true, askedAt: serverTimestamp(), approvedAt: serverTimestamp(), ...dirty(sheetOn) });
  b.set(P.forest(c, monthOf(date)), { fruits: { [ref.id]: fruit } }, { merge: true });
  await b.commit();
  return { id: ref.id, ...fruit };
}

/** 열매 떼기: 숲에서 빼고 원본은 검토 대기로 돌린다. */
export async function unapprove(c, id, fruit, sheetOn) {
  const b = writeBatch(db);
  b.update(P.question(c, id), { status: 'pending', approved: deleteField(), ...dirty(sheetOn) });
  b.update(P.forest(c, monthOf(fruit.date)), new FieldPath('fruits', id), deleteField());
  await b.commit();
}

export async function setStar(c, id, fruit, star, sheetOn) {
  const b = writeBatch(db);
  b.update(P.question(c, id), { star, ...dirty(sheetOn) });
  b.update(P.forest(c, monthOf(fruit.date)), new FieldPath('fruits', id, 'star'), star);
  await b.commit();
}

export const hold = (c, id) => updateDoc(P.question(c, id), { status: 'held' });
export const reopen = (c, id) => updateDoc(P.question(c, id), { status: 'pending' });
export const deleteQuestion = (c, id) => deleteDoc(P.question(c, id));

/** 설정 몇 칸만 바꾼다. patch = { season: 'autumn', … } */
export const updateSettings = (c, patch) =>
  updateDoc(P.config(c), Object.fromEntries(Object.entries(patch).map(([k, v]) => ['settings.' + k, v])));

/** 학생 여럿을 명단에 넣는다. list = [{id, ban, num, name}] */
export const addStudents = (c, list) =>
  updateDoc(P.config(c), Object.fromEntries(list.map(s => ['students.' + s.id, { ban: s.ban, num: s.num, name: s.name, hidden: false }])));

export const updateStudent = (c, sid, field, value) => updateDoc(P.config(c), new FieldPath('students', sid, field), value);

/** 학생과 그 학생의 질문·열매를 모두 지운다. 지운 질문들의 [{id, date}]를 돌려준다. */
export async function deleteStudent(c, sid, forests) {
  const qs = await getDocs(query(P.questions(c), where('sid', '==', sid)));
  const b = writeBatch(db);
  qs.forEach(d => b.delete(d.ref));
  for (const [m, fruits] of Object.entries(forests))
    for (const [id, f] of Object.entries(fruits))
      if (f.sid === sid) b.update(P.forest(c, m), new FieldPath('fruits', id), deleteField());
  b.update(P.config(c), new FieldPath('students', sid), deleteField());
  await b.commit();
  return qs.docs.map(d => ({ id: d.id, date: d.data().date }));
}

/** 교사 키를 새로 만든다. 옛 키를 지우는 순간 옛 링크로 등록된 모든 기기가 막힌다. */
export async function rekey(c, oldKey) {
  const u = await signIn();
  const nk = randKey(24);
  const b = writeBatch(db);
  b.set(P.key(nk), { classId: c, at: serverTimestamp() });
  b.set(P.admin(c, u.uid), { key: nk, at: serverTimestamp() });
  b.delete(P.key(oldKey));
  await b.commit();
  return nk;
}

/* ───────── 구글 시트 ───────── */

export async function getSheet(c) {
  const s = await getDoc(P.sheet(c));
  return s.exists() ? s.data() : null;
}
export const saveSheet = (c, { url, token }) => setDoc(P.sheet(c), { url, token, at: serverTimestamp() });
export const clearSheet = c => deleteDoc(P.sheet(c));

/** 시트로 아직 못 보낸 질문들. */
export async function dirtyQuestions(c) {
  const s = await getDocs(query(P.questions(c), where('sheetDirty', '==', true)));
  return s.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function markClean(c, ids) {
  if (!ids.length) return;
  const b = writeBatch(db);
  ids.forEach(id => b.update(P.question(c, id), { sheetDirty: deleteField() }));
  await b.commit().catch(() => { /* 그새 지워진 질문이 있으면 다음에 다시 보낸다 */ });
}
