// Firebase 연결. 다른 파일은 Firebase 를 여기서만 가져다 쓴다(판을 바꿀 때 한 곳만 고치면 된다).
import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getFirestore, doc, collection, getDoc, getDocs, setDoc, updateDoc, addDoc, deleteDoc,
  onSnapshot, query, where, writeBatch, serverTimestamp, deleteField, FieldPath
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { getAuth, signInAnonymously } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';

/** 설정값을 아직 안 붙여 넣었으면 false. 이때는 아무 데도 연결하지 않는다. */
export const configured = !Object.values(firebaseConfig).some(v => String(v).includes('여기에'));

const app = configured ? initializeApp(firebaseConfig) : null;
export const db = app ? getFirestore(app) : null;
const auth = app ? getAuth(app) : null;

/** 눈에 보이지 않는 익명 로그인. 교사 화면과 설치 화면만 쓴다. */
export async function signIn() {
  if (auth.currentUser) return auth.currentUser;
  return (await signInAnonymously(auth)).user;
}

export {
  doc, collection, getDoc, getDocs, setDoc, updateDoc, addDoc, deleteDoc,
  onSnapshot, query, where, writeBatch, serverTimestamp, deleteField, FieldPath
};
