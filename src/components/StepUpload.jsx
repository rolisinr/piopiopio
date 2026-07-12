import { useRef, useState } from 'react'
import TelegramSessions from './TelegramSessions'

export default function StepUpload({ photos, setPhotos, setWorkerName, onNext, onBack }) {
  const [mode, setMode] = useState('choose')  // 'choose' | 'manual' | 'telegram'
  const inputRef = useRef()

  const handleFiles = (files) => {
    const newFiles = Array.from(files).filter(f => f.type.startsWith('image/'))
    setPhotos(prev => [...prev, ...newFiles].slice(0, 10))
  }

  const handleDrop = (e) => {
    e.preventDefault()
    handleFiles(e.dataTransfer.files)
  }

  const removePhoto = (i) => setPhotos(p => p.filter((_, idx) => idx !== i))

  // Importar desde Telegram: recibe File[] + session info
  const handleTelegramImport = (files, session) => {
    setPhotos(files)
    if (session?.userName) setWorkerName(session.userName.toUpperCase())
    setMode('manual')
  }

  // ── Pantalla de selección de modo ──
  if (mode === 'choose') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] px-4 space-y-4 max-w-sm mx-auto">
        <div className="text-center space-y-1">
          <div className="text-4xl">📸</div>
          <h2 className="text-lg font-bold text-white">Cargar fotos</h2>
          <p className="text-sm text-gray-400">¿De dónde vienen las fotos?</p>
        </div>

        <button
          onClick={() => setMode('telegram')}
          className="w-full bg-blue-700 hover:bg-blue-600 text-white py-4 rounded-2xl font-semibold text-left px-5 transition-colors"
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">✈️</span>
            <div>
              <p className="font-bold">Desde Telegram</p>
              <p className="text-xs text-blue-300 mt-0.5">El trabajador ya envió sus fotos al bot</p>
            </div>
          </div>
        </button>

        <button
          onClick={() => setMode('manual')}
          className="w-full bg-gray-800 hover:bg-gray-700 text-white py-4 rounded-2xl font-semibold text-left px-5 transition-colors border border-gray-700"
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">📂</span>
            <div>
              <p className="font-bold">Subir manualmente</p>
              <p className="text-xs text-gray-400 mt-0.5">Selecciona fotos desde tu dispositivo</p>
            </div>
          </div>
        </button>

        <button onClick={onBack} className="text-sm text-gray-500 hover:text-gray-300 mt-2">
          ← Atrás
        </button>
      </div>
    )
  }

  // ── Pantalla de Telegram ──
  if (mode === 'telegram') {
    return <TelegramSessions onImport={handleTelegramImport} onCancel={() => setMode('choose')} />
  }

  // ── Pantalla de carga manual ──
  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">Cargar fotos</h2>
          <p className="text-sm text-gray-400">{photos.length}/10 fotos</p>
        </div>
        <button onClick={() => setMode('choose')} className="text-xs text-blue-400 underline">
          Cambiar método
        </button>
      </div>

      {photos.length < 10 && (
        <div
          className="border-2 border-dashed border-gray-700 hover:border-blue-500 rounded-xl p-8 text-center cursor-pointer transition-colors"
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
          onClick={() => inputRef.current.click()}
        >
          <div className="text-3xl mb-2">📸</div>
          <p className="text-gray-300 font-medium">Haz clic o arrastra fotos aquí</p>
          <p className="text-xs text-gray-500 mt-1">Hasta {10 - photos.length} foto(s) más</p>
          <input ref={inputRef} type="file" multiple accept="image/*" className="hidden"
            onChange={e => handleFiles(e.target.files)} />
        </div>
      )}

      {photos.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {photos.map((file, i) => (
            <div key={i} className="relative group rounded-lg overflow-hidden bg-gray-800 aspect-[4/3]">
              <img src={URL.createObjectURL(file)} alt="" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <button onClick={() => removePhoto(i)}
                  className="bg-red-600 hover:bg-red-500 text-white text-xs px-3 py-1.5 rounded-lg">
                  Eliminar
                </button>
              </div>
              <div className="absolute top-2 left-2 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded font-mono">
                #{i+1}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-3">
        <button onClick={() => setMode('choose')}
          className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 py-3 rounded-lg font-medium transition-colors">
          ← Atrás
        </button>
        <button onClick={onNext} disabled={photos.length === 0}
          className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white py-3 rounded-lg font-semibold transition-colors">
          Editar fotos →
        </button>
      </div>
    </div>
  )
}
