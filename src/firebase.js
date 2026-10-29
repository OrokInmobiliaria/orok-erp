import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyABG2ccMD_506AJQxn90H5J8gnim3BUuAo",
  authDomain: "crm-infinity224.firebaseapp.com",
  projectId: "crm-infinity224",
  storageBucket: "crm-infinity224.firebasestorage.app",
  messagingSenderId: "990141362743",
  appId: "1:990141362743:web:e4865d1136845bbfd085b2",
  measurementId: "G-Y41K7P2WT0"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
