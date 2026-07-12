import { useState, useEffect, useRef, useCallback } from 'react'
import { readExifDateTime } from '../lib/exifReader'
import { loadImage, cropPhoto, stampPhoto, placeInSlot, coverScale, SLOT_W, SLOT_H } from '../lib/photoEditor'

// Frame de recorte libre: aspect ratio 4:3 como default
const CROP_W = 400
const CROP_H = 300

export default function StepEditor({ rawPhotos, editedPhotos, setEditedPhotos, workerName, onNext, onBack }) {
  const [current, setCurrent] = useState(0)
  const [tab, setTab]         = useState('crop')   // 'crop' | 'stamp' | 'slot'

  // Estado por foto
  const [cropStates,  setCropStates]  = useState(() => rawPhotos.map(() => ({ scale: 1, offsetX: 0, offsetY: 0 })))
  const [overlays,    setOverlays]    = useState(() => rawPhotos.map(() => ({ datetime: '', name: workerName, extra: '' })))
  const [slotStates,  setSlotStates]  = useState(() => rawPhotos.map(() => ({ scale: 1, offsetX: 0, offsetY: 0 })))

  // Blobs intermedios
  const [croppedBlobs, setCroppedBlobs] = useState(() => rawPhotos.map(() => null))
  const [stampedBlobs, setStampedBlobs] = useState(() => rawPhotos.map(() => null))
  const [slotPreviews, setSlotPreviews] = useState(() => rawPhotos.map(() => null))

  const [loadedImgs, setLoadedImgs] = useState([])
  const [isProcessing, setIsProcessing] = useState(false)

  const cropFrameRef = useRef()
  const slotFrameRef = useRef()
  const dragRef      = useRef(null)
  const pinchRef     = useRef(null)
  const renderTimer  = useRef()

  // Cargar imágenes + EXIF
  useEffect(() => {
    Promise.all(rawPhotos.map(f => loadImage(f))).then(imgs => {
      setLoadedImgs(imgs)
      setCropStates(imgs.map(img => ({
        scale: coverScale(img.naturalWidth, img.naturalHeight, CROP_W, CROP_H),
        offsetX: 0, offsetY: 0
      })))
    })
    rawPhotos.forEach(async (f, i) => {
      const exif = await readExifDateTime(f)
      if (exif) setOverlays(prev => { const n=[...prev]; n[i]={...n[i], datetime: exif.formatted}; return n })
    })
  }, [])

  const img       = loadedImgs[current]
  const cropState = cropStates[current]  || { scale:1, offsetX:0, offsetY:0 }
  const slotState = slotStates[current]  || { scale:1, offsetX:0, offsetY:0 }
  const overlay   = overlays[current]    || { datetime:'', name:workerName, extra:'' }

  // ── Aplicar crop cuando cambia cropState ──────────────────────────────────
  useEffect(() => {
    if (!img) return
    clearTimeout(renderTimer.current)
    renderTimer.current = setTimeout(async () => {
      const blob = await cropPhoto(img, cropState, CROP_W, CROP_H)
      setCroppedBlobs(prev => { const n=[...prev]; n[current]=blob; return n })
    }, 350)
  }, [img, cropState, current])

  // ── Aplicar stamp cuando cambia overlay o croppedBlob ────────────────────
  useEffect(() => {
    const cropped = croppedBlobs[current]
    if (!cropped) return
    clearTimeout(renderTimer.current)
    renderTimer.current = setTimeout(async () => {
      const blob = await stampPhoto(cropped, overlay)
      setStampedBlobs(prev => { const n=[...prev]; n[current]=blob; return n })
      // Init slot scale para cubrir
      const stampImg = await loadImage(blob)
      setSlotStates(prev => {
        const n=[...prev]
        if (!n[current] || n[current].scale === 1)
          n[current] = { scale: coverScale(stampImg.naturalWidth, stampImg.naturalHeight, SLOT_W, SLOT_H), offsetX:0, offsetY:0 }
        return n
      })
    }, 350)
  }, [croppedBlobs[current], overlay, current])

  // ── Renderizar slot final cuando cambia slotState o stampedBlob ──────────
  useEffect(() => {
    const stamped = stampedBlobs[current]
    if (!stamped) return
    clearTimeout(renderTimer.current)
    renderTimer.current = setTimeout(async () => {
      setIsProcessing(true)
      try {
        const blob = await placeInSlot(stamped, slotState)
        const url  = URL.createObjectURL(blob)
        setSlotPreviews(prev => { const n=[...prev]; if(prev[current]) URL.revokeObjectURL(prev[current]); n[current]=url; return n })
        setEditedPhotos(prev => { const n=[...prev]; n[current]={ file:rawPhotos[current], blob }; return n })
      } finally { setIsProcessing(false) }
    }, 350)
  }, [stampedBlobs[current], slotState, current])

  // ── Pan/Zoom genérico ────────────────────────────────────────────────────
  function makeHandlers(getState, setState, frameRef) {
    const onMouseDown = e => {
      e.preventDefault()
      const s = getState()
      dragRef.current = { startX:e.clientX, startY:e.clientY, startOX:s.offsetX, startOY:s.offsetY }
    }
    const onMouseMove = e => {
      if (!dragRef.current) return
      const el  = frameRef.current; if(!el) return
      const fw  = el.offsetWidth
      const fh  = el.offsetHeight
      const ref = getState()
      const scX = fw  / (frameRef === cropFrameRef ? CROP_W : SLOT_W)
      const scY = fh  / (frameRef === cropFrameRef ? CROP_H : SLOT_H)
      setState({ offsetX: dragRef.current.startOX + (e.clientX - dragRef.current.startX)/scX,
                 offsetY: dragRef.current.startOY + (e.clientY - dragRef.current.startY)/scY })
    }
    const onMouseUp = () => { dragRef.current = null }

    const onTouchStart = e => {
      if (e.touches.length === 1) {
        const t = e.touches[0], s = getState()
        dragRef.current = { startX:t.clientX, startY:t.clientY, startOX:s.offsetX, startOY:s.offsetY }
      } else if (e.touches.length === 2) {
        pinchRef.current = { startDist: pinchDist(e.touches), startScale: getState().scale }
        dragRef.current  = null
      }
    }
    const onTouchMove = e => {
      e.preventDefault()
      if (e.touches.length === 1 && dragRef.current) {
        const t=e.touches[0], el=frameRef.current; if(!el) return
        const fw=el.offsetWidth, fh=el.offsetHeight
        const scX = fw/(frameRef===cropFrameRef?CROP_W:SLOT_W)
        const scY = fh/(frameRef===cropFrameRef?CROP_H:SLOT_H)
        setState({ offsetX: dragRef.current.startOX+(t.clientX-dragRef.current.startX)/scX,
                   offsetY: dragRef.current.startOY+(t.clientY-dragRef.current.startY)/scY })
      } else if (e.touches.length===2 && pinchRef.current) {
        const ns = Math.max(0.2, Math.min(6, pinchRef.current.startScale * (pinchDist(e.touches)/pinchRef.current.startDist)))
        setState({ scale: ns })
      }
    }
    const onTouchEnd = () => { dragRef.current=null; pinchRef.current=null }
    return { onMouseDown, onMouseMove, onMouseUp, onTouchStart, onTouchMove, onTouchEnd }
  }

  const pinchDist = t => {
    const dx=t[0].clientX-t[1].clientX, dy=t[0].clientY-t[1].clientY
    return Math.sqrt(dx*dx+dy*dy)
  }

  // Wheel con passive:false
  useEffect(() => {
    const refs = [cropFrameRef, slotFrameRef]
    const getters = [() => cropStates[current], () => slotStates[current]]
    const setters = [
      patch => setCropStates(p => { const n=[...p]; n[current]={...n[current],...patch}; return n }),
      patch => setSlotStates(p => { const n=[...p]; n[current]={...n[current],...patch}; return n })
    ]
    const handlers = refs.map((ref, i) => (e) => {
      e.preventDefault()
      const delta = e.deltaY > 0 ? 0.92 : 1.08
      setters[i]({ scale: Math.max(0.2, Math.min(6, getters[i]().scale * delta)) })
    })
    refs.forEach((ref, i) => { ref.current?.addEventListener('wheel', handlers[i], { passive: false }) })
    return () => { refs.forEach((ref, i) => { ref.current?.removeEventListener('wheel', handlers[i]) }) }
  }, [current, cropStates, slotStates])

  const cropHandlers = makeHandlers(
    () => cropStates[current],
    patch => setCropStates(p => { const n=[...p]; n[current]={...n[current],...patch}; return n }),
    cropFrameRef
  )
  const slotHandlers = makeHandlers(
    () => slotStates[current],
    patch => setSlotStates(p => { const n=[...p]; n[current]={...n[current],...patch}; return n }),
    slotFrameRef
  )

  const updateOverlay = (key, val) => setOverlays(p => { const n=[...p]; n[current]={...n[current],[key]:val}; return n })

  const getImgStyle = (state, fRef, fw, fh) => {
    if (!img || !state || !fRef.current) return {}
    const dw = fRef.current.offsetWidth  || 280
    const dh = fRef.current.offsetHeight || (dw * fh / fw)
    const sc = dw / fw
    const photoW = img.naturalWidth  * state.scale * sc
    const photoH = img.naturalHeight * state.scale * sc
    return { width: photoW, height: photoH,
             left: (dw-photoW)/2 + state.offsetX*sc,
             top:  (dh-photoH)/2 + state.offsetY*sc }
  }

  const TABS = [
    { id:'crop',  label:'✂️ Recortar' },
    { id:'stamp', label:'🕐 Estampar' },
    { id:'slot',  label:'📍 Posicionar' },
  ]

  return (
    <div className="max-w-lg mx-auto px-4 py-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">Editor</h2>
        <span className="text-sm text-gray-400">{current+1}/{rawPhotos.length}</span>
      </div>

      {/* Miniaturas */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {rawPhotos.map((f, i) => (
          <button key={i} onClick={() => setCurrent(i)}
            className={`flex-shrink-0 w-11 h-11 rounded-lg overflow-hidden border-2 transition-all ${
              i===current?'border-blue-500':editedPhotos[i]?'border-green-600':'border-gray-700'}`}>
            <img src={slotPreviews[i] || URL.createObjectURL(f)} alt="" className="w-full h-full object-cover"/>
          </button>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex bg-gray-900 rounded-xl p-1 gap-1">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-1 py-2 text-xs font-medium rounded-lg transition-colors ${
              tab===t.id?'bg-blue-600 text-white':'text-gray-400 hover:text-gray-200'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── TAB CROP ── */}
      {tab==='crop' && (
        <div className="space-y-3">
          <p className="text-xs text-gray-400">Mueve y pellizca para encuadrar el recorte</p>
          <div ref={cropFrameRef}
            className="relative overflow-hidden rounded-xl border-2 border-yellow-500 cursor-grab active:cursor-grabbing select-none bg-gray-800 mx-auto"
            style={{ width:'100%', aspectRatio:`${CROP_W}/${CROP_H}` }}
            {...cropHandlers}>
            {img && (
              <img src={URL.createObjectURL(rawPhotos[current])} alt="" draggable={false}
                className="absolute pointer-events-none"
                style={getImgStyle(cropState, cropFrameRef, CROP_W, CROP_H)}/>
            )}
            {/* Guías de esquinas */}
            {['top-0 left-0 border-t-2 border-l-2','top-0 right-0 border-t-2 border-r-2',
              'bottom-0 left-0 border-b-2 border-l-2','bottom-0 right-0 border-b-2 border-r-2'
            ].map((cls,i) => <div key={i} className={`absolute w-5 h-5 border-yellow-400 ${cls}`}/>)}
          </div>
          <div className="flex items-center gap-3 bg-gray-900 rounded-xl px-4 py-2">
            <span className="text-xs text-gray-400">Zoom</span>
            <input type="range" min={0.2} max={6} step={0.02} value={cropState.scale}
              onChange={e => setCropStates(p=>{const n=[...p];n[current]={...n[current],scale:+e.target.value};return n})}
              className="flex-1 accent-yellow-500"/>
            <span className="text-xs text-gray-400 w-10 text-right">{Math.round(cropState.scale*100)}%</span>
          </div>
          <button onClick={() => setTab('stamp')}
            className="w-full bg-yellow-600 hover:bg-yellow-500 text-white py-3 rounded-xl font-semibold">
            Aplicar recorte → Estampar
          </button>
        </div>
      )}

      {/* ── TAB STAMP ── */}
      {tab==='stamp' && (
        <div className="space-y-3">
          {/* Preview del recorte con texto */}
          {croppedBlobs[current] && (
            <div className="relative rounded-xl overflow-hidden bg-gray-800">
              <img src={URL.createObjectURL(croppedBlobs[current])} alt="recorte"
                className="w-full object-contain max-h-48"/>
              {/* Preview de texto sobre la imagen */}
              {(overlay.datetime||overlay.name||overlay.extra) && (
                <div className="absolute bottom-2 left-2 space-y-0.5">
                  {[overlay.datetime,overlay.name,overlay.extra].filter(Boolean).map((line,i)=>(
                    <p key={i} className="text-white text-[11px] font-mono font-bold leading-tight"
                      style={{textShadow:'1px 1px 3px rgba(0,0,0,0.9),0 0 6px rgba(0,0,0,0.8)'}}>
                      {line}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="bg-gray-900 rounded-xl p-4 space-y-2">
            <p className="text-xs font-medium text-gray-300 mb-2">Texto en esquina inferior izquierda</p>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Fecha y hora</label>
              <input value={overlay.datetime} onChange={e=>updateOverlay('datetime',e.target.value)}
                placeholder="Ej: 12 jul 2026 10:28:47 a.m."
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 font-mono"/>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Nombre</label>
              <input value={overlay.name} onChange={e=>updateOverlay('name',e.target.value.toUpperCase())}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 font-mono uppercase"/>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Texto adicional</label>
              <input value={overlay.extra} onChange={e=>updateOverlay('extra',e.target.value)}
                placeholder="Turno noche, ubicación, etc."
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"/>
            </div>
          </div>
          <button onClick={()=>setTab('slot')}
            className="w-full bg-green-600 hover:bg-green-500 text-white py-3 rounded-xl font-semibold">
            Posicionar en celda →
          </button>
        </div>
      )}

      {/* ── TAB SLOT ── */}
      {tab==='slot' && (
        <div className="space-y-3">
          <p className="text-xs text-gray-400">Posiciona la foto dentro del slot fijo del Anexo</p>
          <div ref={slotFrameRef}
            className="relative overflow-hidden rounded-xl border-2 border-blue-500 cursor-grab active:cursor-grabbing select-none bg-gray-800 mx-auto"
            style={{ width:'100%', aspectRatio:`${SLOT_W}/${SLOT_H}` }}
            {...slotHandlers}>
            {stampedBlobs[current] && (
              <img src={URL.createObjectURL(stampedBlobs[current])} alt="" draggable={false}
                className="absolute pointer-events-none"
                style={(() => {
                  const el=slotFrameRef.current; if(!el) return {}
                  const dw=el.offsetWidth; const dh=el.offsetHeight
                  const s=slotState
                  return {
                    left: dw/2 - (el.offsetWidth||1)/2*slotState.scale + slotState.offsetX*(dw/SLOT_W),
                    top:  dh/2 - (el.offsetHeight||1)/2*slotState.scale + slotState.offsetY*(dw/SLOT_W),
                    width: '100%', height: '100%',
                    objectFit:'none', transform:`scale(${slotState.scale})`, transformOrigin:'center'
                  }
                })()}
              />
            )}
            {slotPreviews[current] && (
              <img src={slotPreviews[current]} alt="preview slot" draggable={false}
                className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                style={{ opacity: isProcessing?0.5:1 }}/>
            )}
            {isProcessing && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                <span className="text-xs text-white">Procesando...</span>
              </div>
            )}
            {['top-0 left-0 border-t-2 border-l-2','top-0 right-0 border-t-2 border-r-2',
              'bottom-0 left-0 border-b-2 border-l-2','bottom-0 right-0 border-b-2 border-r-2'
            ].map((cls,i) => <div key={i} className={`absolute w-5 h-5 border-blue-400 ${cls}`}/>)}
          </div>
          <div className="flex items-center gap-3 bg-gray-900 rounded-xl px-4 py-2">
            <span className="text-xs text-gray-400">Zoom</span>
            <input type="range" min={0.2} max={6} step={0.02} value={slotState.scale}
              onChange={e => setSlotStates(p=>{const n=[...p];n[current]={...n[current],scale:+e.target.value};return n})}
              className="flex-1 accent-blue-500"/>
            <span className="text-xs text-gray-400 w-10 text-right">{Math.round(slotState.scale*100)}%</span>
          </div>
          <p className="text-xs text-center text-gray-500">9.22 cm × 12.43 cm — tamaño fijo del slot</p>
        </div>
      )}

      {/* Nav entre fotos */}
      <div className="flex gap-2">
        <button onClick={()=>setCurrent(c=>Math.max(0,c-1))} disabled={current===0}
          className="flex-1 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-gray-300 py-2.5 rounded-lg text-sm">
          ← Anterior
        </button>
        <button onClick={()=>setCurrent(c=>Math.min(rawPhotos.length-1,c+1))} disabled={current===rawPhotos.length-1}
          className="flex-1 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-gray-300 py-2.5 rounded-lg text-sm">
          Siguiente →
        </button>
      </div>

      <div className="flex gap-3">
        <button onClick={onBack} className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 py-3 rounded-lg font-medium">
          ← Atrás
        </button>
        <button onClick={onNext} className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-lg font-semibold">
          Asignar a Anexos →
        </button>
      </div>
    </div>
  )
}
