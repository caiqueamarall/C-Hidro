// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCAPhG-ttUmigucV8VYlnSmFeoH4Ca_vN0",
  authDomain: "c-hidro.firebaseapp.com",
  projectId: "c-hidro",
  storageBucket: "c-hidro.firebasestorage.app",
  messagingSenderId: "215599932787",
  appId: "1:215599932787:web:3df808582f7cdea1989106",
  measurementId: "G-SE6VFTETYC"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Analytics safely
let analytics;
if (typeof window !== 'undefined') {
  analytics = getAnalytics(app);
}

// Initialize Firestore
export const db = getFirestore(app);
export default app;
