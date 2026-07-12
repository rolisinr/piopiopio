// URL del backend en Render — se actualiza cuando tengas la URL real
const BASE = import.meta.env.VITE_BACKEND_URL || 'https://anexo-backend.onrender.com'

/**
 * Escucha sesiones activas con polling cada 5 segundos.
 * @param {Function} callback - recibe array de sesiones
 * @returns {Function} stop - para dejar de escuchar
 */
export function listenSessions(callback) {
  let active = true

  const poll = async () => {
    try {
      const res  = await fetch(`${BASE}/sessions`)
      const data = await res.json()
      callback(data)
    } catch (err) {
      console.warn('Error al obtener sesiones:', err.message)
    }
    if (active) setTimeout(poll, 5000)
  }

  poll() // primera llamada inmediata
  return () => { active = false }
}

/**
 * Escucha las fotos de una sesión con polling cada 4 segundos.
 */
export function listenSessionPhotos(chatId, callback) {
  let active = true

  const poll = async () => {
    try {
      const res  = await fetch(`${BASE}/session/${chatId}/photos`)
      const data = await res.json()
      callback(data)
    } catch (err) {
      console.warn('Error al obtener fotos:', err.message)
    }
    if (active) setTimeout(poll, 4000)
  }

  poll()
  return () => { active = false }
}

/**
 * Envía documentos al chat de Telegram del trabajador.
 */
export async function sendDocumentsToTelegram(chatId, documents) {
  const res = await fetch(`${BASE}/send-documents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatId, documents }),
  })
  return res.json()
}

/**
 * Convierte un Blob a base64.
 */
export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = () => resolve(reader.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}
