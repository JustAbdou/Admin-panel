import { initializeApp } from "firebase/app";
import { 
  getFirestore, 
  enableNetwork,
  disableNetwork,
  clearIndexedDbPersistence,
} from "firebase/firestore";
import { 
  getAuth
} from "firebase/auth";
import { 
  getStorage
} from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyBYv2mXBoG331ihDQobE4JGv6hqCZxFd84",
  authDomain: "chefflow-c8581.firebaseapp.com",
  projectId: "chefflow-c8581",
  storageBucket: "chefflow-c8581.firebasestorage.app",
  messagingSenderId: "461434725803",
  appId: "1:461434725803:web:b18a455453fd8343cadeee",
  measurementId: "G-Q3B29F6JN3"
};

const app = initializeApp(firebaseConfig);

// Secondary app for creating users without auto-login
const secondaryApp = initializeApp(firebaseConfig, 'secondary');

export const auth = getAuth(app);
export const secondaryAuth = getAuth(secondaryApp);

export const db = getFirestore(app);

export const storage = getStorage(app);

export const resetFirestoreConnection = async () => {
  try {
    console.log('Resetting Firestore connection...');
    await disableNetwork(db);
    await enableNetwork(db);
    console.log('Firestore connection reset successfully');
  } catch (error) {
    console.error('Error resetting Firestore connection:', error);
  }
};

export const clearFirestoreCache = async () => {
  try {
    console.log('Clearing Firestore cache...');
    await clearIndexedDbPersistence(db);
    console.log('Firestore cache cleared successfully');
  } catch (error: any) {
    console.warn('Could not clear Firestore cache (this is normal if no cache exists):', error.message);
  }
};

if (process.env.NODE_ENV === 'development') {
  console.log('Firebase initialized in development mode');
  console.log('Project ID:', firebaseConfig.projectId);
}
