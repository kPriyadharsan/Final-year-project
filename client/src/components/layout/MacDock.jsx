import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  Users,
  School,
  Cpu,
  Sparkles,
  Settings,
  Calendar,
  Mic,
  LogOut,
  Sliders,
  Radio,
  BookOpen,
  Volume2,
  Zap,
  QrCode,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'

/**
 * macOS-Style Liquid Glass Dock Navigation
 * Floating at the bottom of the screen with fluid glassmorphism,
 * icon magnification, running app indicator dots, and sleek tooltips.
 */
export function MacDock({ activeTab, onTabChange, onTriggerVoice }) {
  const { user, logout } = useAuth()
  const location = useLocation()
  const isSuperAdmin = user?.role === 'SUPER_ADMIN'

  // Navigation items tailored to Super Admin vs Teacher
  const dockItems = isSuperAdmin
    ? [
        {
          id: 'overview',
          label: 'Overview',
          href: '/admin#overview',
          icon: LayoutDashboard,
          gradient: 'from-blue-500 to-indigo-600',
          shadow: 'shadow-blue-500/25',
        },
        {
          id: 'device-control',
          label: 'Device Control',
          href: '/admin/device-control',
          icon: Zap,
          gradient: 'from-amber-500 to-rose-600',
          shadow: 'shadow-amber-500/25',
        },
        {
          id: 'teachers',
          label: 'Faculty',
          href: '/admin#teachers',
          icon: Users,
          gradient: 'from-indigo-500 to-purple-600',
          shadow: 'shadow-indigo-500/25',
        },
        {
          id: 'classes',
          label: 'Classrooms',
          href: '/admin#classes',
          icon: School,
          gradient: 'from-amber-500 to-orange-600',
          shadow: 'shadow-amber-500/25',
        },
        {
          id: 'devices',
          label: 'IoT Devices',
          href: '/admin#devices',
          icon: Cpu,
          gradient: 'from-emerald-500 to-teal-600',
          shadow: 'shadow-emerald-500/25',
        },
        {
          id: 'ai-system',
          label: 'AI & Gemini',
          href: '/admin#ai-system',
          icon: Sparkles,
          gradient: 'from-violet-500 to-fuchsia-600',
          shadow: 'shadow-violet-500/25',
        },
        {
          id: 'ai-voice',
          label: 'AI Voice',
          href: '/voice',
          icon: Mic,
          gradient: 'from-emerald-500 to-teal-600',
          shadow: 'shadow-emerald-500/25',
        },
        {
          id: 'demo-login',
          label: 'Demo QR',
          href: '/admin#demo-login',
          icon: QrCode,
          gradient: 'from-blue-600 to-cyan-500',
          shadow: 'shadow-blue-500/25',
        },
        {
          id: 'settings',
          label: 'System Config',
          href: '/admin#settings',
          icon: Settings,
          gradient: 'from-slate-600 to-slate-800',
          shadow: 'shadow-slate-500/25',
        },
      ]
    : [
        {
          id: 'overview',
          label: 'Workspace',
          href: '/teacher',
          icon: LayoutDashboard,
          gradient: 'from-blue-500 to-indigo-600',
          shadow: 'shadow-blue-500/25',
        },
        {
          id: 'device-control',
          label: 'Device Control',
          href: '/admin/device-control',
          icon: Zap,
          gradient: 'from-amber-500 to-rose-600',
          shadow: 'shadow-amber-500/25',
        },
        {
          id: 'classes',
          label: 'Classes',
          href: '/teacher#classes',
          icon: School,
          gradient: 'from-amber-500 to-orange-600',
          shadow: 'shadow-amber-500/25',
        },
        {
          id: 'devices',
          label: 'Relays & Hardware',
          href: '/teacher#relays',
          icon: Cpu,
          gradient: 'from-emerald-500 to-teal-600',
          shadow: 'shadow-emerald-500/25',
        },
        {
          id: 'schedule',
          label: 'Class Timetable',
          href: '/teacher#schedule',
          icon: Calendar,
          gradient: 'from-rose-500 to-pink-600',
          shadow: 'shadow-rose-500/25',
        },
        {
          id: 'voice',
          label: 'Voice Control',
          href: '/teacher#voice',
          icon: Mic,
          gradient: 'from-purple-500 to-indigo-600',
          shadow: 'shadow-purple-500/25',
        },
        {
          id: 'settings',
          label: 'Preferences',
          href: '/teacher#settings',
          icon: Settings,
          gradient: 'from-slate-600 to-slate-800',
          shadow: 'shadow-slate-500/25',
        },
      ]

  const handleItemClick = (item, e) => {
    if (onTabChange) {
      onTabChange(item.id)
    }
  }

  return (
    <nav
      aria-label="Liquid Glass Dock"
      className="hidden md:block fixed bottom-3 sm:bottom-6 left-1/2 -translate-x-1/2 z-40 pointer-events-auto max-w-[calc(100vw-1rem)]"
    >
      {/* Liquid Glass Dock Outer Container */}
      <div className="relative px-2 py-1.5 sm:px-4 sm:py-2.5 rounded-[22px] sm:rounded-full bg-white/75 backdrop-blur-3xl border border-white/80 shadow-[0_20px_50px_rgba(0,0,0,0.12),0_1px_1px_rgba(255,255,255,0.9)_inset,0_0_0_1px_rgba(0,0,0,0.03)] flex items-center gap-1 sm:gap-2.5 transition-all duration-300 max-w-full overflow-x-auto scrollbar-none">
        {/* Specular Liquid Edge Highlight */}
        <div className="absolute inset-x-8 top-0 h-[1px] bg-gradient-to-r from-transparent via-white to-transparent pointer-events-none" />

        {/* Dock Items */}
        {dockItems.map((item) => {
          const Icon = item.icon
          const isActive = activeTab
            ? activeTab === item.id
            : location.pathname === item.href ||
              location.pathname + location.hash === item.href ||
              (item.id === 'overview' && !location.hash)

          return (
            <Link
              key={item.id}
              to={item.href}
              onClick={(e) => handleItemClick(item, e)}
              className="group relative flex flex-col items-center focus:outline-none shrink-0"
              aria-label={item.label}
            >
              {/* Floating Tooltip Pill (macOS style) */}
              <div className="hidden sm:block absolute -top-11 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-150 transform group-hover:-translate-y-1 z-30">
                <div className="px-2.5 py-1 rounded-xl bg-slate-900/85 text-white text-[11px] font-medium tracking-tight whitespace-nowrap shadow-lg backdrop-blur-md border border-white/10">
                  {item.label}
                </div>
                {/* Arrow */}
                <div className="w-1.5 h-1.5 bg-slate-900/85 rotate-45 mx-auto -mt-1" />
              </div>

              {/* Liquid App Icon Squircle */}
              <div
                className={`relative w-8 h-8 min-w-[32px] sm:w-11 sm:h-11 sm:min-w-[44px] rounded-xl sm:rounded-2xl flex items-center justify-center transition-all duration-200 ease-out sm:group-hover:scale-125 sm:group-hover:-translate-y-2 group-active:scale-95 ${
                  isActive
                    ? `bg-gradient-to-tr ${item.gradient} text-white shadow-md ${item.shadow} ring-1.5 sm:ring-2 ring-white/80`
                    : 'bg-white/80 hover:bg-white text-slate-700 hover:text-slate-900 shadow-sm border border-slate-200/60'
                }`}
              >
                {/* Subtle Inner Glass Glint */}
                <div className="absolute inset-0 rounded-xl sm:rounded-2xl bg-gradient-to-b from-white/30 to-transparent pointer-events-none" />

                <Icon
                  className={`w-4 h-4 sm:w-5 sm:h-5 transition-transform duration-200 ${
                    isActive ? 'scale-105' : 'sm:group-hover:scale-110'
                  }`}
                />
              </div>

              {/* macOS Active App Indicator Dot */}
              <div className="h-1 sm:h-1.5 flex items-center justify-center mt-0.5 sm:mt-1">
                <span
                  className={`w-1 h-1 rounded-full transition-all duration-300 ${
                    isActive
                      ? 'bg-slate-800 scale-100 sm:scale-125 shadow-[0_0_4px_rgba(0,0,0,0.4)]'
                      : 'bg-transparent scale-0'
                  }`}
                />
              </div>
            </Link>
          )
        })}

        {/* Dock Vertical Divider */}
        <div className="w-[1px] h-5 sm:h-7 bg-slate-200/90 mx-0.5 sm:mx-1.5 self-center shrink-0" />

        {/* Siri / Voice Assistant Quick Action Button */}
        <button
          type="button"
          onClick={() => {
            if (onTriggerVoice) {
              onTriggerVoice()
            } else if (onTabChange) {
              onTabChange('voice')
            }
          }}
          className="group relative flex flex-col items-center focus:outline-none cursor-pointer shrink-0"
          aria-label="Voice Assistant"
        >
          {/* Tooltip */}
          <div className="hidden sm:block absolute -top-11 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-150 transform group-hover:-translate-y-1 z-30">
            <div className="px-2.5 py-1 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-[11px] font-medium tracking-tight whitespace-nowrap shadow-lg backdrop-blur-md">
              AI Voice Assistant
            </div>
            <div className="w-1.5 h-1.5 bg-indigo-600 rotate-45 mx-auto -mt-1" />
          </div>

          <div className="relative w-8 h-8 min-w-[32px] sm:w-11 sm:h-11 sm:min-w-[44px] rounded-xl sm:rounded-2xl bg-gradient-to-tr from-purple-500 via-indigo-500 to-pink-500 text-white flex items-center justify-center shadow-md shadow-indigo-500/30 transition-all duration-200 ease-out sm:group-hover:scale-125 sm:group-hover:-translate-y-2 group-active:scale-95 ring-1.5 sm:ring-2 ring-white/80">
            <div className="absolute inset-0 rounded-xl sm:rounded-2xl bg-gradient-to-b from-white/40 to-transparent pointer-events-none" />
            <Mic className="w-4 h-4 sm:w-5 sm:h-5 animate-pulse" />
          </div>

          {/* Spacer to align with dots */}
          <div className="h-1 sm:h-1.5 mt-0.5 sm:mt-1" />
        </button>

        {/* Sign Out Button */}
        <button
          type="button"
          onClick={logout}
          className="group relative flex flex-col items-center focus:outline-none cursor-pointer shrink-0"
          aria-label="Sign Out"
        >
          {/* Tooltip */}
          <div className="hidden sm:block absolute -top-11 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-150 transform group-hover:-translate-y-1 z-30">
            <div className="px-2.5 py-1 rounded-xl bg-rose-600 text-white text-[11px] font-medium tracking-tight whitespace-nowrap shadow-lg backdrop-blur-md">
              Sign Out
            </div>
            <div className="w-1.5 h-1.5 bg-rose-600 rotate-45 mx-auto -mt-1" />
          </div>

          <div className="relative w-8 h-8 min-w-[32px] sm:w-11 sm:h-11 sm:min-w-[44px] rounded-xl sm:rounded-2xl bg-white/80 hover:bg-rose-50 text-slate-500 hover:text-rose-600 border border-slate-200/60 shadow-sm flex items-center justify-center transition-all duration-200 ease-out sm:group-hover:scale-125 sm:group-hover:-translate-y-2 group-active:scale-95">
            <LogOut className="w-3.5 h-3.5 sm:w-4 sm:h-4 transition-transform duration-200 sm:group-hover:scale-110" />
          </div>

          {/* Spacer */}
          <div className="h-1 sm:h-1.5 mt-0.5 sm:mt-1" />
        </button>
      </div>
    </nav>
  )
}
