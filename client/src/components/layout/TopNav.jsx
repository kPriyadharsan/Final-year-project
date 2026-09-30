import { useState, useEffect } from 'react'
import {
  Menu,
  Bell,
  Search,
  CheckCircle2,
  AlertCircle,
  LogOut,
  ChevronDown,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { Badge } from '../ui/Badge'

export function TopNav({ isSidebarOpen, onToggleMobileSidebar, pageTitle = 'Dashboard' }) {
  const { user, logout } = useAuth()
  const [healthStatus, setHealthStatus] = useState('checking')
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false)

  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'

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
    <header className="h-16 sticky top-0 z-30 bg-slate-900/80 border-b border-slate-800/80 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between gap-4">
      {/* Left: Mobile Toggle & Page Title */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onToggleMobileSidebar}
          className="lg:hidden p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          aria-label="Open navigation sidebar"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div>
          <h1 className="text-base sm:text-lg font-bold text-white tracking-tight leading-none">
            {pageTitle}
          </h1>
          <span className="text-[11px] text-slate-400 hidden sm:inline-block mt-0.5 font-mono">
            Smart Classroom OS &bull; Automated Facility Management
          </span>
        </div>
      </div>

      {/* Right: Search, System Status, Notifications & Profile */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Quick Classroom / Device Search Bar */}
        <div className="relative hidden md:block w-48 lg:w-64">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
          <input
            type="text"
            placeholder="Search classroom / device..."
            className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-slate-950/80 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500/80 focus:ring-1 focus:ring-indigo-500/20 transition-all font-mono"
          />
        </div>

        {/* Live Backend Connection Badge */}
        <div className="hidden sm:flex items-center">
          {healthStatus === 'online' ? (
            <Badge variant="success" dot pulse size="sm">
              IoT Gateway Online
            </Badge>
          ) : (
            <Badge variant="danger" dot size="sm">
              Gateway Offline
            </Badge>
          )}
        </div>

        {/* Notification Bell Placeholder */}
        <button
          type="button"
          className="relative p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          title="Classroom alerts & telemetries"
        >
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-indigo-500 ring-2 ring-slate-900"></span>
        </button>

        {/* User Profile Menu */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
            className="flex items-center gap-2 p-1.5 rounded-xl hover:bg-slate-800/80 border border-transparent hover:border-slate-700/60 transition-all cursor-pointer"
          >
            <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 flex items-center justify-center text-xs font-bold font-mono">
              {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
            </div>
            <div className="hidden md:flex flex-col text-left leading-none">
              <span className="text-xs font-semibold text-slate-200">{user?.name}</span>
              <span className="text-[10px] text-slate-400 font-mono mt-0.5">{user?.role}</span>
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
              <div className="absolute right-0 mt-2 w-56 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl py-2 z-30">
                <div className="px-4 py-2.5 border-b border-slate-800/80">
                  <div className="text-xs font-semibold text-white">{user?.name}</div>
                  <div className="text-[11px] text-slate-400 font-mono truncate">{user?.email}</div>
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
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-rose-300 hover:text-white hover:bg-rose-500/10 transition-colors cursor-pointer text-left font-medium"
                  >
                    <LogOut className="w-4 h-4 text-rose-400" />
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
