import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { testProtectedRoute } from '../services/auth.service'

export function AuthenticatedView() {
  const { user, token, logout } = useAuth()
  const [testResult, setTestResult] = useState(null)
  const [testingEndpoint, setTestingEndpoint] = useState(null)

  const handleTestRoute = async (endpointPath, label) => {
    setTestingEndpoint(endpointPath)
    try {
      const result = await testProtectedRoute(endpointPath, token)
      setTestResult({
        endpoint: endpointPath,
        label,
        status: result.status,
        ok: result.ok,
        data: result.data,
        timestamp: new Date().toLocaleTimeString(),
      })
    } catch (err) {
      setTestResult({
        endpoint: endpointPath,
        label,
        status: 500,
        ok: false,
        data: { message: err.message },
        timestamp: new Date().toLocaleTimeString(),
      })
    } finally {
      setTestingEndpoint(null)
    }
  }

  // Role badge color style
  const getRoleBadgeStyle = (role) => {
    switch (role) {
      case 'SUPER_ADMIN':
        return 'bg-purple-500/15 text-purple-300 border-purple-500/30'
      case 'TEACHER':
        return 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
      case 'STUDENT':
        return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
      default:
        return 'bg-slate-500/15 text-slate-300 border-slate-500/30'
    }
  }

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      {/* User Session Banner Card */}
      <div className="bg-slate-900/70 border border-slate-800/80 rounded-2xl p-6 sm:p-8 backdrop-blur-xl shadow-2xl relative overflow-hidden">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-slate-800/80">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-500 flex items-center justify-center text-white shadow-lg shadow-emerald-500/20 font-bold text-lg">
              {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-xl font-bold text-white">{user?.name}</h2>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-mono font-semibold border ${getRoleBadgeStyle(user?.role)}`}>
                  {user?.role}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5 font-mono">{user?.email}</p>
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

        {/* User Profile Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-6">
          <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
            <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block">Session State</span>
            <div className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              Restored &amp; Active
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
            <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block">Dashboard Privilege</span>
            <div className="mt-1 text-xs font-semibold text-slate-200">
              {user?.hasDashboardAccess ? '✅ Authorized' : '❌ Restricted'}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
            <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block">Department</span>
            <div className="mt-1 text-xs font-semibold text-slate-200 truncate">
              {user?.department || 'Administration'}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
            <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block">Account Status</span>
            <div className="mt-1 text-xs font-semibold text-slate-200">
              {user?.isActive ? 'Active User' : 'Deactivated'}
            </div>
          </div>
        </div>

        {/* Secure Token Preview */}
        <div className="mt-5 p-3.5 rounded-xl bg-slate-950/80 border border-slate-800/80 text-xs">
          <div className="flex items-center justify-between mb-1">
            <span className="text-slate-400 font-medium">Session Token (Bearer JWT in localStorage):</span>
            <span className="text-emerald-400 font-mono text-[11px]">Valid 24h &bull; Verified via /api/auth/me</span>
          </div>
          <div className="font-mono text-indigo-300 text-[11px] truncate">
            {token ? `Bearer ${token.substring(0, 32)}...${token.substring(token.length - 16)}` : 'None'}
          </div>
        </div>
      </div>

      {/* Role-Based Authorization Testing Console */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 sm:p-8 backdrop-blur-xl shadow-2xl">
        <div className="border-b border-slate-800/80 pb-4 mb-5">
          <h3 className="text-base font-semibold text-white">Live Role-Based Access Control (RBAC) Verification</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Test backend protected endpoints using your current session's verified JWT token.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => handleTestRoute('/api/admin/test', 'Super Admin Route')}
            disabled={testingEndpoint !== null}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 text-xs font-medium transition-all cursor-pointer disabled:opacity-50"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400"></span>
            <span>Test GET /api/admin/test</span>
          </button>

          <button
            onClick={() => handleTestRoute('/api/teacher/test', 'Teacher Route')}
            disabled={testingEndpoint !== null}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 border border-cyan-500/30 text-xs font-medium transition-all cursor-pointer disabled:opacity-50"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
            <span>Test GET /api/teacher/test</span>
          </button>
        </div>

        {/* Live RBAC Output */}
        {testResult && (
          <div className="mt-5 rounded-xl bg-slate-950 border border-slate-800 p-4 font-mono text-xs animate-fadeIn">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800/80">
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                  testResult.ok ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                }`}>
                  HTTP {testResult.status} {testResult.ok ? 'OK' : 'FORBIDDEN'}
                </span>
                <span className="text-slate-300 font-semibold">{testResult.endpoint}</span>
              </div>
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
