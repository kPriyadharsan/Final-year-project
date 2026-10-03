import { useState, useEffect } from 'react'
import {
  Bell,
  Search,
  CheckCircle2,
  AlertCircle,
  LogOut,
  ChevronDown,
  Sparkles,
  Clock,
  Wifi,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { Badge } from '../ui/Badge'
import { API_BASE_URL } from '../../config/api'

export function TopNav({ pageTitle = 'Dashboard' }) {
  const { user, logout } = useAuth()
  const [healthStatus, setHealthStatus] = useState('checking')
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false)
  const [currentTime, setCurrentTime] = useState('')

  const apiBaseUrl = API_BASE_URL

  // Live Apple macOS style status clock
  useEffect(() => {
    const updateTime = () => {
      const now = new Date()
      setCurrentTime(
        now.toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        })
      )
    }
    updateTime()
    const timer = setInterval(updateTime, 30000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    async function checkHealth() {
      try {
        const res = await fetch(`${apiBaseUrl}/api/health`)
        if (res.ok) {
          setHealthStatus('online')
        } else {
          setHealthStatus('offline')
        }
      } catch {
        setHealthStatus('offline')
      }
    }
    checkHealth()
  }, [apiBaseUrl])

  return (
    <header className="h-16 sticky top-0 z-30 bg-white/75 border-b border-slate-200/60 backdrop-blur-2xl px-4 sm:px-8 flex items-center justify-between gap-4 transition-all shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
      {/* Left: Brand Identity & Current Workspace Title */}
      <div className="flex items-center gap-3.5">
        <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-violet-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20 shrink-0">
          <Sparkles className="w-5 h-5 text-white" />
        </div>

        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight leading-none">
              {pageTitle}
            </h1>
            <span className="hidden sm:inline-flex text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200/60">
              {user?.role === 'SUPER_ADMIN' ? 'Admin' : 'Faculty'}
            </span>
          </div>
          <p className="text-[11px] text-slate-400 hidden md:block mt-0.5">
            Smart Classroom OS &bull; Automated Facility Control
          </p>
        </div>
      </div>

      {/* Center: macOS Style Live Date & Time */}
      {currentTime && (
        <div className="hidden lg:flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100/70 border border-slate-200/50 text-[11px] font-medium text-slate-600">
          <Clock className="w-3.5 h-3.5 text-slate-400" />
          <span>{currentTime}</span>
        </div>
      )}

      {/* Right: Search, IoT Health Badge, Notifications & Profile */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Quick Classroom / Device Search Bar */}
        <div className="relative hidden md:block w-48 lg:w-60">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search rooms, relays..."
            className="w-full pl-9 pr-3 py-1.5 rounded-full bg-slate-100/80 hover:bg-slate-100 focus:bg-white border border-slate-200/70 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-all font-sans"
          />
        </div>

        {/* Live Backend Connection Badge */}
        <div className="hidden sm:flex items-center">
          {healthStatus === 'online' ? (
            <Badge variant="success" dot pulse size="sm">
              IoT Online
            </Badge>
          ) : (
            <Badge variant="danger" dot size="sm">
              Offline
            </Badge>
          )}
        </div>

        {/* Notification Bell */}
        <button
          type="button"
          className="relative p-2 rounded-full text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
          title="Classroom alerts"
        >
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-blue-600 ring-2 ring-white"></span>
        </button>

        {/* User Profile Menu */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
            className="flex items-center gap-2 p-1 sm:p-1.5 rounded-full hover:bg-slate-100 border border-transparent hover:border-slate-200/70 transition-all cursor-pointer"
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-500 to-indigo-600 text-white flex items-center justify-center text-xs font-bold shadow-sm">
              {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
            </div>
            <div className="hidden md:flex flex-col text-left leading-none">
              <span className="text-xs font-semibold text-slate-800">{user?.name}</span>
              <span className="text-[10px] text-slate-400 mt-0.5">{user?.role}</span>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden sm:block" />
          </button>

          {/* Profile Dropdown */}
          {isProfileMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-20"
                onClick={() => setIsProfileMenuOpen(false)}
              />
              <div className="absolute right-0 mt-2 w-56 rounded-2xl bg-white/95 backdrop-blur-2xl border border-slate-200/80 shadow-xl py-2 z-30 transition-all">
                <div className="px-4 py-2.5 border-b border-slate-100">
                  <div className="text-xs font-bold text-slate-900">{user?.name}</div>
                  <div className="text-[11px] text-slate-500 truncate">{user?.email}</div>
                  <div className="mt-1.5">
                    <Badge variant="purple" size="sm">
                      {user?.role}
                    </Badge>
                  </div>
                </div>

                <div className="p-1">
                  <button
                    type="button"
                    onClick={() => {
                      setIsProfileMenuOpen(false)
                      logout()
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer text-left font-medium"
                  >
                    <LogOut className="w-4 h-4 text-rose-500" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
