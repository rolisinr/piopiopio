import { useState, useEffect } from 'react'
import { listenSessions, listenSessionPhotos } from '../lib/telegramApi'

/**
 * Pantalla para cargar fotos desde una sesión de Telegram.
 * El usuario selecciona un trabajador → ve sus fotos → las importa a la PWA.
 */
export default function TelegramSessions({ onImport, onCancel }) {
  const [sessions, setSessions]       = useState([])
  const [selected, setSelected]       = useState(null)   // chatId
  const [photos,   setPhotos]         = useState([])
  const [loading,  setLoading]        = useState(true)
  const [importing, setImporting]     = useState(false)

  // Escuchar sesiones activas en tiempo real
  useEffect(() => {
    const unsub = listenSessions(data => {
      setSessions(data)
      setLoading(false)
    })
    return () => unsub()
  }, [])

  // Escuchar fotos de la sesión seleccionada
  useEffect(() => {
    if (!selected) { setPhotos([]); return }
    const unsub = listenSessionPhotos(selected, setPhotos)
    return () => unsub()
  }, [selected])

  const handleImport = async () => {
    if (!photos.length) return
    setImporting(true)
    try {
      // Descargar cada foto y convertirla a File
      const files = await Promise.all(
        photos.map(async (p, i) => {
          const res  = await fetch(p.url)
          const blob = await res.blob()
          return new File([blob], p.fileName || `foto_${i+1}.jpg`, { type: 'image/jpeg' })
        })
      )
      const session = sessions.find(s => s.id === selected)
      onImport(files, session)
    } catch (err) {
      console.error('Import error:', err)
      alert('Error al importar fotos. Intenta de nuevo.')
    } finally {
      setImporting(false)
    }
  }

  const formatTime = (ts) => {
    if (!ts?.seconds) return ''
    const d = new Date(ts.seconds * 1000)
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

      {/* Estado de conexión */}
      <div className="flex items-center gap-2 bg-green-900/20 border border-green-800 rounded-xl px-4 py-2">
        <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"/>
        <span className="text-xs text-green-400">En tiempo real — las fotos aparecen al instante</span>
      </div>

      {/* Lista de sesiones */}
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
          {sessions.map(session => (
            <button
              key={session.id}
              onClick={() => setSelected(selected === session.id ? null : session.id)}
              className={`w-full text-left rounded-xl border-2 p-4 transition-all ${
                selected === session.id
                  ? 'border-blue-500 bg-blue-900/20'
                  : 'border-gray-700 bg-gray-900 hover:border-gray-600'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-white">{session.userName}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {session.photoCount || 0} foto(s)
                    {session.ready && ' · ✅ Listo'}
                    {session.processed && ' · 📤 Procesado'}
                  </p>
                </div>
                <div className="text-right">
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    session.ready ? 'bg-green-900/50 text-green-400' :
                    session.processed ? 'bg-gray-800 text-gray-500' :
                    'bg-yellow-900/50 text-yellow-400'
                  }`}>
                    {session.processed ? 'Procesado' : session.ready ? 'Listo' : 'Enviando...'}
                  </span>
                  <p className="text-xs text-gray-600 mt-1">{formatTime(session.lastActivity)}</p>
                </div>
              </div>

              {/* Miniaturas de fotos si está seleccionado */}
              {selected === session.id && photos.length > 0 && (
                <div className="mt-3 flex gap-2 overflow-x-auto pb-1" onClick={e => e.stopPropagation()}>
                  {photos.map((p, i) => (
                    <div key={p.id} className="flex-shrink-0 relative">
                      <img src={p.url} alt=""
                        className="w-16 h-16 object-cover rounded-lg border border-gray-700"/>
                      <span className="absolute top-0.5 left-0.5 bg-black/60 text-white text-xs px-1 rounded">
                        {i+1}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {selected === session.id && photos.length === 0 && (
                <p className="mt-2 text-xs text-gray-500 animate-pulse">Esperando fotos...</p>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Botón importar */}
      {selected && photos.length > 0 && (
        <button
          onClick={handleImport}
          disabled={importing}
          className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white py-3 rounded-xl font-semibold transition-colors"
        >
          {importing
            ? `Importando ${photos.length} fotos...`
            : `⬇ Importar ${photos.length} foto(s) al editor`}
        </button>
      )}

      <button onClick={onCancel}
        className="w-full bg-gray-800 hover:bg-gray-700 text-gray-300 py-3 rounded-xl font-medium transition-colors">
        ← Volver a carga manual
      </button>
    </div>
  )
}
