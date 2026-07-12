import { useState, useEffect } from 'react'
import { listenSessions, listenSessionPhotos } from '../lib/telegramApi'

const BACKEND = 'https://anexo-backend.onrender.com'

// Convierte URL de Telegram a URL del proxy
function proxyUrl(url) {
  if (!url) return ''
  if (url.includes('api.telegram.org')) {
    return `${BACKEND}/photo?url=${encodeURIComponent(url)}`
  }
  return url // Google Drive u otras URLs directas
}

export default function TelegramSessions({ onImport, onCancel }) {
  const [sessions,  setSessions]  = useState([])
  const [selected,  setSelected]  = useState(null)
  const [photos,    setPhotos]    = useState([])
  const [loading,   setLoading]   = useState(true)
  const [importing, setImporting] = useState(false)

  useEffect(() => {
    const unsub = listenSessions(data => {
      setSessions(data)
      setLoading(false)
    })
    return () => unsub()
  }, [])

  useEffect(() => {
    if (!selected) { setPhotos([]); return }
    const unsub = listenSessionPhotos(selected, setPhotos)
    return () => unsub()
  }, [selected])

  const handleImport = async () => {
    if (!photos.length) return
    setImporting(true)
    try {
      const files = await Promise.all(
        photos.map(async (p, i) => {
          const url  = proxyUrl(p.url)
          const res  = await fetch(url)
          const blob = await res.blob()
          return new File([blob], p.fileName || `foto_${i + 1}.jpg`, { type: 'image/jpeg' })
        })
      )
      const session = sessions.find(s => s.chatId === selected || s.id === selected)
      onImport(files, session)
    } catch (err) {
      console.error('Import error:', err)
      alert('Error al importar fotos. Intenta de nuevo.')
    } finally {
      setImporting(false)
    }
  }

  const formatTime = (ts) => {
    if (!ts) return ''
    const d = new Date(typeof ts === 'object' ? ts.seconds * 1000 : ts)
    return d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">📱 Fotos de Telegram</h2>
          <p className="text-xs text-gray-400 mt-0.5">Selecciona un trabajador para cargar sus fotos</p>
        </div>
        <button onClick={onCancel} className="text-gray-500 hover:text-gray-300 text-sm">✕</button>
      </div>

      <div className="flex items-center gap-2 bg-green-900/20 border border-green-800 rounded-xl px-4 py-2">
        <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"/>
        <span className="text-xs text-green-400">En tiempo real — las fotos aparecen al instante</span>
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-500">Cargando sesiones...</div>
      ) : sessions.length === 0 ? (
        <div className="text-center py-8 space-y-3">
          <div className="text-4xl">📭</div>
          <p className="text-gray-400 text-sm">Ningún trabajador ha enviado fotos aún</p>
          <p className="text-gray-500 text-xs">Diles que escriban /start al bot de Telegram</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sessions.map(session => {
            const sid = session.chatId || session.id
            const isSelected = selected === sid
            return (
              <button key={sid} onClick={() => setSelected(isSelected ? null : sid)}
                className={`w-full text-left rounded-xl border-2 p-4 transition-all ${
                  isSelected ? 'border-blue-500 bg-blue-900/20' : 'border-gray-700 bg-gray-900 hover:border-gray-600'
                }`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-white">{session.userName || 'Usuario'}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {session.photoCount || 0} foto(s)
                      {session.ready && ' · ✅ Listo'}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      session.processed ? 'bg-gray-800 text-gray-500' :
                      session.ready ? 'bg-green-900/50 text-green-400' :
                      'bg-yellow-900/50 text-yellow-400'
                    }`}>
                      {session.processed ? 'Procesado' : session.ready ? 'Listo' : 'Enviando...'}
                    </span>
                    <p className="text-xs text-gray-600 mt-1">{formatTime(session.lastActivity)}</p>
                  </div>
                </div>

                {/* Miniaturas */}
                {isSelected && (
                  <div className="mt-3">
                    {photos.length === 0 ? (
                      <p className="text-xs text-gray-500 animate-pulse">Cargando fotos...</p>
                    ) : (
                      <div className="flex gap-2 overflow-x-auto pb-1" onClick={e => e.stopPropagation()}>
                        {photos.map((p, i) => (
                          <div key={p.id || i} className="flex-shrink-0 relative">
                            <img
                              src={proxyUrl(p.url)}
                              alt=""
                              className="w-16 h-16 object-cover rounded-lg border border-gray-700"
                              onError={e => { e.target.style.background='#374151'; e.target.alt='📷' }}
                            />
                            <span className="absolute top-0.5 left-0.5 bg-black/60 text-white text-xs px-1 rounded">
                              {i + 1}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      )}

      {selected && photos.length > 0 && (
        <button onClick={handleImport} disabled={importing}
          className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white py-3 rounded-xl font-semibold transition-colors">
          {importing ? `Importando ${photos.length} fotos...` : `⬇ Importar ${photos.length} foto(s) al editor`}
        </button>
      )}

      <button onClick={onCancel}
        className="w-full bg-gray-800 hover:bg-gray-700 text-gray-300 py-3 rounded-xl font-medium transition-colors">
        ← Volver a carga manual
      </button>
    </div>
  )
}
