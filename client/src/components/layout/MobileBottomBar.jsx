import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  Zap,
  School,
  Menu,
  Mic,
  Sparkles,
  Settings,
  Users,
  LogOut,
  X,
  Radio,
  Cpu,
  Wifi,
  ChevronRight,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useHaptics, useCenterAction, useSwipeGesture } from '../../hooks'

/**
 * MobileBottomBar
 * Native-feeling mobile bottom navigation bar tailored specifically for mobile touch ergonomics.
 * Features 4 thumb-friendly tabs, an ultra-prominent elevated center action button (AI Voice),
 * and a slide-up quick sheet for system options and sign out.
 */
export function MobileBottomBar({ activeTab, onTabChange, onTriggerVoice }) {
  const { user, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const { triggerHaptic } = useHaptics()
  const { centerAction } = useCenterAction()

  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const isSuperAdmin = user?.role === 'SUPER_ADMIN'

  // Primary 4 tabs for mobile bottom bar
  const mainTabs = isSuperAdmin
    ? [
        {
          id: 'overview',
          label: 'Overview',
          href: '/admin#overview',
          icon: LayoutDashboard,
        },
        {
          id: 'device-control',
          label: 'Controls',
          href: '/admin/device-control',
          icon: Zap,
        },
        {
          id: 'classes',
          label: 'Rooms',
          href: '/admin#classes',
          icon: School,
        },
        {
          id: 'more',
          label: 'Menu',
          isDrawerTrigger: true,
          icon: Menu,
        },
      ]
    : [
        {
          id: 'overview',
          label: 'Workspace',
          href: '/teacher',
          icon: LayoutDashboard,
        },
        {
          id: 'device-control',
          label: 'Controls',
          href: '/admin/device-control',
          icon: Zap,
        },
        {
          id: 'classes',
          label: 'Classes',
          href: '/teacher#classes',
          icon: School,
        },
        {
          id: 'more',
          label: 'Menu',
          isDrawerTrigger: true,
          icon: Menu,
        },
      ]

  // Secondary items shown in the slide-up sheet
  const drawerLinks = isSuperAdmin
    ? [
        { id: 'teachers', label: 'Faculty Directory', icon: Users, href: '/admin#teachers' },
        { id: 'devices', label: 'IoT Infrastructure', icon: Cpu, href: '/admin#devices' },
        { id: 'ai-system', label: 'AI Voice & LLM Config', icon: Sparkles, href: '/admin#ai-system' },
        { id: 'settings', label: 'System Preferences', icon: Settings, href: '/admin#settings' },
      ]
    : [
        { id: 'devices', label: 'Relays & Hardware', icon: Cpu, href: '/teacher#relays' },
        { id: 'voice', label: 'AI Voice Console', icon: Mic, href: '/teacher#voice' },
        { id: 'settings', label: 'Preferences', icon: Settings, href: '/teacher#settings' },
      ]

  const handleTabClick = (tab, e) => {
    triggerHaptic('light')
    if (tab.isDrawerTrigger) {
      e?.preventDefault()
      setIsDrawerOpen(true)
      return
    }

    if (onTabChange) {
      onTabChange(tab.id)
    }
  }

  const handleCenterButtonClick = () => {
    triggerHaptic('medium')
    if (centerAction?.onClick) {
      centerAction.onClick()
    } else if (onTriggerVoice) {
      onTriggerVoice()
    } else {
      navigate('/voice')
    }
  }

  // Swipe-down gesture to dismiss mobile drawer
  const { touchHandlers } = useSwipeGesture({
    onSwipeDown: () => {
      triggerHaptic('light')
      setIsDrawerOpen(false)
    },
  })

  return (
    <>
      {/* Mobile Bottom Navigation Bar: Visible exclusively on mobile (< 768px) */}
      <nav
        aria-label="Mobile Navigation"
        className="fixed bottom-0 inset-x-0 z-40 md:hidden pointer-events-auto select-none"
      >
        {/* Blur container with safe area inset padding */}
        <div className="relative bg-white/90 backdrop-blur-2xl border-t border-slate-200/80 shadow-[0_-8px_30px_rgba(0,0,0,0.08)] px-2 pt-1 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          {/* Subtle specular glint */}
          <div className="absolute inset-x-6 top-0 h-[1px] bg-gradient-to-r from-transparent via-white to-transparent pointer-events-none" />

          {/* Bar Items Layout: Left 2 tabs | CENTER ELEVATED BUTTON | Right 2 tabs */}
          <div className="flex items-center justify-between max-w-md mx-auto relative px-1">
            {/* Left Tab 1 */}
            <NavItem
              item={mainTabs[0]}
              activeTab={activeTab}
              location={location}
              onClick={(e) => handleTabClick(mainTabs[0], e)}
            />

            {/* Left Tab 2 */}
            <NavItem
              item={mainTabs[1]}
              activeTab={activeTab}
              location={location}
              onClick={(e) => handleTabClick(mainTabs[1], e)}
            />

            {/* CENTER ELEVATED HERO ACTION BUTTON (The AI Voice Mic Button) */}
            <div className="relative -top-5 flex flex-col items-center justify-center shrink-0 z-50">
              {/* Outer Radiant Glow Rings */}
              <div
                className={`absolute inset-0 rounded-full bg-gradient-to-tr ${
                  centerAction?.gradient || 'from-purple-600 via-indigo-600 to-pink-500'
                } blur-md opacity-60 animate-pulse pointer-events-none`}
              />

              <button
                type="button"
                onClick={handleCenterButtonClick}
                className={`relative w-14 h-14 rounded-full bg-gradient-to-tr ${
                  centerAction?.gradient || 'from-purple-600 via-indigo-600 to-pink-500'
                } text-white flex items-center justify-center shadow-lg ${
                  centerAction?.shadow || 'shadow-indigo-500/35'
                } ring-4 ring-white/95 active:scale-90 transition-all duration-200 cursor-pointer`}
                aria-label={centerAction?.ariaLabel || 'AI Voice Control'}
              >
                {/* Specular Glint */}
                <div className="absolute inset-0 rounded-full bg-gradient-to-b from-white/40 via-transparent to-black/10 pointer-events-none" />

                <Mic className="w-6 h-6 text-white animate-pulse" />
              </button>

              <span className="text-[10px] font-bold text-slate-800 tracking-tight mt-1 leading-none">
                {centerAction?.label || 'Voice'}
              </span>
            </div>

            {/* Right Tab 1 */}
            <NavItem
              item={mainTabs[2]}
              activeTab={activeTab}
              location={location}
              onClick={(e) => handleTabClick(mainTabs[2], e)}
            />

            {/* Right Tab 2 (Menu Trigger) */}
            <NavItem
              item={mainTabs[3]}
              activeTab={activeTab}
              location={location}
              onClick={(e) => handleTabClick(mainTabs[3], e)}
            />
          </div>
        </div>
      </nav>

      {/* Slide-Up Mobile Quick Sheet / Drawer */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden select-none">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity"
            onClick={() => {
              triggerHaptic('light')
              setIsDrawerOpen(false)
            }}
          />

          {/* Bottom Sheet Modal */}
          <div
            {...touchHandlers}
            className="fixed inset-x-0 bottom-0 bg-white/95 backdrop-blur-3xl rounded-t-[32px] border-t border-white/80 shadow-2xl pb-[max(1.5rem,env(safe-area-inset-bottom))] transition-transform duration-300 animate-slideUp overflow-hidden max-h-[85vh] flex flex-col"
          >
            {/* Swipe handle indicator */}
            <div className="pt-3 pb-2 flex justify-center">
              <div className="w-12 h-1.5 bg-slate-300/80 rounded-full" />
            </div>

            {/* Drawer Header */}
            <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-500 to-indigo-600 text-white flex items-center justify-center font-bold text-sm shadow-sm">
                  {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">{user?.name || 'Classroom User'}</h3>
                  <p className="text-xs text-slate-500">{user?.role === 'SUPER_ADMIN' ? 'Super Administrator' : 'Faculty Member'}</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsDrawerOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center active:scale-95"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Drawer Fast Links */}
            <div className="p-4 space-y-1.5 overflow-y-auto">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 px-3 py-1">
                Navigation &amp; Controls
              </div>

              {drawerLinks.map((link) => {
                const Icon = link.icon
                return (
                  <Link
                    key={link.id}
                    to={link.href}
                    onClick={() => {
                      triggerHaptic('light')
                      setIsDrawerOpen(false)
                      onTabChange?.(link.id)
                    }}
                    className="flex items-center justify-between px-3.5 py-3 rounded-2xl bg-slate-50 hover:bg-slate-100 text-slate-800 font-medium text-xs transition-colors active:scale-98"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-white border border-slate-200/70 flex items-center justify-center text-slate-700 shadow-2xs">
                        <Icon className="w-4 h-4" />
                      </div>
                      <span>{link.label}</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  </Link>
                )
              })}

              {/* Direct Link to Standalone Voice Experience */}
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('medium')
                  setIsDrawerOpen(false)
                  navigate('/voice')
                }}
                className="w-full flex items-center justify-between px-3.5 py-3 rounded-2xl bg-gradient-to-r from-purple-500/10 via-indigo-500/10 to-pink-500/10 border border-indigo-200/60 text-indigo-900 font-medium text-xs transition-colors active:scale-98"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-white flex items-center justify-center shadow-xs">
                    <Mic className="w-4 h-4" />
                  </div>
                  <div className="text-left">
                    <div className="font-bold">ChatGPT Voice Experience</div>
                    <div className="text-[10px] text-indigo-600/80">Lively voice &amp; zero-delay control</div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-indigo-500" />
              </button>

              {/* Sign Out */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('warning')
                    setIsDrawerOpen(false)
                    logout()
                  }}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-rose-50 text-rose-600 font-semibold text-xs border border-rose-200/60 active:scale-98"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sign Out of Session</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function NavItem({ item, activeTab, location, onClick }) {
  const Icon = item.icon
  const isActive = activeTab
    ? activeTab === item.id
    : location.pathname === item.href ||
      location.pathname + location.hash === item.href ||
      (item.id === 'overview' && !location.hash && location.pathname !== '/admin/device-control')

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-1 flex flex-col items-center justify-center py-1 min-w-[56px] min-h-[48px] focus:outline-none transition-all active:scale-90"
      aria-label={item.label}
    >
      <div
        className={`w-9 h-7 rounded-full flex items-center justify-center transition-all ${
          isActive
            ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/30'
            : 'text-slate-500 hover:text-slate-900'
        }`}
      >
        <Icon className="w-4 h-4" />
      </div>
      <span
        className={`text-[10px] mt-0.5 tracking-tight font-medium leading-none ${
          isActive ? 'text-blue-600 font-bold' : 'text-slate-500'
        }`}
      >
        {item.label}
      </span>
    </button>
  )
}
