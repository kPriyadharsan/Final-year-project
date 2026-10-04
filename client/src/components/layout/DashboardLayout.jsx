import { useState } from 'react'
import { TopNav } from './TopNav'
import { MacDock } from './MacDock'
import { Sidebar } from './Sidebar'

export function DashboardLayout({
  children,
  pageTitle = 'Dashboard',
  activeTab,
  onTabChange,
  onTriggerVoice,
}) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 flex flex-col font-sans selection:bg-blue-500/20 selection:text-blue-900 relative">
      {/* iOS 27 Fluid Ambient Lighting Glow (Subtle frosted iridescent background orbs) */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10 select-none">
        <div className="absolute -top-32 -left-32 w-[550px] h-[550px] bg-gradient-to-br from-blue-300/20 to-indigo-300/20 rounded-full blur-3xl opacity-70" />
        <div className="absolute top-1/4 -right-32 w-[600px] h-[600px] bg-gradient-to-br from-purple-300/15 via-pink-200/15 to-transparent rounded-full blur-3xl opacity-60" />
        <div className="absolute -bottom-32 left-1/3 w-[500px] h-[500px] bg-gradient-to-tr from-cyan-300/15 to-blue-200/15 rounded-full blur-3xl opacity-60" />
      </div>

      {/* Slide-over Mobile Navigation Drawer */}
      <Sidebar
        isOpen={true}
        setIsOpen={() => {}}
        isMobileOpen={isMobileMenuOpen}
        setIsMobileOpen={setIsMobileMenuOpen}
        activeTab={activeTab}
        onTabChange={(tab) => {
          setIsMobileMenuOpen(false)
          onTabChange?.(tab)
        }}
      />

      {/* Top macOS/iOS Navigation Bar */}
      <TopNav
        pageTitle={pageTitle}
        onToggleMobileMenu={() => setIsMobileMenuOpen((prev) => !prev)}
      />

      {/* Full-Width Spacious Main Viewport with Generous Bottom Clearance for Dock */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 pt-4 sm:pt-8 pb-44 sm:pb-56 space-y-6">
        {children}
        {/* Bottom clearance spacer ensuring no card is ever obscured by the floating Mac Dock */}
        <div className="h-12 w-full pointer-events-none" aria-hidden="true" />
      </main>

      {/* Bottom Liquid Glass macOS Dock */}
      <MacDock
        activeTab={activeTab}
        onTabChange={onTabChange}
        onTriggerVoice={onTriggerVoice}
      />
    </div>
  )
}
