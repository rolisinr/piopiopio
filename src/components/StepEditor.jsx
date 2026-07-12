import { useState, useEffect, useRef, useCallback } from 'react'
import { readExifDateTime } from '../lib/exifReader'
import { renderPhoto, loadImage } from '../lib/photoEditor'

const SLOT_WIDTH = 320   // px para preview (proporcional a 9.22cm)
const OUTPUT_WIDTH = 544  // px para el Word (9.22cm a ~150dpi)

export default function StepEditor({ rawPhotos, editedPhotos, setEditedPhotos, workerName, onNext, onBack }) {
  const [current, setCurrent] = useState(0)
  const [overlays, setOverlays] = useState(() =>
    rawPhotos.map(() => ({ datetime: '', name: workerName, extra: '' }))
  )
  const [heightScales, setHeightScales] = useState(() => rawPhotos.map(() => 1.0))
  const [crops, setCrops] = useState(() => rawPhotos.map(() => null))
  const [previews, setPreviews] = useState(() => rawPhotos.map(() => null))
  const [loadedImgs, setLoadedImgs] = useState([])
  const [isRendering, setIsRendering] = useState(false)
  const [cropMode, setCropMode] = useState(false)
  const [cropStart, setCropStart] = useState(null)
  const [cropRect, setCropRect] = useState(null)
  const canvasRef = useRef()
  const previewRef = useRef()
  const renderTimerRef = useRef()

  // Cargar imágenes y leer EXIF
  useEffect(() => {
    Promise.all(rawPhotos.map(f => loadImage(f))).then(setLoadedImgs)

    rawPhotos.forEach(async (f, i) => {
      const exif = await readExifDateTime(f)
      if (exif) {
        setOverlays(prev => {
          const next = [...prev]
          next[i] = { ...next[i], datetime: exif.formatted }
          return next
        })
      }
    })
  }, [])

  const photo = rawPhotos[current]
  const img = loadedImgs[current]
  const overlay = overlays[current] || { datetime: '', name: workerName, extra: '' }
  const heightScale = heightScales[current] || 1.0
  const crop = crops[current]

  // Calcular crop efectivo
  const effectiveCrop = useCallback(() => {
    if (!img) return null
    if (crop) return crop
    return { x: 0, y: 0, width: img.naturalWidth, height: img.naturalHeight }
  }, [img, crop])

  // Re-renderizar preview cuando cambian parámetros
  useEffect(() => {
    if (!img) return
    clearTimeout(renderTimerRef.current)
    renderTimerRef.current = setTimeout(async () => {
      setIsRendering(true)
      try {
        const c = effectiveCrop()
        const blob = await renderPhoto(img, c, heightScale, overlay, OUTPUT_WIDTH)
        const url = URL.createObjectURL(blob)
        setPreviews(prev => {
          const next = [...prev]
          if (prev[current]) URL.revokeObjectURL(prev[current])
          next[current] = url
          return next
        })
        // Guardar blob editado
        setEditedPhotos(prev => {
          const next = [...prev]
          next[current] = { file: photo, blob, overlay, heightScale, crop: c }
          return next
        })
      } finally {
        setIsRendering(false)
      }
    }, 400)
  }, [img, overlay, heightScale, crop, current])

  const updateOverlay = (key, val) => {
    setOverlays(prev => {
      const next = [...prev]
      next[current] = { ...next[current], [key]: val }
      return next
    })
  }

  const setHeightScale = (val) => {
    setHeightScales(prev => {
      const next = [...prev]
      next[current] = val
      return next
    })
  }

  const resetCrop = () => {
    setCrops(prev => {
      const next = [...prev]
      next[current] = null
      return next
    })
    setCropMode(false)
    setCropRect(null)
  }

  const applyProporcional = () => {
    setHeightScale(1.0)
  }

  const applyRellenar = () => {
    if (!img) return
    const c = effectiveCrop()
    const naturalRatio = c.height / c.width
    // Ajustar para que la altura equivalga a la mayor de las fotos del par (placeholder: 0.75)
    const targetRatio = 0.75
    setHeightScale(targetRatio / naturalRatio)
  }

  // Lógica de recorte en canvas
  const handleCanvasMouseDown = (e) => {
    if (!cropMode || !img) return
    const rect = e.currentTarget.getBoundingClientRect()
    setCropStart({ x: e.clientX - rect.left, y: e.clientY - rect.top })
    setCropRect(null)
  }

  const handleCanvasMouseMove = (e) => {
    if (!cropMode || !cropStart) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    setCropRect({ x: Math.min(cropStart.x, x), y: Math.min(cropStart.y, y), w: Math.abs(x - cropStart.x), h: Math.abs(y - cropStart.y) })
  }

  const handleCanvasMouseUp = (e) => {
    if (!cropMode || !cropStart || !img || !cropRect) return
    // Convertir coordenadas de preview a coordenadas de imagen real
    const previewEl = e.currentTarget
    const scaleX = img.naturalWidth / previewEl.offsetWidth
    const scaleY = img.naturalHeight / previewEl.offsetHeight
    const newCrop = {
      x: Math.round(cropRect.x * scaleX),
      y: Math.round(cropRect.y * scaleY),
      width: Math.max(10, Math.round(cropRect.w * scaleX)),
      height: Math.max(10, Math.round(cropRect.h * scaleY)),
    }
    setCrops(prev => {
      const next = [...prev]
      next[current] = newCrop
      return next
    })
    setCropMode(false)
    setCropStart(null)
    setCropRect(null)
  }

  const allDone = rawPhotos.length > 0 && editedPhotos.filter(Boolean).length === rawPhotos.length

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">Editor de fotos</h2>
        <span className="text-sm text-gray-400">{current + 1} / {rawPhotos.length}</span>
      </div>

      {/* Miniaturas de navegación */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {rawPhotos.map((f, i) => (
          <button
            key={i}
            onClick={() => setCurrent(i)}
            className={`flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden border-2 transition-all ${
              i === current ? 'border-blue-500' :
              editedPhotos[i] ? 'border-green-600' :
              'border-gray-700'
            }`}
          >
            <img src={previews[i] || URL.createObjectURL(f)} alt="" className="w-full h-full object-cover" />
          </button>
        ))}
      </div>

      {/* Preview principal */}
      <div className="relative bg-gray-900 rounded-xl overflow-hidden">
        {img && (
          <div
            className={`relative select-none ${cropMode ? 'cursor-crosshair' : 'cursor-default'}`}
            onMouseDown={handleCanvasMouseDown}
            onMouseMove={handleCanvasMouseMove}
            onMouseUp={handleCanvasMouseUp}
          >
            <img
              src={previews[current] || URL.createObjectURL(photo)}
              alt="Preview"
              className="w-full max-h-72 object-contain"
            />
            {/* Overlay de recorte */}
            {cropMode && cropRect && (
              <div
                className="absolute border-2 border-blue-400 bg-blue-400/10 pointer-events-none"
                style={{ left: cropRect.x, top: cropRect.y, width: cropRect.w, height: cropRect.h }}
              />
            )}
            {isRendering && (
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                <span className="text-sm text-gray-300">Procesando...</span>
              </div>
            )}
          </div>
        )}

        {/* Indicador de slot */}
        <div className="absolute top-2 right-2 bg-black/60 text-xs text-gray-300 px-2 py-1 rounded">
          Ancho: 9.22 cm fijo
        </div>
      </div>

      {/* Controles de recorte */}
      <div className="bg-gray-900 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-300">✂️ Recorte</span>
          <div className="flex gap-2">
            <button
              onClick={() => { setCropMode(!cropMode); setCropRect(null) }}
              className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${
                cropMode ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {cropMode ? 'Cancelar' : 'Activar recorte'}
            </button>
            {crop && (
              <button onClick={resetCrop} className="text-xs px-3 py-1.5 rounded-lg bg-gray-700 text-gray-300 hover:bg-gray-600">
                Resetear
              </button>
            )}
          </div>
        </div>
        {cropMode && <p className="text-xs text-blue-400">Arrastra sobre la imagen para seleccionar el área</p>}
        {crop && <p className="text-xs text-green-400">Recorte aplicado: {crop.width}×{crop.height}px</p>}
      </div>

      {/* Slider de altura */}
      <div className="bg-gray-900 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-300">↕️ Altura</span>
          <span className="text-xs text-gray-400 font-mono">{Math.round(heightScale * 100)}%</span>
        </div>
        <input
          type="range"
          min={0.5}
          max={2.0}
          step={0.02}
          value={heightScale}
          onChange={e => setHeightScale(parseFloat(e.target.value))}
          className="w-full accent-blue-500"
        />
        <div className="flex gap-2">
          <button onClick={applyProporcional} className="flex-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 py-1.5 rounded-lg transition-colors">
            Proporcional
          </button>
          <button onClick={applyRellenar} className="flex-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 py-1.5 rounded-lg transition-colors">
            Rellenar (4:3)
          </button>
        </div>
      </div>

      {/* Overlay de texto */}
      <div className="bg-gray-900 rounded-xl p-4 space-y-3">
        <span className="text-sm font-medium text-gray-300">🕐 Texto estampado</span>
        <div className="space-y-2">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Fecha y hora</label>
            <input
              value={overlay.datetime}
              onChange={e => updateOverlay('datetime', e.target.value)}
              placeholder="Ej: 12 jul 2026 10:28:47 a.m."
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 font-mono"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Nombre</label>
            <input
              value={overlay.name}
              onChange={e => updateOverlay('name', e.target.value.toUpperCase())}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 font-mono uppercase"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Texto adicional</label>
            <input
              value={overlay.extra}
              onChange={e => updateOverlay('extra', e.target.value)}
              placeholder="Ej: Turno noche, ubicación, etc."
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Navegación entre fotos */}
      <div className="flex gap-2">
        <button onClick={() => setCurrent(c => Math.max(0, c - 1))} disabled={current === 0}
          className="flex-1 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-gray-300 py-2.5 rounded-lg text-sm transition-colors">
          ← Anterior
        </button>
        <button onClick={() => setCurrent(c => Math.min(rawPhotos.length - 1, c + 1))} disabled={current === rawPhotos.length - 1}
          className="flex-1 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-gray-300 py-2.5 rounded-lg text-sm transition-colors">
          Siguiente →
        </button>
      </div>

      {/* Acciones principales */}
      <div className="flex gap-3">
        <button onClick={onBack} className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 py-3 rounded-lg font-medium transition-colors">
          ← Atrás
        </button>
        <button
          onClick={onNext}
          className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-lg font-semibold transition-colors"
        >
          Asignar a Anexos →
        </button>
      </div>
    </div>
  )
}
