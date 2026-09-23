import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyDKEfFy5PoECWdjn3VjKzTDUpiaZnRY7Vo",
  authDomain: "class-tracker-5dcd7.firebaseapp.com",
  projectId: "class-tracker-5dcd7",
  storageBucket: "class-tracker-5dcd7.firebasestorage.app",
  messagingSenderId: "901995571817",
  appId: "1:901995571817:web:e48de4406061b2226e50f8"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
