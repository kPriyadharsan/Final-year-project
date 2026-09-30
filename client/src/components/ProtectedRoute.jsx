import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

/**
 * ProtectedRoute Component
 *
 * Requirements:
 * - Unauthenticated users are redirected to /login with return location
 * - Validates authenticated user role against allowedRoles
 * - Wrong roles are redirected to their respective role home (e.g. TEACHER -> /teacher, SUPER_ADMIN -> /admin)
 * - Displays a loading spinner while session is being verified
 *
 * @param {Object} props
 * @param {string[]} [props.allowedRoles] - Optional array of authorized roles
 * @param {React.ReactNode} [props.children] - Children to render if authorized
 */
export function ProtectedRoute({ allowedRoles, children }) {
  const { user, isAuthenticated, isLoading } = useAuth()
  const location = useLocation()

  // 1. Show elegant loading state while session restoration is in progress
  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center space-y-4">
        <div className="w-12 h-12 rounded-full border-2 border-indigo-500/20 border-t-indigo-500 animate-spin"></div>
        <p className="text-slate-400 text-xs font-mono animate-pulse">
          Verifying session &amp; authorization...
        </p>
      </div>
    )
  }

  // 2. Unauthenticated: Redirect to /login with state
  if (!isAuthenticated || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  // 3. Role-based authorization check: Redirect wrong roles to their permitted page
  if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    if (user.role === 'SUPER_ADMIN') {
      return <Navigate to="/admin" replace />
    }
    if (user.role === 'TEACHER') {
      return <Navigate to="/teacher" replace />
    }
    // Any other unauthorized role (e.g. STUDENT)
    return <Navigate to="/login" replace />
  }

  return children
}
