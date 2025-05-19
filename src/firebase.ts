import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDgDwEj_UvQ8fFuuqlTYUaisSG0cMd96nU",
  authDomain: "instrument-schedule.firebaseapp.com",
  projectId: "instrument-schedule",
  storageBucket: "instrument-schedule.appspot.com",
  messagingSenderId: "614135566785",
  appId: "1:614135566785:web:d613c55b849a191b8d1f40",
  measurementId: "G-9D8NWJ27GX"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
