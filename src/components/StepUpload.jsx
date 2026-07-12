import { useRef } from 'react'

export default function StepUpload({ photos, setPhotos, onNext, onBack }) {
  const inputRef = useRef()

  const handleFiles = (files) => {
    const newFiles = Array.from(files).filter(f => f.type.startsWith('image/'))
    const combined = [...photos, ...newFiles].slice(0, 10)
    setPhotos(combined)
  }

  const removePhoto = (i) => setPhotos(photos.filter((_, idx) => idx !== i))

  const handleDrop = (e) => {
    e.preventDefault()
    handleFiles(e.dataTransfer.files)
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-bold text-white">Cargar fotos</h2>
        <p className="text-sm text-gray-400">{photos.length}/10 fotos cargadas</p>
      </div>

      {/* Drop zone */}
      {photos.length < 10 && (
        <div
          className="border-2 border-dashed border-gray-700 hover:border-blue-500 rounded-xl p-8 text-center cursor-pointer transition-colors"
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
          onClick={() => inputRef.current.click()}
        >
          <div className="text-3xl mb-2">📸</div>
          <p className="text-gray-300 font-medium">Haz clic o arrastra fotos aquí</p>
          <p className="text-xs text-gray-500 mt-1">Puedes subir hasta {10 - photos.length} foto(s) más</p>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="image/*"
            className="hidden"
            onChange={e => handleFiles(e.target.files)}
          />
        </div>
      )}

      {/* Grid de fotos */}
      {photos.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {photos.map((file, i) => (
            <div key={i} className="relative group rounded-lg overflow-hidden bg-gray-800 aspect-[4/3]">
              <img
                src={URL.createObjectURL(file)}
                alt={`Foto ${i + 1}`}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <button
                  onClick={() => removePhoto(i)}
                  className="bg-red-600 hover:bg-red-500 text-white text-xs px-3 py-1.5 rounded-lg font-medium"
                >
                  Eliminar
                </button>
              </div>
              <div className="absolute top-2 left-2 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded font-mono">
                #{i + 1}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Acciones */}
      <div className="flex gap-3 pt-2">
        <button onClick={onBack} className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 py-3 rounded-lg font-medium transition-colors">
          ← Atrás
        </button>
        <button
          onClick={onNext}
          disabled={photos.length === 0}
          className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white py-3 rounded-lg font-semibold transition-colors"
        >
          Editar fotos →
        </button>
      </div>
    </div>
  )
}
