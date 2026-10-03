import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Sparkles, Lock, Mail, Eye, EyeOff, ShieldCheck } from 'lucide-react'

export function LoginPage() {
  const { login, authError, clearError, isLoading, isAuthenticated, user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [fieldErrors, setFieldErrors] = useState({})

  // Helper to determine destination route based on role
  const getRoleDestination = (role) => {
    if (role === 'SUPER_ADMIN') return '/admin'
    if (role === 'TEACHER') return '/teacher'
    return '/login'
  }

  // If already authenticated, redirect to destination
  useEffect(() => {
    if (isAuthenticated && user) {
      const destination = location.state?.from?.pathname || getRoleDestination(user.role)
      navigate(destination, { replace: true })
    }
  }, [isAuthenticated, user, navigate, location])

  const validate = () => {
    const errors = {}
    if (!email.trim()) {
      errors.email = 'Email address is required.'
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      errors.email = 'Please enter a valid email format.'
    }

    if (!password) {
      errors.password = 'Password is required.'
    }

    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    clearError()

    if (!validate()) return

    try {
      const result = await login(email.trim(), password)
      const destination = location.state?.from?.pathname || getRoleDestination(result.user?.role)
      navigate(destination, { replace: true })
    } catch {
      // Error is captured and rendered via AuthContext authError
    }
  }

  // Quick helper to populate initial seeded Super Admin credentials
  const populateDemoAdmin = () => {
    setEmail('admin@smartclassroom.edu')
    setPassword('SuperAdminSecure2026!')
    setFieldErrors({})
    clearError()
  }

  return (
    <div className="w-full max-w-md mx-auto">
      {/* iOS 27 Liquid Glass Login Card */}
      <div className="bg-white/80 border border-white/90 rounded-[32px] p-7 sm:p-9 backdrop-blur-3xl shadow-[0_20px_50px_rgba(0,0,0,0.06),0_1px_1px_rgba(255,255,255,0.9)_inset] relative overflow-hidden">
        {/* Specular Liquid Top Glint */}
        <div className="absolute inset-x-12 top-0 h-[1px] bg-gradient-to-r from-transparent via-white to-transparent pointer-events-none" />

        {/* Card Header */}
        <div className="text-center space-y-2 mb-8">
          <div className="w-14 h-14 mx-auto rounded-3xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-violet-600 flex items-center justify-center shadow-lg shadow-blue-500/25 text-white mb-4">
            <Sparkles className="w-7 h-7 text-white" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Smart Classroom
          </h2>
          <p className="text-xs text-slate-500 leading-relaxed max-w-xs mx-auto">
            AI Voice-Controlled Facility Management &bull; Sign In to Continue
          </p>
        </div>

        {/* Error Alert Banner */}
        {authError && (
          <div className="mb-5 p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2.5 animate-fadeIn shadow-sm">
            <svg className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="flex-1">
              <span className="font-bold block">Authentication Failed</span>
              <span>{authError}</span>
            </div>
            <button
              onClick={clearError}
              className="text-rose-500 hover:text-rose-800 text-base font-bold leading-none cursor-pointer"
              title="Dismiss error"
            >
              &times;
            </button>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {/* Email Input */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5" htmlFor="email-input">
              Campus Email Address
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Mail className="w-4 h-4" />
              </div>
              <input
                id="email-input"
                type="email"
                autoComplete="email"
                placeholder="name@smartclassroom.edu"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  if (fieldErrors.email) setFieldErrors({ ...fieldErrors, email: null })
                }}
                disabled={isLoading}
                className={`w-full pl-10 pr-3.5 py-3 rounded-2xl bg-slate-100/80 hover:bg-slate-100 focus:bg-white border text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-blue-500/10 transition-all font-sans ${
                  fieldErrors.email
                    ? 'border-rose-400 focus:border-rose-500'
                    : 'border-slate-200/80 focus:border-blue-500'
                }`}
              />
            </div>
            {fieldErrors.email && (
              <p className="mt-1.5 text-xs text-rose-600 font-medium">{fieldErrors.email}</p>
            )}
          </div>

          {/* Password Input */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-slate-700" htmlFor="password-input">
                Account Password
              </label>
            </div>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Lock className="w-4 h-4" />
              </div>
              <input
                id="password-input"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  if (fieldErrors.password) setFieldErrors({ ...fieldErrors, password: null })
                }}
                disabled={isLoading}
                className={`w-full pl-10 pr-10 py-3 rounded-2xl bg-slate-100/80 hover:bg-slate-100 focus:bg-white border text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-blue-500/10 transition-all font-sans ${
                  fieldErrors.password
                    ? 'border-rose-400 focus:border-rose-500'
                    : 'border-slate-200/80 focus:border-blue-500'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {fieldErrors.password && (
              <p className="mt-1.5 text-xs text-rose-600 font-medium">{fieldErrors.password}</p>
            )}
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full mt-3 py-3 px-5 rounded-2xl bg-[#0071e3] hover:bg-[#0077ed] active:bg-[#0062c4] text-white font-semibold text-sm transition-all duration-150 shadow-md shadow-blue-500/25 active:scale-[0.98] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Authenticating...</span>
              </>
            ) : (
              <span>Sign In to Classroom</span>
            )}
          </button>
        </form>

        {/* Quick Demo Credentials Helper */}
        <div className="mt-8 pt-6 border-t border-slate-100 text-center">
          <p className="text-[11px] text-slate-400 mb-2.5 font-medium">Quick Development Testing</p>
          <button
            type="button"
            onClick={populateDemoAdmin}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-50 hover:bg-blue-100 border border-blue-200/80 text-blue-700 transition-all text-xs font-medium cursor-pointer shadow-sm"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
            <span>Use Seeded Super Admin Credentials</span>
          </button>
        </div>
      </div>
    </div>
  )
}
