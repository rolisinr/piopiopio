import { useState } from 'react'
import StepStart from './components/StepStart'
import StepUpload from './components/StepUpload'
import StepEditor from './components/StepEditor'
import StepAssign from './components/StepAssign'
import StepGenerate from './components/StepGenerate'

const STEPS = ['Inicio', 'Fotos', 'Editor', 'Anexos', 'Generar']

export default function App() {
  const [step, setStep]             = useState(0)
  const [workerName, setWorkerName] = useState('')
  const [rawPhotos, setRawPhotos]   = useState([])
  const [editedPhotos, setEditedPhotos] = useState([])
  const [assignments, setAssignments]   = useState(
    Array(5).fill(null).map(() => ({ left: null, right: null }))
  )

  const next = () => setStep(s => Math.min(s + 1, 4))
  const back = () => setStep(s => Math.max(s - 1, 0))

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
      <header className="bg-gray-900 border-b border-gray-800 px-4 py-3 flex items-center gap-4">
        <div className="text-blue-400 font-bold text-lg tracking-tight">📋 Anexo Generator</div>
        {workerName && (
          <span className="text-xs text-gray-400 bg-gray-800 px-2 py-1 rounded">
            👤 {workerName}
          </span>
        )}
      </header>

      <div className="bg-gray-900 px-4 py-2 border-b border-gray-800">
        <div className="flex items-center gap-1 max-w-xl mx-auto">
          {STEPS.map((label, i) => (
            <div key={i} className="flex items-center gap-1 flex-1">
              <button onClick={() => i < step && setStep(i)}
                className={`flex items-center gap-1.5 text-xs font-medium transition-colors ${
                  i === step ? 'text-blue-400' :
                  i < step  ? 'text-green-400 cursor-pointer' :
                  'text-gray-600 cursor-default'
                }`}>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                  i === step ? 'bg-blue-500 text-white' :
                  i < step  ? 'bg-green-500 text-white' :
                  'bg-gray-700 text-gray-500'
                }`}>
                  {i < step ? '✓' : i + 1}
                </span>
                <span className="hidden sm:block">{label}</span>
              </button>
              {i < STEPS.length - 1 && (
                <div className={`flex-1 h-px mx-1 ${i < step ? 'bg-green-600' : 'bg-gray-700'}`} />
              )}
            </div>
          ))}
        </div>
      </div>

      <main className="flex-1 overflow-auto">
        {step === 0 && <StepStart workerName={workerName} setWorkerName={setWorkerName} onNext={next} />}
        {step === 1 && <StepUpload photos={rawPhotos} setPhotos={setRawPhotos} setWorkerName={setWorkerName} onNext={next} onBack={back} />}
        {step === 2 && <StepEditor rawPhotos={rawPhotos} editedPhotos={editedPhotos} setEditedPhotos={setEditedPhotos} workerName={workerName} onNext={next} onBack={back} />}
        {step === 3 && <StepAssign editedPhotos={editedPhotos} assignments={assignments} setAssignments={setAssignments} onNext={next} onBack={back} />}
        {step === 4 && <StepGenerate assignments={assignments} editedPhotos={editedPhotos} workerName={workerName} onBack={back} />}
      </main>
    </div>
  )
}
