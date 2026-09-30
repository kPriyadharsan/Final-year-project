import { useState } from 'react'
import { Sidebar } from './Sidebar'
import { TopNav } from './TopNav'

export function DashboardLayout({
  children,
  pageTitle = 'Dashboard',
  activeTab,
  onTabChange,
}) {
  // Desktop sidebar expanded vs collapsed
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  // Mobile drawer sidebar open vs closed
  const [isMobileOpen, setIsMobileOpen] = useState(false)

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500/30 selection:text-indigo-200">
      {/* Dynamic Sidebar (Desktop drawer + Mobile slideover) */}
      <Sidebar
        isOpen={isSidebarOpen}
        setIsOpen={setIsSidebarOpen}
        isMobileOpen={isMobileOpen}
        setIsMobileOpen={setIsMobileOpen}
        activeTab={activeTab}
        onTabChange={onTabChange}
      />

      {/* Main Content Area: dynamically offsets margin according to sidebar state */}
      <div
        className={`flex-1 flex flex-col transition-all duration-300 ease-in-out ${
          isSidebarOpen ? 'lg:pl-64' : 'lg:pl-20'
        }`}
      >
        {/* Top Navigation */}
        <TopNav
          isSidebarOpen={isSidebarOpen}
          onToggleMobileSidebar={() => setIsMobileOpen(true)}
          pageTitle={pageTitle}
        />

        {/* Content Viewport */}
        <main className="flex-1 overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  )
}
