import { useState, useEffect, useRef, useCallback } from 'react'
import { readExifDateTime } from '../lib/exifReader'
import { renderPhotoFixed, loadImage } from '../lib/photoEditor'

// Dimensiones fijas del slot en px de salida (150 DPI)
// 9.22 cm × 150/2.54 = 544px  |  12.43 cm × 150/2.54 = 733px
export const SLOT_W = 544
export const SLOT_H = 733

export default function StepEditor({ rawPhotos, editedPhotos, setEditedPhotos, workerName, onNext, onBack }) {
  const [current, setCurrent]       = useState(0)
  const [overlays, setOverlays]     = useState(() => rawPhotos.map(() => ({ datetime: '', name: workerName, extra: '' })))
  const [states, setStates]         = useState(() => rawPhotos.map(() => ({ scale: 1, offsetX: 0, offsetY: 0 })))
  const [previews, setPreviews]     = useState(() => rawPhotos.map(() => null))
  const [loadedImgs, setLoadedImgs] = useState([])
  const [isRendering, setIsRendering] = useState(false)

  const frameRef    = useRef()
  const renderTimer = useRef()
  const dragState   = useRef(null)  // { startX, startY, startOX, startOY }
  const pinchState  = useRef(null)  // { startDist, startScale }

  // Cargar imágenes + leer EXIF
  useEffect(() => {
    Promise.all(rawPhotos.map(f => loadImage(f))).then(imgs => {
      setLoadedImgs(imgs)
      // Inicializar escala para cubrir el slot (cover)
      setStates(imgs.map(img => {
        const scaleX = SLOT_W / img.naturalWidth
        const scaleY = SLOT_H / img.naturalHeight
        const scale  = Math.max(scaleX, scaleY)
        return { scale, offsetX: 0, offsetY: 0 }
      }))
    })
    rawPhotos.forEach(async (f, i) => {
      const exif = await readExifDateTime(f)
      if (exif) setOverlays(prev => { const n=[...prev]; n[i]={...n[i], datetime: exif.formatted}; return n })
    })
  }, [])

  const img     = loadedImgs[current]
  const overlay = overlays[current] || { datetime: '', name: workerName, extra: '' }
  const state   = states[current]   || { scale: 1, offsetX: 0, offsetY: 0 }

  // Re-renderizar cuando cambian parámetros
  useEffect(() => {
    if (!img || !state) return
    clearTimeout(renderTimer.current)
    renderTimer.current = setTimeout(async () => {
      setIsRendering(true)
      try {
        const blob = await renderPhotoFixed(img, state, overlay, SLOT_W, SLOT_H)
        const url  = URL.createObjectURL(blob)
        setPreviews(prev => { const n=[...prev]; if(prev[current]) URL.revokeObjectURL(prev[current]); n[current]=url; return n })
        setEditedPhotos(prev => { const n=[...prev]; n[current]={ file: rawPhotos[current], blob, overlay, state }; return n })
      } finally { setIsRendering(false) }
    }, 300)
  }, [img, state, overlay, current])

  const updateState = (patch) => setStates(prev => { const n=[...prev]; n[current]={...n[current],...patch}; return n })
  const updateOverlay = (key, val) => setOverlays(prev => { const n=[...prev]; n[current]={...n[current],[key]:val}; return n })

  // --- Drag (mouse) ---
  const onMouseDown = (e) => {
    e.preventDefault()
    dragState.current = { startX: e.clientX, startY: e.clientY, startOX: state.offsetX, startOY: state.offsetY }
  }
  const onMouseMove = (e) => {
    if (!dragState.current) return
    const dx = e.clientX - dragState.current.startX
    const dy = e.clientY - dragState.current.startY
    const display = frameRef.current
    if (!display) return
    const scaleDisplay = display.offsetWidth / SLOT_W
    updateState({ offsetX: dragState.current.startOX + dx / scaleDisplay, offsetY: dragState.current.startOY + dy / scaleDisplay })
  }
  const onMouseUp = () => { dragState.current = null }

  // --- Drag (touch) ---
  const onTouchStart = (e) => {
    if (e.touches.length === 1) {
      const t = e.touches[0]
      dragState.current = { startX: t.clientX, startY: t.clientY, startOX: state.offsetX, startOY: state.offsetY }
    } else if (e.touches.length === 2) {
      const dist = getTouchDist(e.touches)
      pinchState.current = { startDist: dist, startScale: state.scale }
      dragState.current = null
    }
  }
  const onTouchMove = (e) => {
    e.preventDefault()
    if (e.touches.length === 1 && dragState.current) {
      const t = e.touches[0]
      const dx = t.clientX - dragState.current.startX
      const dy = t.clientY - dragState.current.startY
      const display = frameRef.current
      if (!display) return
      const scaleDisplay = display.offsetWidth / SLOT_W
      updateState({ offsetX: dragState.current.startOX + dx / scaleDisplay, offsetY: dragState.current.startOY + dy / scaleDisplay })
    } else if (e.touches.length === 2 && pinchState.current) {
      const dist     = getTouchDist(e.touches)
      const newScale = Math.max(0.3, Math.min(5, pinchState.current.startScale * (dist / pinchState.current.startDist)))
      updateState({ scale: newScale })
    }
  }
  const onTouchEnd = () => { dragState.current = null; pinchState.current = null }

  // --- Scroll para zoom en desktop ---
  const onWheel = (e) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.92 : 1.08
    updateState({ scale: Math.max(0.3, Math.min(5, state.scale * delta)) })
  }

  const getTouchDist = (touches) => {
    const dx = touches[0].clientX - touches[1].clientX
    const dy = touches[0].clientY - touches[1].clientY
    return Math.sqrt(dx*dx + dy*dy)
  }

  const resetPosition = () => {
    if (!img) return
    const scaleX = SLOT_W / img.naturalWidth
    const scaleY = SLOT_H / img.naturalHeight
    updateState({ scale: Math.max(scaleX, scaleY), offsetX: 0, offsetY: 0 })
  }

  // Calcular estilos de la foto dentro del frame de preview
  const getImgStyle = useCallback(() => {
    if (!img || !state || !frameRef.current) return {}
    const displayW = frameRef.current.offsetWidth || 280
    const displayScale = displayW / SLOT_W
    const photoW = img.naturalWidth  * state.scale * displayScale
    const photoH = img.naturalHeight * state.scale * displayScale
    const left   = (displayW - photoW) / 2 + state.offsetX * displayScale
    const top    = (displayW * SLOT_H / SLOT_W - photoH) / 2 + state.offsetY * displayScale
    return { width: photoW, height: photoH, left, top }
  }, [img, state])

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">Editor de fotos</h2>
        <span className="text-sm text-gray-400">{current + 1} / {rawPhotos.length}</span>
      </div>

      {/* Miniaturas */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {rawPhotos.map((f, i) => (
          <button key={i} onClick={() => setCurrent(i)}
            className={`flex-shrink-0 w-12 h-12 rounded-lg overflow-hidden border-2 transition-all ${
              i === current ? 'border-blue-500' : editedPhotos[i] ? 'border-green-600' : 'border-gray-700'
            }`}>
            <img src={previews[i] || URL.createObjectURL(f)} alt="" className="w-full h-full object-cover" />
          </button>
        ))}
      </div>

      {/* Frame de recorte fijo */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-400">Mueve y pellizca para encuadrar · Scroll para zoom</p>
          <button onClick={resetPosition} className="text-xs text-blue-400 underline">Resetear</button>
        </div>
        <div
          ref={frameRef}
          className="relative overflow-hidden rounded-lg border-2 border-blue-500 cursor-grab active:cursor-grabbing select-none bg-gray-800 mx-auto"
          style={{ width: '100%', aspectRatio: `${SLOT_W} / ${SLOT_H}` }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onWheel={onWheel}
        >
          {img && (
            <img
              src={URL.createObjectURL(rawPhotos[current])}
              alt="foto"
              draggable={false}
              className="absolute pointer-events-none"
              style={getImgStyle()}
            />
          )}
          {/* Overlay de texto preview */}
          {(overlay.datetime || overlay.name || overlay.extra) && (
            <div className="absolute bottom-0 left-0 right-0 bg-black/45 px-2 py-1">
              <p className="text-orange-400 text-[10px] font-mono font-bold leading-tight">
                {[overlay.datetime, overlay.name, overlay.extra].filter(Boolean).join(' · ')}
              </p>
            </div>
          )}
          {isRendering && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
              <span className="text-xs text-white">Procesando...</span>
            </div>
          )}
          {/* Guías de esquinas */}
          {['top-0 left-0','top-0 right-0','bottom-0 left-0','bottom-0 right-0'].map((pos, i) => (
            <div key={i} className={`absolute ${pos} w-5 h-5 border-blue-400 ${
              i===0?'border-t-2 border-l-2':i===1?'border-t-2 border-r-2':i===2?'border-b-2 border-l-2':'border-b-2 border-r-2'
            }`} />
          ))}
        </div>
        <p className="text-xs text-gray-500 text-center">9.22 cm × 12.43 cm — tamaño fijo del slot</p>
      </div>

      {/* Zoom manual */}
      <div className="bg-gray-900 rounded-xl p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-300">🔍 Zoom</span>
          <span className="text-xs text-gray-400 font-mono">{Math.round((state?.scale || 1) * 100)}%</span>
        </div>
        <input type="range" min={0.3} max={5} step={0.02}
          value={state?.scale || 1}
          onChange={e => updateState({ scale: parseFloat(e.target.value) })}
          className="w-full accent-blue-500"
        />
      </div>

      {/* Texto estampado */}
      <div className="bg-gray-900 rounded-xl p-4 space-y-3">
        <span className="text-sm font-medium text-gray-300">🕐 Texto en la foto</span>
        <div className="space-y-2">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Fecha y hora</label>
            <input value={overlay.datetime} onChange={e => updateOverlay('datetime', e.target.value)}
              placeholder="Ej: 12 jul 2026 10:28:47 a.m."
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 font-mono" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Nombre</label>
            <input value={overlay.name} onChange={e => updateOverlay('name', e.target.value.toUpperCase())}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 font-mono uppercase" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Texto adicional</label>
            <input value={overlay.extra} onChange={e => updateOverlay('extra', e.target.value)}
              placeholder="Turno noche, ubicación, etc."
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500" />
          </div>
        </div>
      </div>

      {/* Nav entre fotos */}
      <div className="flex gap-2">
        <button onClick={() => setCurrent(c => Math.max(0, c-1))} disabled={current===0}
          className="flex-1 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-gray-300 py-2.5 rounded-lg text-sm transition-colors">
          ← Anterior
        </button>
        <button onClick={() => setCurrent(c => Math.min(rawPhotos.length-1, c+1))} disabled={current===rawPhotos.length-1}
          className="flex-1 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-gray-300 py-2.5 rounded-lg text-sm transition-colors">
          Siguiente →
        </button>
      </div>

      <div className="flex gap-3">
        <button onClick={onBack} className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 py-3 rounded-lg font-medium transition-colors">
          ← Atrás
        </button>
        <button onClick={onNext} className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-lg font-semibold transition-colors">
          Asignar a Anexos →
        </button>
      </div>
    </div>
  )
}
