import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useSocket, useSocketEvent } from '../context/SocketContext'
import { API_BASE_URL } from '../config/api'
import {
  Mic,
  Lightbulb,
  Fan,
  Projector,
  Power,
  Sparkles,
  LogOut,
  Radio,
  CheckCircle2,
  Lock,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  Zap,
} from 'lucide-react'
import { useHaptics } from '../hooks'

// Curated Projector Ambient Colors
const PRESET_COLORS = [
  { name: 'Mint Green', hex: '#10b981', r: 16, g: 185, b: 129 },
  { name: 'Pure White', hex: '#ffffff', r: 255, g: 255, b: 255 },
  { name: 'Ocean Blue', hex: '#3b82f6', r: 59, g: 130, b: 246 },
  { name: 'Neon Purple', hex: '#a855f7', r: 168, g: 85, b: 247 },
  { name: 'Warm Gold', hex: '#f59e0b', r: 245, g: 158, b: 11 },
]

export function StudentPage() {
  const navigate = useNavigate()
  const { user, token, logout, demoRevoked } = useAuth()
  const { isConnected: isSocketConnected, joinClassroom, leaveClassroom } = useSocket()
  const { triggerHaptic } = useHaptics()

  const [selectedRoom] = useState('Room 302')
  const [devices, setDevices] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [pendingToggles, setPendingToggles] = useState({})
  const [projectorColor, setProjectorColor] = useState({ r: 16, g: 185, b: 129 })

  // Admin Logout Soft Exit Animation State
  const [isLoggedOutByAdmin, setIsLoggedOutByAdmin] = useState(false)
  const [countdown, setCountdown] = useState(5)
  const countdownTimerRef = useRef(null)

  // Listen for real-time demo session revocation from Super Admin
  const handleDemoRevoked = useCallback(() => {
    console.warn('[StudentPage] 🛑 Demo session revoked by instructor. Displaying soft exit animation...')
    triggerHaptic?.('heavy')
    setIsLoggedOutByAdmin(true)
  }, [triggerHaptic])

  useSocketEvent('auth:demo_revoked', handleDemoRevoked)
  useSocketEvent('demo:revoked', handleDemoRevoked)
  useSocketEvent('demo:reset', handleDemoRevoked)

  // Trigger from AuthContext if flagged
  useEffect(() => {
    if (demoRevoked && !isLoggedOutByAdmin) {
      handleDemoRevoked()
    }
  }, [demoRevoked, isLoggedOutByAdmin, handleDemoRevoked])

  // Soft Countdown and smooth redirection on admin logout
  useEffect(() => {
    if (!isLoggedOutByAdmin) return

    countdownTimerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(countdownTimerRef.current)
          logout()
          navigate('/login', { replace: true })
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => {
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current)
    }
  }, [isLoggedOutByAdmin, logout, navigate])

  const handleManualExit = () => {
    triggerHaptic?.('light')
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current)
    logout()
    navigate('/login', { replace: true })
  }

  // Join Socket.IO classroom room for real-time state synchronization
  useEffect(() => {
    if (selectedRoom) {
      joinClassroom(selectedRoom)
      return () => leaveClassroom(selectedRoom)
    }
  }, [selectedRoom, joinClassroom, leaveClassroom])

  // Fetch Classroom Devices from Backend
  const fetchDevices = useCallback(
    async (silent = false) => {
      if (!token) return
      if (!silent) setIsLoading(true)
      else setIsRefreshing(true)

      try {
        const res = await fetch(`${API_BASE_URL}/api/devices?classroom=${encodeURIComponent(selectedRoom)}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        })

        if (!res.ok) {
          throw new Error(`Failed to load devices (HTTP ${res.status})`)
        }

        const data = await res.json()
        const channelDevices = (data.devices || []).filter(
          (d) =>
            d.entityType === 'CHANNEL' ||
            d.deviceCategory === 'CHANNEL' ||
            ['LIGHT', 'FAN', 'PROJECTOR'].includes(d.type)
        )

        // Ensure order: LIGHT, FAN, PROJECTOR
        const typeOrder = { LIGHT: 1, FAN: 2, PROJECTOR: 3 }
        channelDevices.sort((a, b) => (typeOrder[a.type] || 99) - (typeOrder[b.type] || 99))

        setDevices(channelDevices)

        // Sync projector color if loaded
        const proj = channelDevices.find((d) => d.type === 'PROJECTOR')
        if (proj?.color && (proj.color.r || proj.color.g || proj.color.b)) {
          setProjectorColor(proj.color)
        }
      } catch (err) {
        console.error('[StudentPage] Failed to fetch devices:', err)
      } finally {
        setIsLoading(false)
        setIsRefreshing(false)
      }
    },
    [token, selectedRoom]
  )

  useEffect(() => {
    fetchDevices(false)
  }, [fetchDevices])

  // Listen to incoming real-time Socket.IO device updates
  const handleDeviceUpdate = useCallback((incoming) => {
    if (!incoming || (!incoming.deviceId && !incoming.id)) return

    setDevices((prev) =>
      prev.map((dev) => {
        const isMatch =
          dev.deviceId === incoming.deviceId ||
          dev._id === incoming.id ||
          dev._id === incoming.deviceId ||
          (dev.type && incoming.type && dev.type.toUpperCase() === incoming.type.toUpperCase())

        if (isMatch) {
          // Clear pending lock
          setPendingToggles((p) => {
            const next = { ...p }
            delete next[dev.deviceId || dev._id]
            return next
          })

          if (incoming.color) {
            setProjectorColor(incoming.color)
          }

          return {
            ...dev,
            state: incoming.state || dev.state,
            isOnline: typeof incoming.isOnline === 'boolean' ? incoming.isOnline : dev.isOnline,
            color: incoming.color || dev.color,
          }
        }
        return dev
      })
    )
  }, [])

  useSocketEvent('device:status', handleDeviceUpdate)
  useSocketEvent('device:state', handleDeviceUpdate)
  useSocketEvent('device:color', handleDeviceUpdate)
  useSocketEvent('projector:color', handleDeviceUpdate)

  // Web Button Toggle Handler (Light, Fan, Projector)
  const handleToggleDevice = async (device) => {
    const devId = device.deviceId || device._id
    if (!devId || pendingToggles[devId]) return

    triggerHaptic?.('medium')
    const currentState = device.state === 'ON' ? 'ON' : 'OFF'
    const nextAction = currentState === 'ON' ? 'OFF' : 'ON'

    // Optimistic UI Update
    setPendingToggles((p) => ({ ...p, [devId]: true }))
    setDevices((prev) =>
      prev.map((d) => (d.deviceId === devId || d._id === devId ? { ...d, state: nextAction } : d))
    )

    try {
      const res = await fetch(`${API_BASE_URL}/api/devices/${encodeURIComponent(devId)}/command`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ action: nextAction }),
      })

      if (!res.ok) {
        throw new Error('Failed to dispatch device command.')
      }
    } catch (err) {
      console.error('[StudentPage] Device command failed:', err)
      // Rollback on failure
      setDevices((prev) =>
        prev.map((d) => (d.deviceId === devId || d._id === devId ? { ...d, state: currentState } : d))
      )
    } finally {
      setPendingToggles((p) => {
        const next = { ...p }
        delete next[devId]
        return next
      })
    }
  }

  // Projector RGB Color Changer
  const handleSetColor = async (colorObj) => {
    const proj = devices.find((d) => d.type === 'PROJECTOR')
    if (!proj) return
    const devId = proj.deviceId || proj._id
    if (!devId) return

    triggerHaptic?.('light')
    setProjectorColor(colorObj)

    // Turn ON projector optimistically if OFF
    if (proj.state !== 'ON') {
      setDevices((prev) =>
        prev.map((d) => (d.type === 'PROJECTOR' ? { ...d, state: 'ON' } : d))
      )
    }

    try {
      await fetch(`${API_BASE_URL}/api/devices/${encodeURIComponent(devId)}/color`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          color: { r: colorObj.r, g: colorObj.g, b: colorObj.b },
          power: 'ON',
        }),
      })
    } catch (err) {
      console.warn('[StudentPage] Color change failed:', err.message)
    }
  }

  return (
    <div className="min-h-screen bg-[#fcfdfd] text-slate-800 selection:bg-emerald-500/20 selection:text-emerald-900 relative pb-20 font-sans">
      {/* Apple Vision Style Clean Ambient Glow (Crisp White & Emerald Green) */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10 select-none">
        <div className="absolute -top-32 -left-32 w-[520px] h-[520px] bg-gradient-to-br from-emerald-200/35 via-green-100/25 to-transparent rounded-full blur-3xl opacity-80" />
        <div className="absolute top-1/3 -right-32 w-[480px] h-[480px] bg-gradient-to-tr from-teal-200/25 via-emerald-100/20 to-transparent rounded-full blur-3xl opacity-70" />
        <div className="absolute -bottom-32 left-1/4 w-[500px] h-[500px] bg-gradient-to-tr from-green-100/30 to-emerald-200/20 rounded-full blur-3xl opacity-60" />
      </div>

      {/* Top Header Bar */}
      <header className="sticky top-0 z-30 border-b border-emerald-100/70 bg-white/80 backdrop-blur-2xl px-4 sm:px-6 py-3.5 shadow-[0_2px_15px_rgba(16,185,129,0.03)]">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-md shadow-emerald-500/25 shrink-0">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                  Smart Classroom
                </h1>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200/80">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live Demo
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                {user?.name || 'Demo Student'} &bull; {selectedRoom}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fetchDevices(true)}
              disabled={isRefreshing}
              className="p-2 rounded-xl bg-slate-50 hover:bg-emerald-50 text-slate-500 hover:text-emerald-700 border border-slate-200/80 transition-all cursor-pointer active:scale-95"
              title="Refresh Devices"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={handleManualExit}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-rose-50 hover:text-rose-600 border border-slate-200/80 text-xs font-semibold text-slate-600 transition-all cursor-pointer active:scale-95"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Exit</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Mobile-Responsive Viewport */}
      <main className="max-w-3xl mx-auto px-4 sm:px-6 pt-5 space-y-5">
        {/* =========================================================================
            FEATURE 1: AI VOICE CONTROL (HERO QUICK LAUNCHER)
            ========================================================================= */}
        <div className="bg-gradient-to-br from-white via-emerald-50/30 to-green-50/40 border border-emerald-200/80 rounded-[28px] p-5 sm:p-7 shadow-[0_10px_35px_rgba(16,185,129,0.06)] relative overflow-hidden backdrop-blur-xl">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-5 text-center sm:text-left">
            <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-4.5">
              {/* Soft Pulsing Siri / Voice Orb */}
              <div className="w-16 h-16 sm:w-18 sm:h-18 rounded-3xl bg-gradient-to-tr from-emerald-500 via-green-500 to-teal-400 flex items-center justify-center text-white shadow-xl shadow-emerald-500/30 shrink-0 animate-pulseGreen transition-transform hover:scale-105">
                <Mic className="w-8 h-8 animate-pulse" />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-center sm:justify-start gap-2">
                  <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight">
                    AI Voice Control
                  </h2>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200/60">
                    Real-Time
                  </span>
                </div>
                <p className="text-xs text-slate-600 max-w-md leading-relaxed">
                  Control classroom lights, fan, and projector hands-free using natural voice in English or Tamil.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                triggerHaptic?.('medium')
                navigate('/voice')
              }}
              className="w-full sm:w-auto px-5 py-3 rounded-2xl bg-gradient-to-r from-emerald-600 via-green-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-95 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/25 transition-all cursor-pointer shrink-0"
            >
              <span>Launch Voice Assistant</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* =========================================================================
            FEATURE 2: CLASSROOM DEVICE WEB BUTTONS (JUST THIS TWO)
            ========================================================================= */}
        <div className="space-y-3.5">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                Classroom Web Controls
              </h3>
              <span className="text-xs text-slate-500 font-medium">({selectedRoom})</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200/70">
              <Radio className="w-3.5 h-3.5" />
              <span>{isSocketConnected ? 'Live Gateway' : 'Connecting...'}</span>
            </div>
          </div>

          {isLoading ? (
            <div className="py-16 flex flex-col items-center justify-center space-y-3 bg-white/70 rounded-3xl border border-emerald-100">
              <div className="w-9 h-9 rounded-full border-2 border-emerald-500/20 border-t-emerald-600 animate-spin" />
              <p className="text-xs text-slate-500 font-medium">Synchronizing classroom devices...</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 sm:gap-4">
              {devices.map((device) => {
                const devId = device.deviceId || device._id
                const isOn = device.state === 'ON'
                const isPending = !!pendingToggles[devId]

                let IconComponent = Lightbulb
                let deviceLabel = 'Classroom Light'
                if (device.type === 'FAN') {
                  IconComponent = Fan
                  deviceLabel = 'Ceiling Fan'
                } else if (device.type === 'PROJECTOR') {
                  IconComponent = Projector
                  deviceLabel = 'Smart Projector'
                }

                return (
                  <div
                    key={devId}
                    className={`bg-white/90 border rounded-[26px] p-5 backdrop-blur-xl shadow-[0_4px_24px_rgba(0,0,0,0.03)] transition-all duration-200 flex flex-col justify-between space-y-4 ${
                      isOn
                        ? 'border-emerald-300/80 shadow-md shadow-emerald-500/10 ring-1 ring-emerald-400/20'
                        : 'border-slate-200/80'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      {/* Device Icon Avatar */}
                      <div
                        className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${
                          isOn
                            ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/30'
                            : 'bg-slate-100 text-slate-400'
                        }`}
                      >
                        <IconComponent
                          className={`w-6 h-6 ${
                            isOn && device.type === 'FAN' ? 'animate-spin' : ''
                          }`}
                        />
                      </div>

                      {/* State Badge */}
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold tracking-wider ${
                          isOn
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/70'
                            : 'bg-slate-100 text-slate-500 border border-slate-200/60'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            isOn ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
                          }`}
                        />
                        <span>{isOn ? 'ACTIVE' : 'OFF'}</span>
                      </span>
                    </div>

                    <div>
                      <h4 className="text-sm font-bold text-slate-900 tracking-tight">
                        {deviceLabel}
                      </h4>
                      <p className="text-[11px] text-slate-400 font-mono mt-0.5 truncate">
                        ID: {device.deviceId || devId}
                      </p>
                    </div>

                    {/* Single Web Button Toggle */}
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => handleToggleDevice(device)}
                      className={`w-full py-3 rounded-2xl font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-95 disabled:opacity-60 ${
                        isOn
                          ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-md shadow-emerald-500/20'
                          : 'bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 text-slate-700 border border-slate-200/80'
                      }`}
                    >
                      <Power className={`w-3.5 h-3.5 ${isPending ? 'animate-spin' : ''}`} />
                      <span>{isOn ? 'Turn Off' : 'Turn On'}</span>
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* =========================================================================
            PROJECTOR ATMOSPHERE COLOR PICKER (WHITE & GREEN THEMED PRESETS)
            ========================================================================= */}
        <div className="bg-white/90 border border-emerald-100/80 rounded-[28px] p-5 sm:p-6 backdrop-blur-xl shadow-[0_4px_24px_rgba(0,0,0,0.03)] space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-200/80 flex items-center justify-center text-emerald-600">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs sm:text-sm font-bold text-slate-900">
                  Projector Mood Lighting
                </h4>
                <p className="text-[11px] text-slate-500">
                  Select color preset for classroom presentation atmosphere.
                </p>
              </div>
            </div>

            <div
              className="w-5 h-5 rounded-full border border-slate-300 shadow-inner"
              style={{
                backgroundColor: `rgb(${projectorColor.r}, ${projectorColor.g}, ${projectorColor.b})`,
              }}
              title="Active Color"
            />
          </div>

          <div className="grid grid-cols-5 gap-2 sm:gap-3">
            {PRESET_COLORS.map((col) => {
              const isSelected =
                projectorColor.r === col.r &&
                projectorColor.g === col.g &&
                projectorColor.b === col.b

              return (
                <button
                  key={col.name}
                  type="button"
                  onClick={() => handleSetColor(col)}
                  className={`flex flex-col items-center justify-center p-2.5 rounded-2xl border transition-all cursor-pointer active:scale-95 ${
                    isSelected
                      ? 'border-emerald-500 bg-emerald-50/60 shadow-xs ring-2 ring-emerald-500/20'
                      : 'border-slate-200/80 bg-slate-50/70 hover:bg-white'
                  }`}
                >
                  <span
                    className="w-5 h-5 sm:w-6 sm:h-6 rounded-full border border-black/10 shadow-sm mb-1.5"
                    style={{ backgroundColor: col.hex }}
                  />
                  <span className="text-[10px] font-bold text-slate-700 truncate w-full text-center">
                    {col.name}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Minimal Footer Note */}
        <p className="text-center text-[11px] text-slate-400 pt-2">
          AI Voice-Controlled Smart Classroom &bull; Autonomous Generative IoT Platform
        </p>
      </main>

      {/* =========================================================================
          COOL & SOFT APPLE-STYLE LOGOUT ANIMATION OVERLAY
          Triggers smoothly when Super Admin resets or logs out the demo session.
          ========================================================================= */}
      {isLoggedOutByAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-2xl bg-slate-900/35 transition-all duration-500">
          <div className="w-full max-w-sm bg-white/95 border border-emerald-200/90 rounded-[32px] p-6 sm:p-8 text-center shadow-2xl shadow-slate-900/20 backdrop-blur-3xl animate-softModal space-y-5">
            {/* Soft Glowing Green Badge Icon */}
            <div className="w-18 h-18 rounded-full bg-emerald-50 border-2 border-emerald-200 flex items-center justify-center text-emerald-600 mx-auto shadow-lg shadow-emerald-500/20 animate-pulseGreen">
              <CheckCircle2 className="w-9 h-9" />
            </div>

            <div className="space-y-1.5">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold text-emerald-800 bg-emerald-100/80 border border-emerald-200/80 mb-1">
                <span>Smart Classroom</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                Demo Session Concluded
              </h2>
              <p className="text-xs text-slate-500 leading-relaxed max-w-xs mx-auto">
                The instructor has concluded or reset the live demonstration. Thank you for testing the Smart Classroom!
              </p>
            </div>

            {/* Countdown Badge */}
            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/80 text-xs font-medium text-slate-600 flex items-center justify-center gap-2">
              <Lock className="w-3.5 h-3.5 text-emerald-600" />
              <span>Returning to welcome screen in <strong>{countdown}s</strong>...</span>
            </div>

            <button
              type="button"
              onClick={handleManualExit}
              className="w-full py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold text-xs shadow-md shadow-emerald-600/25 transition-all cursor-pointer"
            >
              Done &bull; Return to Login
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
