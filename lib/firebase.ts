import { getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDbLAfLOTY05ylWJbGm1cYM74mEKwAXAUc",
  authDomain: "hawktrack-v2.firebaseapp.com",
  projectId: "hawktrack-v2",
  storageBucket: "hawktrack-v2.firebasestorage.app",
  messagingSenderId: "471747502837",
  appId: "1:471747502837:web:28cd2c6db13e60883b5bbc",
};

const app =
  getApps().length === 0
    ? initializeApp(firebaseConfig)
    : getApps()[0];

export const auth = getAuth(app);
export const db = getFirestore(app);