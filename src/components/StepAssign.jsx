import { useState } from 'react'

const DESCRIPCIONES = [
  'Controlé el acceso de los usuarios en los embarques del sistema de transporte y optimicé la fluidez en las intersecciones de las vías cercanas por donde transitan las unidades de los corredores complementarios y/o COSAC I.',
  'Verifiqué y monitoreé la operatividad en las instalaciones del COSAC I y/o corredores complementarios, tales como estaciones, patios, terminales y paraderos que forman parte del sistema de transporte.',
  'Ubiqué y distribuí los implementos viales en las instalaciones del COSAC I y/o en las vías de los corredores complementarios durante la prestación del servicio del sistema de transporte.',
  'Comuniqué sobre las incidencias y/o eventos presentados durante la operación del sistema de transporte en los corredores complementarios y/o COSAC I.',
  'Informé al centro de control las casuísticas presentadas durante la operación del servicio de transporte.',
]

export default function StepAssign({ editedPhotos, assignments, setAssignments, onNext, onBack }) {
  const [selecting, setSelecting] = useState(null) // { anexo, side }

  const getPreview = (photo) => {
    if (!photo) return null
    if (photo.blob) return URL.createObjectURL(photo.blob)
    if (photo.file) return URL.createObjectURL(photo.file)
    return null
  }

  const assign = (photoIndex) => {
    if (!selecting) return
    const { anexo, side } = selecting
    setAssignments(prev => {
      const next = prev.map(a => ({ ...a }))
      // Remover si ya estaba asignada en otro slot
      next.forEach(a => {
        if (a.left === photoIndex) a.left = null
        if (a.right === photoIndex) a.right = null
      })
      next[anexo][side] = photoIndex
      return next
    })
    setSelecting(null)
  }

  const clearSlot = (anexo, side) => {
    setAssignments(prev => {
      const next = prev.map(a => ({ ...a }))
      next[anexo][side] = null
      return next
    })
  }

  const assignedIndices = new Set(
    assignments.flatMap(a => [a.left, a.right]).filter(v => v !== null && v !== undefined)
  )

  const totalAssigned = assignedIndices.size
  const canProceed = assignments.some(a => a.left !== null || a.right !== null)

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">Asignar fotos a Anexos</h2>
        <span className="text-sm text-gray-400">{totalAssigned}/{editedPhotos.length} asignadas</span>
      </div>

      {/* Instrucción */}
      {selecting ? (
        <div className="bg-blue-900/40 border border-blue-700 rounded-xl p-3 flex items-center justify-between">
          <span className="text-sm text-blue-300">
            Selecciona la foto para <strong>ANEXO {selecting.anexo + 1} {selecting.side === 'left' ? '(izquierda)' : '(derecha)'}</strong>
          </span>
          <button onClick={() => setSelecting(null)} className="text-xs text-blue-400 hover:text-blue-200 underline">
            Cancelar
          </button>
        </div>
      ) : (
        <p className="text-sm text-gray-400">Toca un slot vacío de un Anexo para asignarle una foto</p>
      )}

      {/* Grid de ANEXOs */}
      <div className="space-y-4">
        {assignments.map((a, anexoIdx) => (
          <div key={anexoIdx} className="bg-gray-900 rounded-xl overflow-hidden">
            <div className="px-4 py-2 border-b border-gray-800">
              <span className="text-sm font-bold text-gray-200">ANEXO {anexoIdx + 1}</span>
              <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{DESCRIPCIONES[anexoIdx]}</p>
            </div>
            <div className="grid grid-cols-2 gap-0.5 bg-gray-800">
              {['left', 'right'].map(side => {
                const idx = a[side]
                const photo = idx !== null && idx !== undefined ? editedPhotos[idx] : null
                const preview = getPreview(photo)
                const isSelecting = selecting?.anexo === anexoIdx && selecting?.side === side
                return (
                  <div key={side}>
                    {preview ? (
                      <div className="relative group">
                        <img src={preview} alt="" className="w-full aspect-[4/3] object-cover" />
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                          <button
                            onClick={() => { clearSlot(anexoIdx, side); setSelecting({ anexo: anexoIdx, side }) }}
                            className="bg-blue-600 text-white text-xs px-2 py-1 rounded"
                          >
                            Cambiar
                          </button>
                          <button
                            onClick={() => clearSlot(anexoIdx, side)}
                            className="bg-red-600 text-white text-xs px-2 py-1 rounded"
                          >
                            Quitar
                          </button>
                        </div>
                        <div className="absolute bottom-1 left-1 bg-black/60 text-white text-xs px-1 rounded">
                          #{idx + 1}
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setSelecting({ anexo: anexoIdx, side })}
                        className={`w-full aspect-[4/3] flex flex-col items-center justify-center gap-1 transition-colors ${
                          isSelecting ? 'bg-blue-900/60 border-2 border-blue-500' : 'bg-gray-850 hover:bg-gray-800 border-2 border-dashed border-gray-700'
                        }`}
                      >
                        <span className="text-2xl">{isSelecting ? '👆' : '+'}</span>
                        <span className="text-xs text-gray-500">{side === 'left' ? 'Izquierda' : 'Derecha'}</span>
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Galería de fotos disponibles */}
      {selecting && (
        <div className="sticky bottom-4 bg-gray-900 border border-gray-700 rounded-xl p-3 shadow-2xl space-y-2">
          <p className="text-xs text-gray-400 font-medium">Elige una foto:</p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {editedPhotos.map((photo, i) => {
              const preview = getPreview(photo)
              const isAssigned = assignedIndices.has(i)
              return (
                <button
                  key={i}
                  onClick={() => assign(i)}
                  className={`flex-shrink-0 relative rounded-lg overflow-hidden border-2 transition-all ${
                    isAssigned ? 'border-yellow-500 opacity-60' : 'border-gray-600 hover:border-blue-400'
                  }`}
                  style={{ width: 72, height: 54 }}
                >
                  <img src={preview} alt="" className="w-full h-full object-cover" />
                  <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-xs text-center">
                    #{i + 1}{isAssigned ? ' ✓' : ''}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Acciones */}
      <div className="flex gap-3 pt-2">
        <button onClick={onBack} className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 py-3 rounded-lg font-medium transition-colors">
          ← Atrás
        </button>
        <button
          onClick={onNext}
          disabled={!canProceed}
          className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white py-3 rounded-lg font-semibold transition-colors"
        >
          Generar documentos →
        </button>
      </div>
    </div>
  )
}
