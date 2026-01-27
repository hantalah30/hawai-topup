// Import Firebase SDK (menggunakan CDN untuk GitHub Pages)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- PASTE KONFIGURASI DARI FIREBASE CONSOLE DI SINI ---
const firebaseConfig = {
  apiKey: "AIzaSyChS2qfigGgLHe4R_sBsg4nlCpUKzYbERg",
  authDomain: "topup-b14db.firebaseapp.com",
  projectId: "topup-b14db",
  storageBucket: "topup-b14db.firebasestorage.app",
  messagingSenderId: "839860488721",
  appId: "1:839860488721:web:168a0eb5c5185b40a37fb0",
};

// Initialize Firebase
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
} else {
  firebase.app(); // if already initialized
}

const db = firebase.firestore();
console.log("Firebase berhasil terhubung!");
// Export agar bisa dipakai di file lain
export { db, collection, getDocs, doc, setDoc, getDoc, updateDoc, deleteDoc };
