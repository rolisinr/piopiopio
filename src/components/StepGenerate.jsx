import { useState, useRef } from 'react'
import { generateWord } from '../lib/wordGenerator'
import { mergeSunatPdfs } from '../lib/pdfMerger'

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function slugName(name) {
  return name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 30)
}

export default function StepGenerate({ assignments, editedPhotos, workerName, onBack }) {
  const [status, setStatus] = useState({}) // { word, pdf, sunat }
  const [sunatFiles, setSunatFiles] = useState([null, null])
  const sunatRef1 = useRef()
  const sunatRef2 = useRef()

  // Construir array de 10 slots para el generador
  const buildPhotoSlots = () => {
    const slots = Array(10).fill(null)
    assignments.forEach((a, anexoIdx) => {
      if (a.left !== null && a.left !== undefined && editedPhotos[a.left]) {
        slots[anexoIdx * 2] = editedPhotos[a.left]
      }
      if (a.right !== null && a.right !== undefined && editedPhotos[a.right]) {
        slots[anexoIdx * 2 + 1] = editedPhotos[a.right]
      }
    })
    return slots
  }

  const handleGenerateWord = async () => {
    setStatus(s => ({ ...s, word: 'loading' }))
    try {
      const slots = buildPhotoSlots()
      const blob = await generateWord(slots)
      const filename = `ANEXO_${slugName(workerName)}.docx`
      saveBlob(blob, filename)
      setStatus(s => ({ ...s, word: 'done' }))
    } catch (e) {
      console.error(e)
      setStatus(s => ({ ...s, word: 'error' }))
    }
  }

  const handleGeneratePdfViaGoogleDrive = async () => {
    // Generar Word primero, luego el usuario lo sube a Google Drive para convertir a PDF
    setStatus(s => ({ ...s, pdf: 'loading' }))
    try {
      const slots = buildPhotoSlots()
      const blob = await generateWord(slots)
      const filename = `ANEXO_${slugName(workerName)}.docx`
      saveBlob(blob, filename)
      setStatus(s => ({ ...s, pdf: 'drive' }))
    } catch (e) {
      console.error(e)
      setStatus(s => ({ ...s, pdf: 'error' }))
    }
  }

  const handleSunatFile = (idx, file) => {
    setSunatFiles(prev => {
      const next = [...prev]
      next[idx] = file
      return next
    })
  }

  const handleMergeSunat = async () => {
    if (!sunatFiles[0] || !sunatFiles[1]) return
    setStatus(s => ({ ...s, sunat: 'loading' }))
    try {
      const blob = await mergeSunatPdfs(sunatFiles[0], sunatFiles[1])
      const filename = `SUNAT_${slugName(workerName)}.pdf`
      saveBlob(blob, filename)
      setStatus(s => ({ ...s, sunat: 'done' }))
    } catch (e) {
      console.error(e)
      setStatus(s => ({ ...s, sunat: 'error' }))
    }
  }

  const StatusBadge = ({ state }) => {
    if (!state) return null
    const map = {
      loading: <span className="text-xs text-yellow-400 animate-pulse">⏳ Procesando...</span>,
      done: <span className="text-xs text-green-400">✅ Descargado</span>,
      drive: <span className="text-xs text-blue-400">✅ Descargado — súbelo a Google Drive para PDF</span>,
      error: <span className="text-xs text-red-400">❌ Error — intenta de nuevo</span>,
    }
    return map[state] || null
  }

  const assignedCount = assignments.reduce((acc, a) => {
    if (a.left !== null && a.left !== undefined) acc++
    if (a.right !== null && a.right !== undefined) acc++
    return acc
  }, 0)

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
      <div>
        <h2 className="text-lg font-bold text-white">Generar documentos</h2>
        <p className="text-sm text-gray-400 mt-1">
          {assignedCount} fotos asignadas a {assignments.filter(a => a.left !== null || a.right !== null).length} Anexos
        </p>
      </div>

      {/* Resumen de asignación */}
      <div className="bg-gray-900 rounded-xl p-4 grid grid-cols-5 gap-2">
        {assignments.map((a, i) => (
          <div key={i} className="text-center">
            <div className="text-xs text-gray-500 mb-1">A{i + 1}</div>
            <div className="flex gap-0.5 justify-center">
              <div className={`w-3 h-3 rounded-sm ${a.left !== null && a.left !== undefined ? 'bg-blue-500' : 'bg-gray-700'}`} />
              <div className={`w-3 h-3 rounded-sm ${a.right !== null && a.right !== undefined ? 'bg-blue-500' : 'bg-gray-700'}`} />
            </div>
          </div>
        ))}
      </div>

      {/* Generación Word */}
      <div className="bg-gray-900 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">📄</span>
          <div>
            <p className="text-sm font-semibold text-white">Documento Word (.docx)</p>
            <p className="text-xs text-gray-400">Template rellenado con tus fotos</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleGenerateWord}
            disabled={status.word === 'loading'}
            className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white py-2.5 rounded-lg text-sm font-semibold transition-colors"
          >
            {status.word === 'loading' ? 'Generando...' : '⬇ Descargar Word'}
          </button>
        </div>
        <StatusBadge state={status.word} />
      </div>

      {/* Generación PDF */}
      <div className="bg-gray-900 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">📕</span>
          <div>
            <p className="text-sm font-semibold text-white">PDF del Anexo</p>
            <p className="text-xs text-gray-400">Descarga el Word y conviértelo en Google Drive</p>
          </div>
        </div>
        <button
          onClick={handleGeneratePdfViaGoogleDrive}
          disabled={status.pdf === 'loading'}
          className="w-full bg-orange-600 hover:bg-orange-500 disabled:bg-gray-700 disabled:text-gray-500 text-white py-2.5 rounded-lg text-sm font-semibold transition-colors"
        >
          {status.pdf === 'loading' ? 'Generando...' : '⬇ Descargar Word → convertir en Drive'}
        </button>
        {status.pdf === 'drive' && (
          <div className="bg-gray-800 rounded-lg p-3 text-xs text-gray-300 space-y-1">
            <p className="font-medium text-white">Pasos para obtener el PDF:</p>
            <ol className="list-decimal list-inside space-y-1 text-gray-400">
              <li>Sube el .docx descargado a Google Drive</li>
              <li>Ábrelo con Google Docs</li>
              <li>Archivo → Descargar → PDF</li>
            </ol>
          </div>
        )}
        <StatusBadge state={status.pdf === 'drive' ? null : status.pdf} />
      </div>

      {/* Unión PDFs SUNAT */}
      <div className="bg-gray-900 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">🔗</span>
          <div>
            <p className="text-sm font-semibold text-white">Unir PDFs de SUNAT</p>
            <p className="text-xs text-gray-400">Recibo por honorarios + Recibo de validez → un solo PDF</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <p className="text-xs text-gray-500 mb-1">1. Recibo honorarios</p>
            <button
              onClick={() => sunatRef1.current.click()}
              className={`w-full py-2 rounded-lg text-xs border transition-colors ${
                sunatFiles[0] ? 'border-green-600 bg-green-900/20 text-green-400' : 'border-dashed border-gray-700 text-gray-500 hover:border-gray-500'
              }`}
            >
              {sunatFiles[0] ? `✅ ${sunatFiles[0].name.slice(0, 18)}...` : '+ Subir PDF'}
            </button>
            <input ref={sunatRef1} type="file" accept=".pdf" className="hidden" onChange={e => handleSunatFile(0, e.target.files[0])} />
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">2. Recibo de validez</p>
            <button
              onClick={() => sunatRef2.current.click()}
              className={`w-full py-2 rounded-lg text-xs border transition-colors ${
                sunatFiles[1] ? 'border-green-600 bg-green-900/20 text-green-400' : 'border-dashed border-gray-700 text-gray-500 hover:border-gray-500'
              }`}
            >
              {sunatFiles[1] ? `✅ ${sunatFiles[1].name.slice(0, 18)}...` : '+ Subir PDF'}
            </button>
            <input ref={sunatRef2} type="file" accept=".pdf" className="hidden" onChange={e => handleSunatFile(1, e.target.files[0])} />
          </div>
        </div>
        <button
          onClick={handleMergeSunat}
          disabled={!sunatFiles[0] || !sunatFiles[1] || status.sunat === 'loading'}
          className="w-full bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 disabled:text-gray-500 text-white py-2.5 rounded-lg text-sm font-semibold transition-colors"
        >
          {status.sunat === 'loading' ? 'Uniendo...' : '🔗 Unir y descargar PDF'}
        </button>
        <StatusBadge state={status.sunat} />
      </div>

      {/* Atrás */}
      <button onClick={onBack} className="w-full bg-gray-800 hover:bg-gray-700 text-gray-300 py-3 rounded-lg font-medium transition-colors">
        ← Volver a Anexos
      </button>
    </div>
  )
}

// Exportación adicional para uso desde TelegramSessions
export { generateWord }
