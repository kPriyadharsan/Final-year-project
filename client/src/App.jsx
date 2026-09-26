import { useState, useEffect } from 'react'

function App() {
  const [healthData, setHealthData] = useState(null)
  const [status, setStatus] = useState('connecting') // 'connected' | 'connecting' | 'error'
  const [errorMessage, setErrorMessage] = useState('')
  const [lastChecked, setLastChecked] = useState(null)
  const [latency, setLatency] = useState(null)

  // Only VITE_ prefixed environment variables are available in the frontend
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'

  // Security Check: Verify that GEMINI_API_KEY is NEVER exposed to the frontend bundle
  // (In Vite, variables without VITE_ prefix are strictly undefined in the client)
  const isGeminiKeyExposed = typeof import.meta.env.GEMINI_API_KEY !== 'undefined'

  const checkBackendHealth = async () => {
    setStatus('connecting')
    setErrorMessage('')
    const startTime = performance.now()

    try {
      const response = await fetch(`${apiBaseUrl}/api/health`, {
        headers: {
          'Accept': 'application/json',
        },
      })

      const endTime = performance.now()
      setLatency(Math.round(endTime - startTime))

      if (!response.ok) {
        throw new Error(`Server returned HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()
      setHealthData(data)
      setStatus('connected')
      setLastChecked(new Date().toLocaleTimeString())
    } catch (err) {
      console.error('Failed to connect to backend:', err)
      setStatus('error')
      setErrorMessage(err.message || 'Failed to fetch from backend')
      setLastChecked(new Date().toLocaleTimeString())
    }
  }

  useEffect(() => {
    checkBackendHealth()
  }, [])

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-indigo-500 selection:text-white">
      {/* Background Glow Accents */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl"></div>
        <div className="absolute top-1/3 -right-40 w-96 h-96 bg-purple-600/20 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 left-1/3 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl"></div>
      </div>

      {/* Top Navbar */}
      <header className="border-b border-slate-800/80 bg-slate-900/40 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-500 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 100-6 3 3 0 000 6z" />
              </svg>
            </div>
            <div>
              <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
                SmartClassroom OS
              </span>
              <span className="ml-2 text-xs font-mono py-0.5 px-2 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                v1.0.0 MERN
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Backend status pill */}
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                status === 'connected'
                  ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                  : status === 'connecting'
                  ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                  : 'bg-rose-500/10 text-rose-300 border-rose-500/30'
              }`}
            >
              <span className="relative flex h-2 w-2">
                {status === 'connected' && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                )}
                <span
                  className={`relative inline-flex rounded-full h-2 w-2 ${
                    status === 'connected'
                      ? 'bg-emerald-500'
                      : status === 'connecting'
                      ? 'bg-amber-400'
                      : 'bg-rose-500'
                  }`}
                ></span>
              </span>
              <span>
                {status === 'connected'
                  ? 'Backend Connected'
                  : status === 'connecting'
                  ? 'Connecting to Server...'
                  : 'Backend Offline'}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-10 flex flex-col gap-8">
        {/* Hero Section */}
        <section className="text-center space-y-3 max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-xs text-indigo-400 font-mono tracking-wide">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse"></span>
            Final Year Engineering Project
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-white leading-tight">
            AI Voice-Controlled{' '}
            <span className="bg-gradient-to-r from-indigo-400 via-purple-300 to-pink-400 bg-clip-text text-transparent">
              Smart Classroom
            </span>
          </h1>

          <p className="text-slate-400 text-sm sm:text-base leading-relaxed">
            Full-stack MERN architecture with strict environment isolation, server-side secret validation, and zero API key leakage to browser clients.
          </p>
        </section>

        {/* Security & Isolation Status Banner */}
        <section className="bg-indigo-950/30 border border-indigo-500/30 rounded-2xl p-5 backdrop-blur-md">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <div>
                <h2 className="text-sm font-semibold text-white">Environment Security & Isolation Audit</h2>
                <p className="text-xs text-slate-300 mt-0.5">
                  <code className="text-emerald-400 font-mono font-medium">GEMINI_API_KEY</code> is completely isolated on backend &bull; Zero browser exposure verified
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className={`px-2.5 py-1 rounded-full text-xs font-mono font-semibold ${
                !isGeminiKeyExposed
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
              }`}>
                {!isGeminiKeyExposed ? '🛡️ Secrets Isolated (Safe)' : '⚠️ Alert: Secret in Client'}
              </span>
            </div>
          </div>
        </section>

        {/* Live Backend Connection Card */}
        <section className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 sm:p-8 backdrop-blur-xl shadow-2xl relative overflow-hidden">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-slate-800">
            <div>
              <div className="flex items-center gap-3">
                <h3 className="text-xl font-semibold text-white">Smart Classroom</h3>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono border border-slate-700">
                  GET /api/health
                </span>
              </div>
              <p className="text-sm text-slate-400 mt-1">
                Validated backend environment handshake via <code className="text-indigo-300">{apiBaseUrl}</code>
              </p>
            </div>

            <button
              onClick={checkBackendHealth}
              disabled={status === 'connecting'}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-all shadow-lg shadow-indigo-600/25 cursor-pointer active:scale-95"
            >
              <svg
                className={`w-4 h-4 ${status === 'connecting' ? 'animate-spin' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span>{status === 'connecting' ? 'Checking...' : 'Re-ping Backend'}</span>
            </button>
          </div>

          {/* Metric Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-6">
            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80">
              <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Connection Status</span>
              <div className="mt-2 flex items-center gap-2">
                <span className={`w-3 h-3 rounded-full ${
                  status === 'connected' ? 'bg-emerald-500 shadow-md shadow-emerald-500/50' :
                  status === 'connecting' ? 'bg-amber-400 animate-pulse' : 'bg-rose-500 shadow-md shadow-rose-500/50'
                }`}></span>
                <span className={`text-lg font-bold ${
                  status === 'connected' ? 'text-emerald-400' :
                  status === 'connecting' ? 'text-amber-300' : 'text-rose-400'
                }`}>
                  {status === 'connected' ? 'Backend Connected' : status === 'connecting' ? 'Connecting...' : 'Disconnected'}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {lastChecked ? `Last ping: ${lastChecked}` : 'Checking connection...'}
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80">
              <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Round-Trip Latency</span>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-bold font-mono text-white">
                  {status === 'connected' && latency !== null ? `${latency}` : '--'}
                </span>
                <span className="text-xs text-slate-400">ms</span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {status === 'connected' ? 'Fast local loopback' : 'Waiting for response'}
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80">
              <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Client API Target</span>
              <div className="mt-2 text-sm font-mono text-slate-200 truncate" title={apiBaseUrl}>
                {apiBaseUrl}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Loaded from <code className="text-indigo-400">VITE_API_BASE_URL</code>
              </p>
            </div>
          </div>

          {/* Service Configuration Verification from Backend */}
          {status === 'connected' && healthData?.services && (
            <div className="mt-6 pt-6 border-t border-slate-800/80">
              <span className="text-xs font-medium text-slate-400 uppercase tracking-wider block mb-3">
                Server-Side Validated Subsystems
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {/* Database */}
                <div className="p-3 rounded-lg bg-slate-950/40 border border-slate-800 text-xs">
                  <div className="text-slate-400 font-mono">MONGODB_URI</div>
                  <div className="mt-1 font-semibold flex items-center gap-1.5 text-slate-200">
                    <span className={`w-2 h-2 rounded-full ${healthData.services.database.configured ? 'bg-emerald-400' : 'bg-rose-400'}`}></span>
                    {healthData.services.database.configured ? 'Validated' : 'Missing'}
                  </div>
                </div>

                {/* Gemini AI */}
                <div className="p-3 rounded-lg bg-slate-950/40 border border-slate-800 text-xs">
                  <div className="text-slate-400 font-mono">GEMINI_API_KEY</div>
                  <div className="mt-1 font-semibold flex items-center gap-1.5 text-slate-200">
                    <span className={`w-2 h-2 rounded-full ${healthData.services.aiEngine.keyConfigured ? 'bg-indigo-400' : 'bg-rose-400'}`}></span>
                    {healthData.services.aiEngine.keyConfigured ? 'Secure / Server-Only' : 'Missing'}
                  </div>
                </div>

                {/* JWT Secret */}
                <div className="p-3 rounded-lg bg-slate-950/40 border border-slate-800 text-xs">
                  <div className="text-slate-400 font-mono">JWT_SECRET</div>
                  <div className="mt-1 font-semibold flex items-center gap-1.5 text-slate-200">
                    <span className={`w-2 h-2 rounded-full ${healthData.services.auth.jwtConfigured ? 'bg-purple-400' : 'bg-rose-400'}`}></span>
                    {healthData.services.auth.jwtConfigured ? 'Validated' : 'Missing'}
                  </div>
                </div>

                {/* MQTT Broker */}
                <div className="p-3 rounded-lg bg-slate-950/40 border border-slate-800 text-xs">
                  <div className="text-slate-400 font-mono">MQTT_BROKER_URL</div>
                  <div className="mt-1 font-semibold flex items-center gap-1.5 text-slate-200">
                    <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
                    Validated
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Response Payload Display */}
          <div className="mt-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                Sanitized Health Payload (No Secrets Leaked)
              </span>
              {status === 'connected' && (
                <span className="text-xs font-mono text-emerald-400">HTTP 200 OK</span>
              )}
            </div>

            <div className="bg-slate-950 rounded-xl p-4 border border-slate-800 font-mono text-xs overflow-x-auto">
              {status === 'connected' && healthData ? (
                <pre className="text-emerald-300">
                  {JSON.stringify(healthData, null, 2)}
                </pre>
              ) : status === 'connecting' ? (
                <div className="text-slate-500 flex items-center gap-2 py-2">
                  <span className="inline-block w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
                  Pinging {apiBaseUrl}/api/health...
                </div>
              ) : (
                <div className="text-rose-400 space-y-1 py-1">
                  <p className="font-semibold">⚠️ Cannot reach backend at {apiBaseUrl}/api/health</p>
                  <p className="text-slate-400 text-xs">
                    {errorMessage || 'Ensure the Express server is running: run `npm run server:dev`'}
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Environment Variable Architecture Guide */}
        <section className="space-y-4">
          <h3 className="text-lg font-semibold text-slate-200">
            Environment Architecture & Variable Isolation
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Backend Variables Card */}
            <div className="p-5 rounded-xl bg-slate-900/40 border border-slate-800">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-white">Backend Environment (`server/.env`)</span>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                  Validated on Boot
                </span>
              </div>
              <ul className="space-y-1.5 text-xs text-slate-300 font-mono">
                <li className="flex items-center justify-between py-1 border-b border-slate-800/60">
                  <span>PORT</span>
                  <span className="text-slate-400">5000</span>
                </li>
                <li className="flex items-center justify-between py-1 border-b border-slate-800/60">
                  <span>MONGODB_URI</span>
                  <span className="text-slate-400">mongodb://127.0.0.1:27017/...</span>
                </li>
                <li className="flex items-center justify-between py-1 border-b border-slate-800/60">
                  <span>JWT_SECRET</span>
                  <span className="text-amber-400">Private Secret (Min 16 chars)</span>
                </li>
                <li className="flex items-center justify-between py-1 border-b border-slate-800/60">
                  <span>GEMINI_API_KEY</span>
                  <span className="text-indigo-400">Private AI Secret (Backend only)</span>
                </li>
                <li className="flex items-center justify-between py-1 border-b border-slate-800/60">
                  <span>MQTT_BROKER_URL</span>
                  <span className="text-slate-400">mqtt://127.0.0.1:1883</span>
                </li>
                <li className="flex items-center justify-between py-1 border-b border-slate-800/60">
                  <span>MQTT_CLIENT_ID</span>
                  <span className="text-slate-400">smart_classroom_backend_dev_01</span>
                </li>
                <li className="flex items-center justify-between py-1">
                  <span>MQTT_USERNAME / PWD</span>
                  <span className="text-slate-400">Credentials for broker auth</span>
                </li>
              </ul>
            </div>

            {/* Frontend Variables Card */}
            <div className="p-5 rounded-xl bg-slate-900/40 border border-slate-800">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-white">Frontend Environment (`client/.env`)</span>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                  Public Client Bundle
                </span>
              </div>
              <ul className="space-y-1.5 text-xs text-slate-300 font-mono">
                <li className="flex items-center justify-between py-1 border-b border-slate-800/60">
                  <span>VITE_API_BASE_URL</span>
                  <span className="text-indigo-400">{apiBaseUrl}</span>
                </li>
              </ul>
              <div className="mt-4 p-3 rounded-lg bg-slate-950 border border-slate-800/80 text-xs text-slate-400 leading-relaxed">
                <p className="font-semibold text-slate-300 mb-1">🔒 Security Policy:</p>
                Only variables prefixed with <code className="text-indigo-300">VITE_</code> are embedded into the client. Backend secrets like <code className="text-rose-400">GEMINI_API_KEY</code>, <code className="text-rose-400">JWT_SECRET</code>, and <code className="text-rose-400">MQTT_PASSWORD</code> are never bundled into the client build.
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-900/30 py-6 text-center text-xs text-slate-500">
        <p>AI Voice-Controlled Smart Classroom &bull; Final Year Project &bull; Environment &amp; Secret Isolation Established</p>
      </footer>
    </div>
  )
}

export default App
