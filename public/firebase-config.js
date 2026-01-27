// public/firebase-config.js

// 1. Config Firebase (Ambil dari Firebase Console -> Project Settings)
const firebaseConfig = {
  apiKey: "AIzaSyChS2qfigGgLHe4R_sBsg4nlCpUKzYbERg",
  authDomain: "topup-b14db.firebaseapp.com",
  projectId: "topup-b14db",
  storageBucket: "topup-b14db.firebasestorage.app",
  messagingSenderId: "839860488721",
  appId: "1:839860488721:web:168a0eb5c5185b40a37fb0",
};

// 2. Inisialisasi Firebase (Hanya jika belum ada)
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
  console.log("🔥 Firebase Client Initialized");
}
