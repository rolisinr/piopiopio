export default function StepStart({ workerName, setWorkerName, onNext }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="text-5xl">📋</div>
          <h1 className="text-xl font-bold text-white">Nueva sesión</h1>
          <p className="text-sm text-gray-400">Ingresa el nombre del trabajador para esta sesión</p>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-300">Nombre completo</label>
          <input
            type="text"
            value={workerName}
            onChange={e => setWorkerName(e.target.value.toUpperCase())}
            placeholder="APELLIDOS NOMBRES"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 uppercase font-mono"
            onKeyDown={e => e.key === 'Enter' && workerName.trim() && onNext()}
          />
          <p className="text-xs text-gray-500">Se estampará en todas las fotos automáticamente</p>
        </div>

        <button
          onClick={onNext}
          disabled={!workerName.trim()}
          className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold py-3 rounded-lg transition-colors"
        >
          Comenzar →
        </button>
      </div>
    </div>
  )
}
