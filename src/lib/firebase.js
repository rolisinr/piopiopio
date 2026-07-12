import { initializeApp } from 'firebase/app'
import { getFirestore, collection, onSnapshot, query, where, orderBy, getDocs } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: 'AIzaSyDxBctNn4KHcbtn6mVW5E_LbMq3OYLhTC8',
  authDomain: 'anexo-app.firebaseapp.com',
  projectId: 'anexo-app',
  storageBucket: 'anexo-app.firebasestorage.app',
  messagingSenderId: '402088438906',
  appId: '1:402088438906:web:33c155546d5f95ea231fc3',
}

const app = initializeApp(firebaseConfig)
const db  = getFirestore(app)

const FUNCTIONS_BASE = 'https://us-central1-anexo-app.cloudfunctions.net'

/**
 * Escucha en tiempo real las sesiones activas de Telegram.
 * @param {Function} callback - recibe array de sesiones
 * @returns {Function} unsubscribe
 */
export function listenSessions(callback) {
  const q = query(
    collection(db, 'sessions'),
    where('active', '==', true),
    orderBy('lastActivity', 'desc')
  )
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  })
}

/**
 * Escucha las fotos de una sesión en tiempo real.
 */
export function listenSessionPhotos(chatId, callback) {
  const q = query(
    collection(db, 'sessions', chatId, 'photos'),
    orderBy('receivedAt', 'asc')
  )
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  })
}

/**
 * Envía los documentos generados al chat de Telegram del trabajador.
 */
export async function sendDocumentsToTelegram(chatId, documents) {
  const res = await fetch(`${FUNCTIONS_BASE}/sendDocuments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatId, documents }),
  })
  return res.json()
}

/**
 * Convierte un Blob a base64 string.
 */
export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = () => resolve(reader.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}
