import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Sparkles, Lock, Mail, Eye, EyeOff, ShieldCheck } from 'lucide-react'
import { useMobileLayout, useHaptics } from '../hooks'

const TEST_ACCOUNTS = {
  admin: {
    key: 'admin',
    role: 'SUPER_ADMIN',
    label: 'Super Admin',
    email: 'admin@smartclassroom.edu',
    password: 'SuperAdminSecure2026!',
  },
  teacher: {
    key: 'teacher',
    role: 'TEACHER',
    label: 'Teacher',
    email: 'alakesanece@gmail.com',
    password: '7418529630',
  },
  student: {
    key: 'student',
    role: 'STUDENT',
    label: 'Student',
    email: 'vidhya@gmail.com',
    password: '147258369',
  },
}

export function LoginPage() {
  const { login, authError, clearError, isLoading, isAuthenticated, user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { isMobile } = useMobileLayout()
  const { triggerHaptic } = useHaptics()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [fieldErrors, setFieldErrors] = useState({})
  const [selectedRole, setSelectedRole] = useState(null)

  // Helper to determine destination route based on role
  const getRoleDestination = (role) => {
    if (role === 'SUPER_ADMIN') return '/admin'
    if (role === 'TEACHER') return '/teacher'
    if (role === 'STUDENT') return '/student'
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

  // Test account shortcut selector (populates fields, DOES NOT auto-submit)
  const handleSelectTestAccount = (roleKey) => {
    triggerHaptic('selection')
    const account = TEST_ACCOUNTS[roleKey]
    if (!account) return

    setSelectedRole(roleKey)
    setEmail(account.email)
    setPassword(account.password)
    setFieldErrors({})
    clearError()
  }

  return (
    <div className="w-full max-w-md mx-auto px-2 sm:px-0">
      {/* iOS 27 Liquid Glass Login Card */}
      <div className="bg-white/80 border border-white/90 rounded-2xl sm:rounded-[32px] p-5 sm:p-8 backdrop-blur-3xl shadow-[0_20px_50px_rgba(0,0,0,0.06),0_1px_1px_rgba(255,255,255,0.9)_inset] relative overflow-hidden">
        {/* Specular Liquid Top Glint */}
        <div className="absolute inset-x-8 sm:inset-x-12 top-0 h-[1px] bg-gradient-to-r from-transparent via-white to-transparent pointer-events-none" />

        {/* Card Header */}
        <div className="text-center space-y-2 mb-6 sm:mb-8">
          <div className="w-12 h-12 sm:w-14 sm:h-14 mx-auto rounded-2xl sm:rounded-3xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-violet-600 flex items-center justify-center shadow-lg shadow-blue-500/25 text-white mb-3 sm:mb-4">
            <Sparkles className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
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
                  setSelectedRole(null)
                  if (fieldErrors.email) setFieldErrors({ ...fieldErrors, email: null })
                }}
                disabled={isLoading}
                className={`w-full pl-10 pr-3.5 py-3 sm:py-3 rounded-2xl bg-slate-100/80 hover:bg-slate-100 focus:bg-white border text-base sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-blue-500/10 transition-all font-sans ${
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
                  setSelectedRole(null)
                  if (fieldErrors.password) setFieldErrors({ ...fieldErrors, password: null })
                }}
                disabled={isLoading}
                className={`w-full pl-10 pr-10 py-3 sm:py-3 rounded-2xl bg-slate-100/80 hover:bg-slate-100 focus:bg-white border text-base sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-blue-500/10 transition-all font-sans ${
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

          {/* Submit Button: Centered with 48px height on mobile */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full mt-3 min-h-[48px] py-3 px-5 rounded-2xl bg-[#0071e3] hover:bg-[#0077ed] active:bg-[#0062c4] text-white font-bold text-sm transition-all duration-150 shadow-md shadow-blue-500/25 active:scale-[0.98] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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

        {/* Convenient Test Role Autofill Shortcuts (No Auto-submit) */}
        <div className="mt-6 sm:mt-8 pt-5 sm:pt-6 border-t border-slate-100 text-center">
          <p className="text-[11px] uppercase tracking-wider text-slate-400 mb-3 font-semibold">
            Test Accounts
          </p>

          <div className="grid grid-cols-3 gap-2 sm:gap-2.5">
            {/* Admin Test Button */}
            <button
              type="button"
              onClick={() => handleSelectTestAccount('admin')}
              className={`flex items-center justify-center gap-1.5 py-2 px-2.5 sm:px-3 rounded-xl border text-xs font-semibold transition-all cursor-pointer active:scale-95 ${
                selectedRole === 'admin'
                  ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-500/25 ring-2 ring-blue-500/30'
                  : 'bg-blue-50/80 hover:bg-blue-100/90 text-blue-700 border-blue-200/80'
              }`}
              title="Autofill Super Admin (admin@smartclassroom.edu)"
            >
              <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
              <span>Super Admin</span>
            </button>

            {/* Teacher Test Button */}
            <button
              type="button"
              onClick={() => handleSelectTestAccount('teacher')}
              className={`flex items-center justify-center gap-1.5 py-2 px-2.5 sm:px-3 rounded-xl border text-xs font-semibold transition-all cursor-pointer active:scale-95 ${
                selectedRole === 'teacher'
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-500/25 ring-2 ring-indigo-500/30'
                  : 'bg-indigo-50/80 hover:bg-indigo-100/90 text-indigo-700 border-indigo-200/80'
              }`}
              title="Autofill Teacher (alakesanece@gmail.com)"
            >
              <span>Teacher</span>
            </button>

            {/* Student Test Button */}
            <button
              type="button"
              onClick={() => handleSelectTestAccount('student')}
              className={`flex items-center justify-center gap-1.5 py-2 px-2.5 sm:px-3 rounded-xl border text-xs font-semibold transition-all cursor-pointer active:scale-95 ${
                selectedRole === 'student'
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-500/25 ring-2 ring-emerald-500/30'
                  : 'bg-emerald-50/80 hover:bg-emerald-100/90 text-emerald-700 border-emerald-200/80'
              }`}
              title="Autofill Student (vidhya@gmail.com)"
            >
              <span>Student</span>
            </button>
          </div>

          <p className="text-[10px] text-slate-400 mt-2.5">
            Clicking a role autofills the credentials. Click &ldquo;Sign In&rdquo; to log in.
          </p>
        </div>
      </div>
    </div>
  )
}
