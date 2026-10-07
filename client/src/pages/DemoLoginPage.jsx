import { useEffect, useState } from 'react'
import { useParams, useSearchParams, useNavigate, Link } from 'react-router-dom'
import {
  QrCode,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  ArrowRight,
  GraduationCap,
  Loader2,
} from 'lucide-react'
import { loginWithDemoToken } from '../services/demoAuth.service'
import { useAuth } from '../context/AuthContext'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Card, CardContent } from '../components/ui/Card'

/**
 * Mobile-optimized student landing page when scanning the demo QR code:
 * https://your-domain/demo-login/<token>
 */
export function DemoLoginPage() {
  const { token: urlToken } = useParams()
  const [searchParams] = useSearchParams()
  const rawToken = urlToken || searchParams.get('token')

  const { loginWithToken } = useAuth()
  const navigate = useNavigate()

  const [status, setStatus] = useState('authenticating') // 'authenticating' | 'success' | 'error'
  const [errorMessage, setErrorMessage] = useState('')
  const [sessionDetails, setSessionDetails] = useState(null)

  useEffect(() => {
    let isMounted = true

    if (!rawToken) {
      setStatus('error')
      setErrorMessage('No demo token provided. Please scan the official demonstration QR code.')
      return
    }

    async function authenticateDemo() {
      try {
        const data = await loginWithDemoToken(rawToken)
        if (!isMounted) return

        // Set session in AuthContext & localStorage
        loginWithToken(data.token, data.user)
        setSessionDetails(data)
        setStatus('success')

        // Auto-redirect to student portal after brief confirmation
        setTimeout(() => {
          if (isMounted) {
            navigate('/student', { replace: true })
          }
        }, 1500)
      } catch (err) {
        if (!isMounted) return
        console.warn('[DemoLoginPage] Authentication error:', err)
        setStatus('error')
        setErrorMessage(
          err.message ||
            'This demo session has expired or was reset by the instructor. Please scan the latest QR code displayed on the screen.'
        )
      }
    }

    authenticateDemo()

    return () => {
      isMounted = false
    }
  }, [rawToken, loginWithToken, navigate])

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 flex flex-col items-center justify-center p-4 relative selection:bg-blue-500/20">
      {/* iOS 27 Fluid Ambient Glow */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10 select-none">
        <div className="absolute -top-32 -left-32 w-[500px] h-[500px] bg-gradient-to-br from-blue-300/25 to-indigo-300/20 rounded-full blur-3xl opacity-70" />
        <div className="absolute top-1/3 -right-32 w-[500px] h-[500px] bg-gradient-to-br from-purple-300/20 via-pink-200/20 to-transparent rounded-full blur-3xl opacity-60" />
      </div>

      <div className="w-full max-w-md animate-fadeIn">
        <Card className="border-slate-200/80 shadow-lg shadow-slate-200/50 backdrop-blur-xl bg-white/90 overflow-hidden">
          <CardContent className="p-6 sm:p-8 flex flex-col items-center text-center space-y-6">
            {/* Header Icon */}
            <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-indigo-500 via-blue-500 to-cyan-500 flex items-center justify-center text-white shadow-md shadow-indigo-500/25">
              <GraduationCap className="w-8 h-8" />
            </div>

            {/* Brand Title */}
            <div>
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <span className="text-xs font-bold uppercase tracking-wider text-indigo-600">
                  Smart Classroom
                </span>
                <Badge variant="purple" size="sm">
                  Demo Session
                </Badge>
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                Student Live Access
              </h1>
            </div>

            {/* Dynamic State Machine */}
            {status === 'authenticating' && (
              <div className="space-y-4 py-4 w-full">
                <div className="w-12 h-12 rounded-full border-3 border-indigo-500/20 border-t-indigo-600 animate-spin mx-auto" />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-slate-800">Verifying Temporary Credential...</p>
                  <p className="text-xs text-slate-500">Checking version and security signatures with backend.</p>
                </div>
              </div>
            )}

            {status === 'success' && (
              <div className="space-y-4 py-2 w-full animate-fadeIn">
                <div className="w-12 h-12 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 mx-auto">
                  <CheckCircle2 className="w-7 h-7" />
                </div>
                <div className="space-y-1">
                  <p className="text-base font-bold text-slate-900">Authenticated Successfully!</p>
                  <p className="text-xs text-slate-500">
                    Connected as <strong className="text-slate-700">{sessionDetails?.user?.name || 'Demo Student'}</strong> (Version #{sessionDetails?.demoGeneration})
                  </p>
                </div>

                <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/80 text-xs text-slate-600 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Assigned Role:</span>
                    <Badge variant="success" size="sm">STUDENT</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Auth Method:</span>
                    <Badge variant="info" size="sm">DEMO_QR</Badge>
                  </div>
                </div>

                <Button
                  variant="primary"
                  size="md"
                  rightIcon={<ArrowRight className="w-4 h-4" />}
                  onClick={() => navigate('/student')}
                  className="w-full justify-center shadow-blue-500/20"
                >
                  Enter Student Portal Now
                </Button>
              </div>
            )}

            {status === 'error' && (
              <div className="space-y-4 py-2 w-full animate-fadeIn">
                <div className="w-12 h-12 rounded-full bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 mx-auto">
                  <AlertCircle className="w-7 h-7" />
                </div>
                <div className="space-y-1">
                  <p className="text-base font-bold text-slate-900">QR Code Invalid or Expired</p>
                  <p className="text-xs text-rose-600 leading-relaxed bg-rose-50/70 p-3 rounded-2xl border border-rose-100">
                    {errorMessage}
                  </p>
                </div>

                <div className="pt-2 flex flex-col gap-2 w-full">
                  <Link to="/login" className="w-full">
                    <Button variant="outline" size="md" className="w-full justify-center">
                      Go to Standard Login
                    </Button>
                  </Link>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Footer */}
        <p className="text-center text-xs text-slate-400 mt-6">
          AI Voice-Controlled Smart Classroom &bull; College Demo Session
        </p>
      </div>
    </div>
  )
}
