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
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { Badge } from '../ui/Badge'

export function Sidebar({ isOpen, setIsOpen, isMobileOpen, setIsMobileOpen }) {
  const { user, logout } = useAuth()
  const location = useLocation()

  // Dynamic navigation items based on authenticated role
  const isSuperAdmin = user?.role === 'SUPER_ADMIN'

  const navItems = isSuperAdmin
    ? [
        {
          label: 'Admin Overview',
          href: '/admin',
          icon: <LayoutDashboard className="w-4 h-4" />,
        },
        {
          label: 'Classrooms',
          href: '/admin#classrooms',
          icon: <School className="w-4 h-4" />,
          tag: '14 Active',
        },
        {
          label: 'Smart Devices & IoT',
          href: '/admin#devices',
          icon: <Cpu className="w-4 h-4" />,
        },
        {
          label: 'Voice Engine',
          href: '/admin#voice',
          icon: <Mic className="w-4 h-4" />,
          tag: 'Gemini AI',
        },
        {
          label: 'User Directory',
          href: '/admin#users',
          icon: <Users className="w-4 h-4" />,
        },
        {
          label: 'System Config',
          href: '/admin#settings',
          icon: <Settings className="w-4 h-4" />,
        },
      ]
    : [
        {
          label: 'Teacher Portal',
          href: '/teacher',
          icon: <LayoutDashboard className="w-4 h-4" />,
        },
        {
          label: 'Assigned Classes',
          href: '/teacher#classes',
          icon: <School className="w-4 h-4" />,
        },
        {
          label: 'Classroom Relays',
          href: '/teacher#relays',
          icon: <Cpu className="w-4 h-4" />,
        },
        {
          label: 'Class Schedule',
          href: '/teacher#schedule',
          icon: <Calendar className="w-4 h-4" />,
        },
        {
          label: 'Voice Control',
          href: '/teacher#voice',
          icon: <Mic className="w-4 h-4" />,
        },
        {
          label: 'Preferences',
          href: '/teacher#settings',
          icon: <Settings className="w-4 h-4" />,
        },
      ]

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
        className={`fixed top-0 bottom-0 left-0 z-40 bg-slate-900/95 border-r border-slate-800/90 backdrop-blur-xl flex flex-col transition-all duration-300 ease-in-out
          ${isOpen ? 'w-64' : 'w-20'}
          ${isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        {/* Sidebar Header / Brand */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-slate-800/80">
          <Link to="/" className="flex items-center gap-3 overflow-hidden">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-500 to-violet-600 flex items-center justify-center text-white shrink-0 shadow-md shadow-indigo-500/20">
              <Sparkles className="w-5 h-5 text-white" />
            </div>

            {isOpen && (
              <div className="flex flex-col truncate">
                <span className="font-bold text-sm tracking-tight text-white leading-tight">
                  SmartClassroom
                </span>
                <span className="text-[10px] text-indigo-400 font-mono">
                  {isSuperAdmin ? 'ADMIN CONSOLE' : 'FACULTY OS'}
                </span>
              </div>
            )}
          </Link>

          {/* Desktop Collapse Toggle */}
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="hidden lg:flex p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            title={isOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            {isOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </div>

        {/* Navigation List */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.href || (location.pathname + location.hash) === item.href

            return (
              <Link
                key={item.label}
                to={item.href}
                onClick={() => setIsMobileOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all group ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/70'
                }`}
                title={!isOpen ? item.label : undefined}
              >
                <span className={`shrink-0 ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-indigo-400'}`}>
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
              {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
            </div>

            {isOpen && (
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-white truncate">{user?.name}</div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <Badge
                    variant={isSuperAdmin ? 'purple' : 'info'}
                    size="sm"
                    className="text-[10px] py-0 px-1.5"
                  >
                    {user?.role}
                  </Badge>
                </div>
              </div>
            )}

            {isOpen && (
              <button
                type="button"
                onClick={logout}
                className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer shrink-0"
                title="Log Out"
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
