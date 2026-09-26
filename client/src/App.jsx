import { useState, useEffect } from 'react'
import { AuthProvider, useAuth } from './context/AuthContext'
import { LoginPage } from './components/LoginPage'
import { AuthenticatedView } from './components/AuthenticatedView'

function AppContent() {
  const { isAuthenticated, isLoading, user } = useAuth()
  const [healthData, setHealthData] = useState(null)
  const [backendStatus, setBackendStatus] = useState('connecting') // 'connected' | 'connecting' | 'error'
  const [latency, setLatency] = useState(null)

  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'

  const checkBackendHealth = async () => {
    setBackendStatus('connecting')
    const startTime = performance.now()

    try {
      const response = await fetch(`${apiBaseUrl}/api/health`, {
        headers: { Accept: 'application/json' },
      })
      const endTime = performance.now()
      setLatency(Math.round(endTime - startTime))

      if (!response.ok) {
        throw new Error(`Server returned HTTP ${response.status}`)
      }

      const data = await response.json()
      setHealthData(data)
      setBackendStatus('connected')
    } catch {
      setBackendStatus('error')
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
                JWT Auth
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Backend connection indicator */}
            <div
              className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                backendStatus === 'connected'
                  ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                  : backendStatus === 'connecting'
                  ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                  : 'bg-rose-500/10 text-rose-300 border-rose-500/30'
              }`}
            >
              <span className="relative flex h-2 w-2">
                {backendStatus === 'connected' && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                )}
                <span
                  className={`relative inline-flex rounded-full h-2 w-2 ${
                    backendStatus === 'connected'
                      ? 'bg-emerald-500'
                      : backendStatus === 'connecting'
                      ? 'bg-amber-400'
                      : 'bg-rose-500'
                  }`}
                ></span>
              </span>
              <span>
                {backendStatus === 'connected'
                  ? `API Connected (${latency}ms)`
                  : backendStatus === 'connecting'
                  ? 'Connecting...'
                  : 'API Offline'}
              </span>
            </div>

            {/* Auth status indicator */}
            {isAuthenticated && (
              <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-medium font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400"></span>
                {user?.role}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-10 flex flex-col gap-8 justify-center">
        {isLoading ? (
          <div className="text-center py-20 space-y-4">
            <div className="w-12 h-12 mx-auto rounded-full border-2 border-indigo-500/20 border-t-indigo-500 animate-spin"></div>
            <p className="text-slate-400 text-sm font-mono">Restoring authenticated session via /api/auth/me...</p>
          </div>
        ) : isAuthenticated ? (
          <AuthenticatedView />
        ) : (
          <div className="space-y-8">
            <div className="text-center space-y-2 max-w-xl mx-auto">
              <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
                AI Voice-Controlled{' '}
                <span className="bg-gradient-to-r from-indigo-400 via-purple-300 to-pink-400 bg-clip-text text-transparent">
                  Smart Classroom
                </span>
              </h1>
              <p className="text-slate-400 text-xs sm:text-sm">
                Secure JWT Authentication Layer &bull; Session Persistence &bull; Role Enforcement
              </p>
            </div>

            <LoginPage />
          </div>
        )}

        {/* System Health Footer Panel */}
        <section className="mt-auto pt-6 border-t border-slate-800/60 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-3">
          <div>
            <span>Backend Target: </span>
            <code className="text-indigo-400 font-mono">{apiBaseUrl}</code>
            {healthData?.services?.database && (
              <span className="ml-3 text-slate-400">
                &bull; MongoDB: <span className="text-emerald-400 font-semibold">{healthData.services.database.status}</span>
              </span>
            )}
          </div>

          <button
            onClick={checkBackendHealth}
            className="text-slate-400 hover:text-slate-200 underline cursor-pointer text-[11px]"
          >
            Re-ping API Health
          </button>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-900/30 py-4 text-center text-xs text-slate-500">
        <p>AI Voice-Controlled Smart Classroom &bull; Final Year Project &bull; JWT Authentication Established</p>
      </footer>
    </div>
  )
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}

export default App
