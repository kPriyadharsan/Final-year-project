import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export function NotFoundPage() {
  const { isAuthenticated, user } = useAuth()

  // Determine smart fallback destination based on authentication & role
  const homeTarget = !isAuthenticated
    ? '/login'
    : user?.role === 'SUPER_ADMIN'
    ? '/admin'
    : user?.role === 'TEACHER'
    ? '/teacher'
    : '/login'

  return (
    <div className="min-h-[65vh] flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-slate-900/70 border border-slate-800/80 rounded-2xl p-8 backdrop-blur-xl shadow-2xl text-center relative overflow-hidden">
        {/* Glow Accent */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-48 bg-rose-500/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="w-16 h-16 mx-auto rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center font-mono text-2xl font-extrabold mb-4 shadow-lg shadow-rose-500/10">
          404
        </div>

        <h1 className="text-2xl font-bold text-white tracking-tight">Page Not Found</h1>
        <p className="text-xs text-slate-400 mt-2 leading-relaxed">
          The requested route does not exist or has been moved.
        </p>

        <div className="mt-6 pt-5 border-t border-slate-800/80">
          <Link
            to={homeTarget}
            className="inline-flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-medium text-xs transition-all shadow-lg shadow-indigo-600/25"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            <span>Return to {isAuthenticated ? 'Dashboard' : 'Login'}</span>
          </Link>
        </div>
      </div>
    </div>
  )
}
