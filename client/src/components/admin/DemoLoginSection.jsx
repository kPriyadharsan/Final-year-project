import { useState, useEffect, useCallback, useMemo } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import {
  QrCode,
  RefreshCw,
  LogOut,
  Sparkles,
  Clock,
  ShieldCheck,
  AlertTriangle,
  Copy,
  Check,
  ExternalLink,
  Users,
  Layers,
  Radio,
} from 'lucide-react'
import {
  fetchDemoStatus,
  generateDemoQr,
  resetDemoSessions,
} from '../../services/demoAuth.service'
import { useSocket, useSocketEvent } from '../../context/SocketContext'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../ui/Card'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import { Modal } from '../ui/Modal'

/**
 * Super Admin Temporary QR Demo Management Section
 * Provides projector-ready QR display, generation versioning, real-time expiry countdown,
 * and global session revocation controls.
 */
export function DemoLoginSection({ token, onNotify }) {
  const { isConnected: isSocketConnected } = useSocket()

  const [isLoading, setIsLoading] = useState(true)
  const [isActionLoading, setIsActionLoading] = useState(false)
  const [demoState, setDemoState] = useState(null)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(false)
  const [showConfirmResetModal, setShowConfirmResetModal] = useState(false)
  const [now, setNow] = useState(Date.now())

  // Ticking timer for real-time countdown every second
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  // Load demo status from backend
  const loadStatus = useCallback(
    async (showLoader = true) => {
      if (showLoader) setIsLoading(true)
      setError(null)
      try {
        const data = await fetchDemoStatus(token)
        setDemoState(data)
      } catch (err) {
        console.error('[DemoLoginSection] Failed to load demo status:', err)
        setError(err.message || 'Unable to load demo login status.')
      } finally {
        if (showLoader) setIsLoading(false)
      }
    },
    [token]
  )

  useEffect(() => {
    loadStatus(true)
  }, [loadStatus])

  // Real-time synchronization via Socket.IO
  const handleSocketStatusChanged = useCallback(() => {
    console.log('[DemoLoginSection] 📡 Real-time demo status change received via Socket.IO. Refreshing...')
    loadStatus(false)
  }, [loadStatus])

  useSocketEvent('demo:status_changed', handleSocketStatusChanged)
  useSocketEvent('demo:reset', handleSocketStatusChanged)
  useSocketEvent('demo:revoked', handleSocketStatusChanged)

  // Generate a brand new QR credential
  const handleGenerate = async () => {
    setIsActionLoading(true)
    setError(null)
    try {
      const generated = await generateDemoQr(token)
      setDemoState((prev) => ({
        ...prev,
        generation: generated.generation,
        hasActiveQr: true,
        qrUrl: generated.qrUrl,
        session: {
          id: generated._id,
          qrUrl: generated.qrUrl,
          tokenPrefix: generated.tokenPrefix,
          generation: generated.generation,
          expiresAt: generated.expiresAt,
          status: 'ACTIVE',
          isActive: true,
          scanCount: 0,
        },
      }))
      onNotify?.({
        type: 'success',
        title: 'Demo QR Generated',
        message: `Temporary demo credential generation #${generated.generation} is now live and ready to scan.`,
      })
    } catch (err) {
      console.error('[DemoLoginSection] QR Generation error:', err)
      setError(err.message || 'Failed to generate demo QR credential.')
    } finally {
      setIsActionLoading(false)
    }
  }

  // Confirm and execute global reset
  const handleExecuteReset = async () => {
    setIsActionLoading(true)
    setShowConfirmResetModal(false)
    setError(null)
    try {
      const resetResult = await resetDemoSessions(token)
      setDemoState({
        generation: resetResult.generation,
        hasActiveQr: true,
        qrUrl: resetResult.qrUrl,
        session: {
          qrUrl: resetResult.qrUrl,
          tokenPrefix: resetResult.tokenPrefix,
          generation: resetResult.generation,
          expiresAt: resetResult.expiresAt,
          status: 'ACTIVE',
          isActive: true,
          scanCount: 0,
        },
      })
      onNotify?.({
        type: 'success',
        title: 'Global Demo Reset Executed',
        message: `All previous student sessions have been invalidated. Brand-new demo version #${resetResult.generation} is now live!`,
      })
    } catch (err) {
      console.error('[DemoLoginSection] Demo reset error:', err)
      setError(err.message || 'Failed to reset demo presentation sessions.')
    } finally {
      setIsActionLoading(false)
    }
  }

  // Copy current QR URL to clipboard
  const handleCopyLink = () => {
    if (!activeQrUrl) return
    navigator.clipboard.writeText(activeQrUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    onNotify?.({
      type: 'info',
      title: 'Link Copied',
      message: 'Demo login URL copied to clipboard.',
    })
  }

  // Compute countdown remaining
  const { isExpired, remainingTimeFormatted, expiryDateFormatted } = useMemo(() => {
    const expiresAtStr = demoState?.session?.expiresAt
    if (!expiresAtStr) {
      return { isExpired: false, remainingTimeFormatted: '--', expiryDateFormatted: '--' }
    }

    const expiryTime = new Date(expiresAtStr).getTime()
    const diffMs = expiryTime - now

    if (diffMs <= 0) {
      return {
        isExpired: true,
        remainingTimeFormatted: '00:00:00 (Expired)',
        expiryDateFormatted: new Date(expiryTime).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        }),
      }
    }

    const hours = Math.floor(diffMs / (1000 * 60 * 60))
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))
    const seconds = Math.floor((diffMs % (1000 * 60)) / 1000)

    const pad = (n) => String(n).padStart(2, '0')
    const formatted = `${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`

    const formattedTime = new Date(expiryTime).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })

    return {
      isExpired: false,
      remainingTimeFormatted: formatted,
      expiryDateFormatted: formattedTime,
    }
  }, [demoState?.session?.expiresAt, now])

  // Dynamically resolve active QR URL: ensures that when browsing on a live hosted site (like Vercel),
  // the QR code URL and links dynamically use the live domain so mobile phone camera scans never hit localhost!
  const activeQrUrl = useMemo(() => {
    const raw = demoState?.qrUrl || demoState?.session?.qrUrl
    if (!raw) return ''
    if (typeof window === 'undefined') return raw
    try {
      const currentOrigin = window.location.origin
      const parsed = new URL(raw)
      // If we are browsing on a hosted domain (e.g. vercel.app or any domain other than localhost)
      // but the backend returned a localhost URL, replace origin with current window.location.origin:
      if (!window.location.hostname.includes('localhost') && !window.location.hostname.includes('127.0.0.1')) {
        if (parsed.hostname.includes('localhost') || parsed.hostname.includes('127.0.0.1')) {
          return `${currentOrigin}${parsed.pathname}${parsed.search}`
        }
      }
      return raw
    } catch {
      return raw
    }
  }, [demoState?.qrUrl, demoState?.session?.qrUrl])

  const hasValidActiveQr = !!activeQrUrl && !isExpired && demoState?.session?.isActive !== false
  const currentGen = demoState?.generation || demoState?.session?.generation || 1

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Top Overview Banner / Information Card */}
      <Card className="border-indigo-100/70 shadow-sm overflow-hidden">
        <CardHeader className="border-b border-slate-100 bg-gradient-to-r from-blue-50/50 via-indigo-50/30 to-purple-50/20 p-4 sm:p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start sm:items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20 shrink-0">
                <QrCode className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base sm:text-lg text-slate-900 font-bold tracking-tight">
                    Temporary QR Demo Login
                  </CardTitle>
                  <Badge variant="purple" size="sm" className="hidden sm:inline-flex">
                    College Presentation
                  </Badge>
                </div>
                <CardDescription className="text-xs text-slate-500 mt-0.5">
                  Allows visiting students and evaluators to scan and instantly join as demo students without passwords.
                </CardDescription>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start md:self-auto">
              <Badge
                variant={hasValidActiveQr ? 'success' : isExpired ? 'danger' : 'neutral'}
                dot={hasValidActiveQr}
                pulse={hasValidActiveQr}
                size="md"
              >
                {hasValidActiveQr ? 'ACTIVE' : isExpired ? 'EXPIRED' : 'NO ACTIVE QR'}
              </Badge>
              <Badge variant="info" size="md">
                Generation #{currentGen}
              </Badge>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-4 sm:p-6 space-y-6">
          {error && (
            <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center justify-between gap-2.5">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{error}</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadStatus(true)}
                disabled={isLoading}
                className="text-xs h-7 px-2.5 shrink-0 border-rose-300 text-rose-700 hover:bg-rose-100"
              >
                <RefreshCw className={`w-3 h-3 mr-1 ${isLoading ? 'animate-spin' : ''}`} />
                Retry
              </Button>
            </div>
          )}

          {isLoading ? (
            <div className="py-16 flex flex-col items-center justify-center space-y-3">
              <div className="w-10 h-10 rounded-full border-2 border-indigo-500/20 border-t-indigo-600 animate-spin" />
              <p className="text-xs text-slate-500 font-medium">Checking live demo credential state...</p>
            </div>
          ) : hasValidActiveQr ? (
            /* ACTIVE QR PRESENTATION LAYOUT */
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
              {/* Left / Center: Projector-Ready Large QR Container */}
              <div className="lg:col-span-6 flex flex-col items-center justify-center p-6 sm:p-8 bg-slate-50/80 rounded-3xl border border-slate-200/80 shadow-xs relative overflow-hidden">
                <div className="absolute top-3 right-3 flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200/60">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                  <span>LIVE DEMO QR</span>
                </div>

                {/* High Contrast Scalable QR Canvas / SVG */}
                <div className="p-4 sm:p-5 bg-white rounded-2xl border border-slate-200/90 shadow-md shadow-slate-200/60 mt-4 transition-transform hover:scale-[1.01]">
                  <QRCodeSVG
                    value={activeQrUrl}
                    size={280}
                    level="H"
                    includeMargin={true}
                    className="w-56 h-56 sm:w-72 sm:h-72 md:w-80 md:h-80 mx-auto"
                  />
                </div>

                <div className="mt-4 text-center space-y-1">
                  <h3 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight">
                    Scan this QR to join the Smart Classroom demo
                  </h3>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    Open your smartphone camera to authenticate instantly. No username or password required.
                  </p>
                </div>
              </div>

              {/* Right: Telemetry, Expiry Clock, and Global Reset Control */}
              <div className="lg:col-span-6 space-y-5">
                {/* Telemetry Bento Grid */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3.5 sm:p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs space-y-1">
                    <div className="flex items-center gap-1.5 text-slate-400 text-xs">
                      <ShieldCheck className="w-3.5 h-3.5 text-indigo-500" />
                      <span className="font-medium">Version / Gen</span>
                    </div>
                    <div className="text-lg sm:text-xl font-bold text-slate-900 font-mono">
                      #{currentGen}
                    </div>
                    <p className="text-[11px] text-slate-400">All student tokens tied to this version</p>
                  </div>

                  <div className="p-3.5 sm:p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs space-y-1">
                    <div className="flex items-center gap-1.5 text-slate-400 text-xs">
                      <Clock className="w-3.5 h-3.5 text-amber-500" />
                      <span className="font-medium">Time Remaining</span>
                    </div>
                    <div className="text-sm sm:text-base font-bold text-amber-600 font-mono truncate">
                      {remainingTimeFormatted}
                    </div>
                    <p className="text-[11px] text-slate-400 truncate">Expires at {expiryDateFormatted}</p>
                  </div>

                  <div className="p-3.5 sm:p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs space-y-1">
                    <div className="flex items-center gap-1.5 text-slate-400 text-xs">
                      <Users className="w-3.5 h-3.5 text-emerald-500" />
                      <span className="font-medium">Demo Scans</span>
                    </div>
                    <div className="text-lg sm:text-xl font-bold text-slate-900 font-mono">
                      {demoState?.session?.scanCount || 0}
                    </div>
                    <p className="text-[11px] text-slate-400">Total QR scan redemptions</p>
                  </div>

                  <div className="p-3.5 sm:p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs space-y-1">
                    <div className="flex items-center gap-1.5 text-slate-400 text-xs">
                      <Radio className="w-3.5 h-3.5 text-blue-500" />
                      <span className="font-medium">Gateway State</span>
                    </div>
                    <div className="text-sm sm:text-base font-semibold text-slate-800">
                      {isSocketConnected ? 'Live Broadcast' : 'HTTP Polling'}
                    </div>
                    <p className="text-[11px] text-slate-400">Auto-invalidates on reset</p>
                  </div>
                </div>

                {/* Direct Demo URL Action Strip */}
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
                    <span>Generated Temporary URL:</span>
                    <button
                      type="button"
                      onClick={handleCopyLink}
                      className="text-indigo-600 hover:text-indigo-700 flex items-center gap-1 text-[11px] cursor-pointer"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copied ? 'Copied!' : 'Copy Link'}</span>
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={activeQrUrl}
                      className="flex-1 px-3 py-1.5 text-xs font-mono bg-white border border-slate-200 rounded-xl text-slate-700 select-all focus:outline-none"
                    />
                    <a
                      href={activeQrUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 transition-colors"
                      title="Open Demo Login in New Tab"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                </div>

                {/* Danger / Action Zone */}
                <div className="pt-2 border-t border-slate-200/70 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h4 className="text-xs sm:text-sm font-bold text-slate-900">
                        Session & Presentation Controls
                      </h4>
                      <p className="text-xs text-slate-500">
                        Instantly disconnect all mobile students and generate a new code.
                      </p>
                    </div>

                    <Button
                      variant="danger"
                      size="md"
                      isLoading={isActionLoading}
                      leftIcon={<LogOut className="w-4 h-4" />}
                      onClick={() => setShowConfirmResetModal(true)}
                      className="w-full sm:w-auto shadow-rose-500/20"
                    >
                      Logout All Demo Users
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* EMPTY / EXPIRED STATE: ALLOW SUPER ADMIN TO GENERATE QR */
            <div className="py-12 px-4 flex flex-col items-center justify-center text-center max-w-md mx-auto space-y-4">
              <div className="w-16 h-16 rounded-3xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-sm">
                <QrCode className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base sm:text-lg font-bold text-slate-900">
                  {isExpired ? 'Demo QR Credential Has Expired' : 'No Active Demo QR Published'}
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Generate a cryptographically secure temporary login credential for your presentation.
                  Students can scan from the projector to gain instant, sandboxed student access.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-2.5 w-full pt-2">
                <Button
                  variant="primary"
                  size="lg"
                  isLoading={isActionLoading}
                  leftIcon={<Sparkles className="w-4 h-4" />}
                  onClick={handleGenerate}
                  className="w-full justify-center shadow-blue-500/25"
                >
                  Generate Demo QR Code
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Confirmation Modal for Resetting All Demo Users */}
      <Modal
        isOpen={showConfirmResetModal}
        onClose={() => setShowConfirmResetModal(false)}
        title="Logout All Demo Students & Reset QR?"
        description="This action immediately revokes authentication for all currently connected demo mobile sessions."
        footer={
          <div className="flex items-center justify-end gap-2.5 w-full">
            <Button
              variant="outline"
              size="sm"
              disabled={isActionLoading}
              onClick={() => setShowConfirmResetModal(false)}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              isLoading={isActionLoading}
              leftIcon={<LogOut className="w-4 h-4" />}
              onClick={handleExecuteReset}
            >
              Confirm Reset & Invalidate
            </Button>
          </div>
        }
      >
        <div className="space-y-3.5 text-xs text-slate-600">
          <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200/80 text-amber-800 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              <strong>Are you sure?</strong> This will immediately log out all students currently using the demo and invalidate the current QR code.
            </p>
          </div>

          <ul className="space-y-1.5 list-disc list-inside text-slate-500">
            <li>Current session generation #{currentGen} will be marked invalid.</li>
            <li>All connected mobile phones will be immediately logged out.</li>
            <li>A brand-new QR code and token will be generated on screen.</li>
            <li>Normal teacher and administrator accounts will remain unaffected.</li>
          </ul>
        </div>
      </Modal>
    </div>
  )
}
