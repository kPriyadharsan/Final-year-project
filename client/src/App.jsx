import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { SocketProvider } from './context/SocketContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { LoginPage } from './components/LoginPage'
import { AdminPage } from './pages/AdminPage'
import { TeacherPage } from './pages/TeacherPage'
import { NotFoundPage } from './pages/NotFoundPage'

/**
 * Smart redirection component for root path ("/")
 */
function HomeRedirect() {
  const { isAuthenticated, isLoading, user } = useAuth()

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center space-y-4">
        <div className="w-12 h-12 rounded-full border-2 border-indigo-500/20 border-t-indigo-500 animate-spin"></div>
        <p className="text-slate-400 text-xs font-mono animate-pulse">
          Initializing Smart Classroom session...
        </p>
      </div>
    )
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />
  }

  if (user.role === 'SUPER_ADMIN') {
    return <Navigate to="/admin" replace />
  }

  if (user.role === 'TEACHER') {
    return <Navigate to="/teacher" replace />
  }

  return <Navigate to="/login" replace />
}

/**
 * Clean wrapper layout for public authentication and 404 pages
 */
function PublicLayout({ children }) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-indigo-500 selection:text-white">
      {/* Background Glow Accents */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl"></div>
        <div className="absolute top-1/3 -right-40 w-96 h-96 bg-purple-600/20 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 left-1/3 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl"></div>
      </div>

      <div className="flex-1 flex items-center justify-center p-4">
        {children}
      </div>

      <footer className="border-t border-slate-800/80 bg-slate-900/30 py-4 text-center text-xs text-slate-500">
        <p>AI Voice-Controlled Smart Classroom &bull; Final Year Project</p>
      </footer>
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <SocketProvider>
          <Routes>
            {/* Root index route: Smart role-based redirect */}
            <Route path="/" element={<HomeRedirect />} />

            {/* Public route: /login */}
            <Route
              path="/login"
              element={
                <PublicLayout>
                  <LoginPage />
                </PublicLayout>
              }
            />

            {/* Protected route: /admin (SUPER_ADMIN only) */}
            <Route
              path="/admin"
              element={
                <ProtectedRoute allowedRoles={['SUPER_ADMIN']}>
                  <AdminPage />
                </ProtectedRoute>
              }
            />

            {/* Protected route: /teacher (TEACHER only) */}
            <Route
              path="/teacher"
              element={
                <ProtectedRoute allowedRoles={['TEACHER']}>
                  <TeacherPage />
                </ProtectedRoute>
              }
            />

            {/* 404 Catch-All Route */}
            <Route
              path="*"
              element={
                <PublicLayout>
                  <NotFoundPage />
                </PublicLayout>
              }
            />
          </Routes>
        </SocketProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
