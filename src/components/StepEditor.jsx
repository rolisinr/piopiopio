import { useState, useEffect, useRef, useCallback } from 'react'
import { readExifDateTime } from '../lib/exifReader'
import { loadImage, renderCrop, coverScale } from '../lib/photoEditor'

// Relación del canvas de preview (4:3 apaisado)
const PREVIEW_W = 360
const PREVIEW_H = 270

export default function StepEditor({ rawPhotos, editedPhotos, setEditedPhotos, workerName, onNext, onBack }) {
  const [current, setCurrent] = useState(0)
  const [tab, setTab]         = useState('edit')   // 'edit' | 'pos'

  // Estado por foto: pan/zoom en píxeles relativos al canvas de preview
  const initState = () => rawPhotos.map(() => ({ scale: 1, dx: 0, dy: 0 }))
  const [panZooms,  setPanZooms]  = useState(initState)
  const [overlays,  setOverlays]  = useState(() => rawPhotos.map(() => ({ datetime: '', name: workerName, extra: '' })))
  const [previews,  setPreviews]  = useState(() => rawPhotos.map(() => null))
  const [loadedImgs, setLoadedImgs] = useState([])
  const [rendering,  setRendering]  = useState(false)

  const frameRef   = useRef()
  const dragRef    = useRef(null)
  const pinchRef   = useRef(null)
  const timerRef   = useRef()

  // Cargar imágenes + EXIF
  useEffect(() => {
    Promise.all(rawPhotos.map(f => loadImage(f))).then(imgs => {
      setLoadedImgs(imgs)
      // Cover scale inicial para cada foto
      setPanZooms(imgs.map(img => ({
        scale: coverScale(img.naturalWidth, img.naturalHeight, PREVIEW_W, PREVIEW_H),
        dx: 0, dy: 0
      })))
    })
    rawPhotos.forEach(async (f, i) => {
      const exif = await readExifDateTime(f)
      if (exif) setOverlays(p => { const n=[...p]; n[i]={...n[i], datetime: exif.formatted}; return n })
    })
  }, [])

  const img     = loadedImgs[current]
  const panZoom = panZooms[current]  || { scale:1, dx:0, dy:0 }
  const overlay = overlays[current]  || { datetime:'', name:workerName, extra:'' }

  // Re-renderizar cuando cambia pan/zoom, overlay, o foto actual
  useEffect(() => {
    if (!img) return
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      setRendering(true)
      try {
        const result = await renderCrop(img, panZoom, overlay, PREVIEW_W, PREVIEW_H, 544)
        setPreviews(p => { const n=[...p]; n[current]=result.previewUrl; return n })
        setEditedPhotos(p => { const n=[...p]; n[current]={ file:rawPhotos[current], blob:result.blob }; return n })
      } finally { setRendering(false) }
    }, 300)
  }, [img, panZoom, overlay, current])

  // ── Handlers de interacción ──────────────────────────────────────────────
  const setPS = useCallback((patch) => {
    setPanZooms(p => { const n=[...p]; n[current]={...n[current],...patch}; return n })
  }, [current])

  const move = useCallback((ddx, ddy) => setPS({ dx: panZoom.dx+ddx, dy: panZoom.dy+ddy }), [panZoom, setPS])

  // Mouse drag
  const onMouseDown = e => { dragRef.current = { sx:e.clientX, sy:e.clientY, ox:panZoom.dx, oy:panZoom.dy } }
  const onMouseMove = e => {
    if (!dragRef.current) return
    setPS({ dx: dragRef.current.ox+(e.clientX-dragRef.current.sx), dy: dragRef.current.oy+(e.clientY-dragRef.current.sy) })
  }
  const onMouseUp = () => { dragRef.current = null }

  // Touch drag + pinch
  const onTouchStart = e => {
    if (e.touches.length === 1) {
      const t=e.touches[0]
      dragRef.current  = { sx:t.clientX, sy:t.clientY, ox:panZoom.dx, oy:panZoom.dy }
      pinchRef.current = null
    } else if (e.touches.length === 2) {
      pinchRef.current = { d: dist(e.touches), s: panZoom.scale }
      dragRef.current  = null
    }
  }
  const onTouchMove = e => {
    e.preventDefault()
    if (e.touches.length===1 && dragRef.current) {
      const t=e.touches[0]
      setPS({ dx: dragRef.current.ox+(t.clientX-dragRef.current.sx), dy: dragRef.current.oy+(t.clientY-dragRef.current.sy) })
    } else if (e.touches.length===2 && pinchRef.current) {
      setPS({ scale: Math.max(0.1, Math.min(8, pinchRef.current.s * dist(e.touches)/pinchRef.current.d)) })
    }
  }
  const onTouchEnd = () => { dragRef.current=null; pinchRef.current=null }

  // Wheel — registrado con passive:false para bloquear zoom de página
  useEffect(() => {
    const el = frameRef.current
    if (!el) return
    const handler = e => {
      e.preventDefault()
      e.stopPropagation()
      setPanZooms(p => {
        const n=[...p]
        const cur=n[current]||{scale:1,dx:0,dy:0}
        n[current]={ ...cur, scale: Math.max(0.1, Math.min(8, cur.scale * (e.deltaY>0?0.92:1.08))) }
        return n
      })
    }
    el.addEventListener('wheel', handler, { passive:false })
    return () => el.removeEventListener('wheel', handler)
  }, [current, frameRef.current])

  const dist = t => { const dx=t[0].clientX-t[1].clientX,dy=t[0].clientY-t[1].clientY; return Math.sqrt(dx*dx+dy*dy) }

  const updateOverlay = (key, val) => setOverlays(p => { const n=[...p]; n[current]={...n[current],[key]:val}; return n })

  const resetZoom = () => {
    if (!img) return
    setPS({ scale: coverScale(img.naturalWidth, img.naturalHeight, PREVIEW_W, PREVIEW_H), dx:0, dy:0 })
  }

  const STEP = 15  // px por click de botón de dirección

  return (
    <div className="max-w-lg mx-auto px-4 py-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">Editor</h2>
        <span className="text-sm text-gray-400">{current+1}/{rawPhotos.length}</span>
      </div>

      {/* Miniaturas */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {rawPhotos.map((f, i) => (
          <button key={i} onClick={() => { setCurrent(i); setTab('edit') }}
            className={`flex-shrink-0 w-12 h-12 rounded-lg overflow-hidden border-2 transition-all ${
              i===current?'border-blue-500':editedPhotos[i]?'border-green-600':'border-gray-700'}`}>
            {previews[i]
              ? <img src={previews[i]} alt="" className="w-full h-full object-cover"/>
              : <div className="w-full h-full bg-gray-800"/>}
          </button>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex bg-gray-900 rounded-xl p-1 gap-1">
        {[['edit','✂️ Recortar y Estampar'],['pos','📍 Posición']].map(([id,label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex-1 py-2 text-xs font-medium rounded-lg transition-colors ${tab===id?'bg-blue-600 text-white':'text-gray-400 hover:text-gray-200'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── TAB EDIT: Recortar + Estampar ── */}
      {tab==='edit' && (
        <div className="space-y-3">
          <p className="text-xs text-gray-400">Arrastra para mover · Pellizca o scroll para zoom · El texto se estampa en la esquina</p>

          {/* Canvas / frame de recorte */}
          <div
            ref={frameRef}
            className="relative overflow-hidden rounded-xl border-2 border-blue-500 cursor-grab active:cursor-grabbing mx-auto bg-gray-900"
            style={{ width:'100%', aspectRatio:`${PREVIEW_W}/${PREVIEW_H}`, touchAction:'none', userSelect:'none' }}
            onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
            onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
          >
            {previews[current]
              ? <img src={previews[current]} alt="" draggable={false}
                  className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                  style={{ opacity: rendering?0.7:1 }}/>
              : img
                ? <div className="absolute inset-0 flex items-center justify-center text-gray-500 text-xs">Renderizando...</div>
                : <div className="absolute inset-0 flex items-center justify-center text-gray-600 text-xs">Cargando foto...</div>
            }
            {rendering && (
              <div className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded">⏳</div>
            )}
            {/* Guías de esquina */}
            {[['top-0 left-0','border-t-2 border-l-2'],['top-0 right-0','border-t-2 border-r-2'],
              ['bottom-0 left-0','border-b-2 border-l-2'],['bottom-0 right-0','border-b-2 border-r-2']
            ].map(([pos,brd],i) => <div key={i} className={`absolute w-4 h-4 border-blue-400 ${pos} ${brd}`}/>)}
          </div>

          {/* Zoom slider */}
          <div className="flex items-center gap-3 bg-gray-900 rounded-xl px-4 py-2">
            <span className="text-xs text-gray-400">🔍</span>
            <input type="range" min={0.1} max={8} step={0.02}
              value={panZoom.scale}
              onChange={e => setPS({ scale: +e.target.value })}
              className="flex-1 accent-blue-500"/>
            <span className="text-xs text-gray-400 w-10 text-right font-mono">{Math.round(panZoom.scale*100)}%</span>
            <button onClick={resetZoom} className="text-xs text-blue-400 underline ml-1">Reset</button>
          </div>

          {/* Texto estampado */}
          <div className="bg-gray-900 rounded-xl p-4 space-y-2">
            <p className="text-xs font-medium text-gray-300 mb-2">Texto en la foto (blanco, esquina inferior izquierda)</p>
            {[
              ['datetime', 'Fecha y hora', 'Ej: 12 jul 2026 10:28:47 a.m.', false],
              ['name',     'Nombre',       '',                               true],
              ['extra',    'Texto extra',  'Turno noche, ubicación...',       false],
            ].map(([key, label, ph, upper]) => (
              <div key={key}>
                <label className="text-xs text-gray-500 mb-1 block">{label}</label>
                <input
                  value={overlay[key]}
                  onChange={e => updateOverlay(key, upper ? e.target.value.toUpperCase() : e.target.value)}
                  placeholder={ph}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 font-mono"
                  style={upper ? { textTransform:'uppercase' } : {}}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── TAB POS: Posición con botones ── */}
      {tab==='pos' && (
        <div className="space-y-3">
          <p className="text-xs text-gray-400">Usa los botones para ajustar la posición con precisión</p>

          {/* Preview */}
          <div className="relative overflow-hidden rounded-xl border-2 border-green-600 mx-auto bg-gray-900"
            style={{ width:'100%', aspectRatio:`${PREVIEW_W}/${PREVIEW_H}` }}>
            {previews[current] &&
              <img src={previews[current]} alt="" className="absolute inset-0 w-full h-full object-cover pointer-events-none"/>}
          </div>

          {/* Botones de posición */}
          <div className="bg-gray-900 rounded-xl p-4 space-y-3">
            <p className="text-xs text-gray-400 text-center">Mover foto</p>
            {/* D-pad */}
            <div className="grid grid-cols-3 gap-2 w-36 mx-auto">
              <div/>
              <button onClick={() => move(0, -STEP)} className="bg-gray-700 hover:bg-gray-600 text-white text-lg py-2 rounded-lg">↑</button>
              <div/>
              <button onClick={() => move(-STEP, 0)} className="bg-gray-700 hover:bg-gray-600 text-white text-lg py-2 rounded-lg">←</button>
              <button onClick={() => setPS({dx:0,dy:0})} className="bg-blue-700 hover:bg-blue-600 text-white text-xs py-2 rounded-lg">⊙</button>
              <button onClick={() => move(STEP, 0)} className="bg-gray-700 hover:bg-gray-600 text-white text-lg py-2 rounded-lg">→</button>
              <div/>
              <button onClick={() => move(0, STEP)} className="bg-gray-700 hover:bg-gray-600 text-white text-lg py-2 rounded-lg">↓</button>
              <div/>
            </div>

            {/* Presets */}
            <div className="grid grid-cols-3 gap-2">
              <button onClick={resetZoom} className="bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs py-2 rounded-lg">
                Cubrir
              </button>
              <button onClick={() => setPS({dx:0,dy:0})} className="bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs py-2 rounded-lg">
                Centrar
              </button>
              <button onClick={() => {
                if (!img) return
                const scaleX = PREVIEW_W / img.naturalWidth
                const scaleY = PREVIEW_H / img.naturalHeight
                setPS({ scale: Math.min(scaleX, scaleY), dx:0, dy:0 })
              }} className="bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs py-2 rounded-lg">
                Ajustar
              </button>
            </div>

            {/* Zoom fino */}
            <div className="flex items-center gap-2">
              <button onClick={() => setPS({scale: panZoom.scale * 0.95})} className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1.5 rounded-lg text-sm">−</button>
              <span className="flex-1 text-center text-xs text-gray-400 font-mono">{Math.round(panZoom.scale*100)}%</span>
              <button onClick={() => setPS({scale: panZoom.scale * 1.05})} className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1.5 rounded-lg text-sm">+</button>
            </div>
          </div>
        </div>
      )}

      {/* Nav entre fotos */}
      <div className="flex gap-2">
        <button onClick={() => { setCurrent(c=>Math.max(0,c-1)); setTab('edit') }} disabled={current===0}
          className="flex-1 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-gray-300 py-2.5 rounded-lg text-sm">← Anterior</button>
        <button onClick={() => { setCurrent(c=>Math.min(rawPhotos.length-1,c+1)); setTab('edit') }} disabled={current===rawPhotos.length-1}
          className="flex-1 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-gray-300 py-2.5 rounded-lg text-sm">Siguiente →</button>
      </div>
      <div className="flex gap-3">
        <button onClick={onBack} className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 py-3 rounded-lg font-medium">← Atrás</button>
        <button onClick={onNext} className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-lg font-semibold">Asignar a Anexos →</button>
      </div>
    </div>
  )
}
