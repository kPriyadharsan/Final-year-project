import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { testProtectedRoute } from '../services/auth.service'

export function TeacherPage() {
  const { user, token, logout } = useAuth()
  const [testResult, setTestResult] = useState(null)
  const [isTesting, setIsTesting] = useState(false)

  const handleTestTeacherRoute = async () => {
    setIsTesting(true)
    try {
      const result = await testProtectedRoute('/api/teacher/test', token)
      setTestResult({
        status: result.status,
        ok: result.ok,
        data: result.data,
        timestamp: new Date().toLocaleTimeString(),
      })
    } catch (err) {
      setTestResult({
        status: 500,
        ok: false,
        data: { message: err.message },
        timestamp: new Date().toLocaleTimeString(),
      })
    } finally {
      setIsTesting(false)
    }
  }

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      {/* Teacher Header Banner */}
      <div className="bg-slate-900/70 border border-slate-800/80 rounded-2xl p-6 sm:p-8 backdrop-blur-xl shadow-2xl relative overflow-hidden">
        {/* Glow Accent */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none -mr-16 -mt-16"></div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-slate-800/80">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-cyan-500/20 font-bold text-lg">
              📚
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl font-bold text-white tracking-tight">Teacher Portal</h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-semibold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                  /teacher
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5 font-mono">
                Route protected strictly for <code className="text-cyan-300">TEACHER</code> role
              </p>
            </div>
          </div>

          <button
            onClick={logout}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl bg-slate-800 hover:bg-rose-600/90 text-slate-200 hover:text-white border border-slate-700/80 hover:border-rose-500/80 transition-all cursor-pointer shadow-md"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            <span>Log Out</span>
          </button>
        </div>

        {/* Teacher Details Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-6">
          <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
            <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block">Faculty Member</span>
            <div className="mt-1 text-xs font-semibold text-white truncate">{user?.name}</div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
            <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block">Email Address</span>
            <div className="mt-1 text-xs font-mono text-cyan-300 truncate">{user?.email}</div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
            <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block">Department</span>
            <div className="mt-1 text-xs font-semibold text-slate-200 truncate">
              {user?.department || 'General Faculty'}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
            <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block">Role Authorization</span>
            <div className="mt-1 text-xs font-semibold text-cyan-400 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
              TEACHER
            </div>
          </div>
        </div>
      </div>

      {/* Backend Teacher Route Verification Box */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 sm:p-8 backdrop-blur-xl shadow-2xl">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 mb-4 border-b border-slate-800/80">
          <div>
            <h2 className="text-base font-semibold text-white">Backend Teacher Route Verification</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Execute <code className="text-cyan-300">GET /api/teacher/test</code> using your authenticated Bearer token.
            </p>
          </div>

          <button
            onClick={handleTestTeacherRoute}
            disabled={isTesting}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium transition-all cursor-pointer shadow-lg shadow-cyan-600/25 disabled:opacity-50"
          >
            {isTesting ? (
              <>
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Verifying...</span>
              </>
            ) : (
              <span>Test GET /api/teacher/test</span>
            )}
          </button>
        </div>

        {/* Live Output */}
        {testResult && (
          <div className="rounded-xl bg-slate-950 border border-slate-800 p-4 font-mono text-xs">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800/80">
              <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                testResult.ok ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
              }`}>
                HTTP {testResult.status} {testResult.ok ? 'OK' : 'DENIED'}
              </span>
              <span className="text-[11px] text-slate-500">{testResult.timestamp}</span>
            </div>
            <pre className={testResult.ok ? 'text-emerald-300' : 'text-rose-300'}>
              {JSON.stringify(testResult.data, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  )
}
