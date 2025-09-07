import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID!,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID!,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET!,
};

const app = getApps().length ? getApps()[0]! : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

// apps/mobile/src/firebase.ts
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFunctions, httpsCallable } from "firebase/functions";
import { getFirestore, doc, setDoc, getDoc, updateDoc, arrayUnion } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "<AIzaSyAXGo1H6WVVH-IowOxIbyGkefePzwDrWLg>",
  authDomain: "<your>.firebaseapp.com",
  projectId: "gad-family-us",
  storageBucket: "gad-family-us.appspot.com",
  messagingSenderId: "<SENDER_ID>",
  appId: "<1:589369533264:web:45ee1f599cd532ef8a0255>"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app);

// callable wrappers
export const fn = {
  getTreasuryPublic: httpsCallable(functions, "getTreasuryPublic"),
  getTreasuryStatus: httpsCallable(functions, "getTreasuryStatus"),
  submitDailySteps:  httpsCallable(functions, "submitDailySteps"),
  requestPayout:     httpsCallable(functions, "requestPayout"),
  buildApprove:      httpsCallable(functions, "buildApproveCalldata"),
  registerBirthdate: httpsCallable(functions, "registerBirthdate"),
  verifyAgeByOwner:  httpsCallable(functions, "verifyAgeByOwner"),
  setGeoPreference:  httpsCallable(functions, "setGeoPreference"),
  locationPing:      httpsCallable(functions, "locationPing"),
  setPlace:          httpsCallable(functions, "setPlace"),
  getLocationHistory:httpsCallable(functions, "getLocationHistory"),
};
