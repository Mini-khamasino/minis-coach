import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'
import { initializeFirestore, persistentLocalCache } from 'firebase/firestore'

// Same project and same sign-in setup as the Islam app (popup via the project's default auth domain).
const app = initializeApp({
  apiKey: 'AIzaSyAMibcjnnOckNgL-kUG3mPpdTVff3fFBpU',
  authDomain: 'sirr-sibhah-67e7a.firebaseapp.com',
  projectId: 'sirr-sibhah-67e7a',
  storageBucket: 'sirr-sibhah-67e7a.firebasestorage.app',
  messagingSenderId: '556563100288',
  appId: '1:556563100288:web:b6d22bbd55b16653786c65',
})

export const auth = getAuth(app)
export const googleProvider = new GoogleAuthProvider()
// persistent cache = Firestore keeps queued writes across reloads while offline
export const fs = initializeFirestore(app, { ignoreUndefinedProperties: true, localCache: persistentLocalCache() })
