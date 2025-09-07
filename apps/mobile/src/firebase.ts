import 'react-native-get-random-values';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, initializeAuth, getReactNativePersistence } from 'firebase/auth';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ⚠️ Вставь свои web-конфиги из Firebase Console
const firebaseConfig = {
  apiKey: 'YOUR_API_KEY',
  authDomain: 'YOUR_PROJECT_ID.firebaseapp.com',
  projectId: 'YOUR_PROJECT_ID',
  storageBucket: 'YOUR_PROJECT_ID.appspot.com',
  messagingSenderId: 'YOUR_SENDER_ID',
  appId: 'YOUR_APP_ID',
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

// Auth с персистенсом под React Native
const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});

// Клиенты
const db = getFirestore(app);
const functions = getFunctions(app);

// Подключение к эмуляторам (если они запущены локально)
if (__DEV__) {
  // Firestore (опционально, если используешь локально)
  connectFirestoreEmulator(db, 'localhost', 8080);
  // Functions — у нас в firebase.json порт 5001
  connectFunctionsEmulator(functions, 'localhost', 5001);
}

export { app, auth, db, functions };
