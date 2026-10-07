import { useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  School,
  Cpu,
  Users,
  Calendar,
  Mic,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  Sparkles,
  QrCode,
  Zap,
  GraduationCap,
  X,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { Badge } from '../ui/Badge'

export function Sidebar({
  isOpen,
  setIsOpen,
  isMobileOpen,
  setIsMobileOpen,
  activeTab,
  onTabChange,
}) {
  const { user, logout } = useAuth()
  const location = useLocation()

  // Close mobile drawer on Escape key press
  useEffect(() => {
    if (!isMobileOpen) return
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsMobileOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isMobileOpen, setIsMobileOpen])

  const isSuperAdmin = user?.role === 'SUPER_ADMIN'

  // Navigation items matching specification - Full Super Admin Access
  const navItems = isSuperAdmin
    ? [
        {
          id: 'overview',
          label: 'Overview',
          href: '/admin#overview',
          icon: <LayoutDashboard className="w-4 h-4" />,
        },
        {
          id: 'device-control',
          label: 'Hardware Control',
          href: '/admin/device-control',
          icon: <Zap className="w-4 h-4" />,
          tag: 'Live IoT',
        },
        {
          id: 'voice-control',
          label: 'AI Voice Assistant',
          href: '/voice',
          icon: <Mic className="w-4 h-4" />,
          tag: 'Real-Time',
        },
        {
          id: 'teachers',
          label: 'Teachers',
          href: '/admin#teachers',
          icon: <Users className="w-4 h-4" />,
          tag: 'Faculty',
        },
        {
          id: 'classes',
          label: 'Classes',
          href: '/admin#classes',
          icon: <School className="w-4 h-4" />,
          tag: '8 Rooms',
        },
        {
          id: 'devices',
          label: 'Devices',
          href: '/admin#devices',
          icon: <Cpu className="w-4 h-4" />,
          tag: '24 IoT',
        },
        {
          id: 'teacher-view',
          label: 'Teacher Portal',
          href: '/teacher',
          icon: <School className="w-4 h-4" />,
          tag: 'Full Access',
        },
        {
          id: 'student-view',
          label: 'Student Portal',
          href: '/student',
          icon: <GraduationCap className="w-4 h-4" />,
          tag: 'Full Access',
        },
        {
          id: 'demo-login',
          label: 'Demo QR Login',
          href: '/admin#demo-login',
          icon: <QrCode className="w-4 h-4" />,
          tag: 'QR Access',
        },
        {
          id: 'ai-system',
          label: 'AI / System',
          href: '/admin#ai-system',
          icon: <Sparkles className="w-4 h-4" />,
          tag: 'Gemini',
        },
        {
          id: 'settings',
          label: 'Settings',
          href: '/admin#settings',
          icon: <Settings className="w-4 h-4" />,
        },
      ]
    : [
        {
          id: 'overview',
          label: 'Teacher Portal',
          href: '/teacher',
          icon: <LayoutDashboard className="w-4 h-4" />,
        },
        {
          id: 'classes',
          label: 'Assigned Classes',
          href: '/teacher#classes',
          icon: <School className="w-4 h-4" />,
        },
        {
          id: 'devices',
          label: 'Classroom Relays',
          href: '/teacher#relays',
          icon: <Cpu className="w-4 h-4" />,
        },
        {
          id: 'schedule',
          label: 'Class Schedule',
          href: '/teacher#schedule',
          icon: <Calendar className="w-4 h-4" />,
        },
        {
          id: 'voice',
          label: 'Voice Control',
          href: '/teacher#voice',
          icon: <Mic className="w-4 h-4" />,
        },
        {
          id: 'settings',
          label: 'Preferences',
          href: '/teacher#settings',
          icon: <Settings className="w-4 h-4" />,
        },
      ]

  const handleNavClick = (item) => {
    if (onTabChange) {
      onTabChange(item.id)
    }
    setIsMobileOpen(false)
  }

  return (
    <>
      {/* Mobile/Tablet Backdrop Overlay */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/80 backdrop-blur-sm lg:hidden transition-opacity"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 bg-slate-900/95 border-r border-slate-800/90 backdrop-blur-2xl flex flex-col transition-transform duration-300 ease-in-out
          w-72 max-w-[85vw]
          ${isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:hidden'}
        `}
      >
        {/* Sidebar Header / Brand */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-slate-800/80">
          <Link to="/" onClick={() => setIsMobileOpen(false)} className="flex items-center gap-3 overflow-hidden">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-500 to-violet-600 flex items-center justify-center text-white shrink-0 shadow-md shadow-indigo-500/20">
              <Sparkles className="w-5 h-5 text-white" />
            </div>

            <div className="flex flex-col truncate">
              <span className="font-bold text-sm tracking-tight text-white leading-tight">
                SmartClassroom
              </span>
              <span className="text-[10px] text-indigo-400 font-mono">
                {isSuperAdmin ? 'ADMIN CONSOLE' : 'FACULTY OS'}
              </span>
            </div>
          </Link>

          {/* Mobile Close Button */}
          <button
            type="button"
            onClick={() => setIsMobileOpen(false)}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation List */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const isActive = activeTab
              ? activeTab === item.id
              : location.pathname === item.href ||
                location.pathname + location.hash === item.href ||
                (item.id === 'overview' && !location.hash)

            return (
              <Link
                key={item.label}
                to={item.href}
                onClick={() => handleNavClick(item)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all group ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/70'
                }`}
                title={!isOpen ? item.label : undefined}
              >
                <span
                  className={`shrink-0 ${
                    isActive ? 'text-white' : 'text-slate-400 group-hover:text-indigo-400'
                  }`}
                >
                  {item.icon}
                </span>

                {isOpen && (
                  <div className="flex-1 flex items-center justify-between truncate">
                    <span className="truncate">{item.label}</span>
                    {item.tag && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono border border-slate-700">
                        {item.tag}
                      </span>
                    )}
                  </div>
                )}
              </Link>
            )
          })}
        </div>

        {/* User Footer Panel */}
        <div className="p-3 border-t border-slate-800/80 bg-slate-950/40">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700/80 flex items-center justify-center text-xs font-bold text-slate-200 shrink-0">
              {user?.name ? user.name.slice(0, 2).toUpperCase() : 'AD'}
            </div>

            {isOpen && (
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-white truncate leading-tight">
                  {user?.name || 'Administrator'}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0"></span>
                  <p className="text-[10px] text-slate-400 font-mono truncate">{user?.role}</p>
                </div>
              </div>
            )}

            {isOpen && (
              <button
                type="button"
                onClick={logout}
                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800/80 transition-colors cursor-pointer"
                title="Sign out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </aside>
    </>
  )
}
