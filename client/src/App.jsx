import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { SocketProvider } from './context/SocketContext'
import { CenterActionProvider } from './hooks'
import { ProtectedRoute } from './components/ProtectedRoute'
import { LoginPage } from './components/LoginPage'
import { AdminPage } from './pages/AdminPage'
import { TeacherPage } from './pages/TeacherPage'
import { StudentPage } from './pages/StudentPage'
import { DeviceControlPage } from './pages/DeviceControlPage'
import { VoiceControlPage } from './pages/VoiceControlPage'
import { NotFoundPage } from './pages/NotFoundPage'

/**
 * Smart redirection component for root path ("/")
 */
function HomeRedirect() {
  const { isAuthenticated, isLoading, user } = useAuth()

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex flex-col items-center justify-center space-y-4">
        <div className="w-12 h-12 rounded-full border-2 border-blue-500/20 border-t-blue-600 animate-spin"></div>
        <p className="text-slate-500 text-xs font-medium animate-pulse">
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

  if (user.role === 'STUDENT') {
    return <Navigate to="/student" replace />
  }

  return <Navigate to="/login" replace />
}

/**
 * Clean wrapper layout for public authentication and 404 pages (Apple iOS 27 Theme)
 */
function PublicLayout({ children }) {
  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 flex flex-col justify-between selection:bg-blue-500/20 selection:text-blue-900 relative">
      {/* iOS 27 Background Fluid Glow Accents */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute -top-40 -left-40 w-[500px] h-[500px] bg-gradient-to-br from-blue-300/25 to-indigo-300/20 rounded-full blur-3xl opacity-70"></div>
        <div className="absolute top-1/3 -right-40 w-[500px] h-[500px] bg-gradient-to-br from-purple-300/20 via-pink-200/20 to-transparent rounded-full blur-3xl opacity-60"></div>
        <div className="absolute -bottom-40 left-1/3 w-[500px] h-[500px] bg-gradient-to-tr from-cyan-300/20 to-blue-200/20 rounded-full blur-3xl opacity-60"></div>
      </div>

      <div className="flex-1 flex items-center justify-center p-2.5 sm:p-4 py-4 sm:py-8">
        {children}
      </div>

      <footer className="border-t border-slate-200/70 bg-white/50 backdrop-blur-md py-4 text-center text-xs text-slate-500">
        <p>AI Voice-Controlled Smart Classroom &bull; Apple iOS 27 Vision Theme</p>
      </footer>
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <SocketProvider>
          <CenterActionProvider>
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

              {/* Dedicated Hardware Console: /admin/device-control (SUPER_ADMIN, TEACHER) */}
              <Route
                path="/admin/device-control"
                element={
                  <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'TEACHER']}>
                    <DeviceControlPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/device-control"
                element={
                  <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'TEACHER']}>
                    <DeviceControlPage />
                  </ProtectedRoute>
                }
              />

              {/* Protected route: /teacher (TEACHER only) */}
              <Route
                path="/teacher"
                element={
                  <ProtectedRoute allowedRoles={['TEACHER', 'SUPER_ADMIN']}>
                    <TeacherPage />
                  </ProtectedRoute>
                }
              />

              {/* Dedicated Standalone Voice Control (ChatGPT Voice UI) */}
              <Route
                path="/voice"
                element={
                  <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'TEACHER', 'STUDENT']}>
                    <VoiceControlPage />
                  </ProtectedRoute>
                }
              />

              {/* Protected route: /student (STUDENT only) */}
              <Route
                path="/student"
                element={
                  <ProtectedRoute allowedRoles={['STUDENT', 'SUPER_ADMIN']}>
                    <StudentPage />
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
          </CenterActionProvider>
        </SocketProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
