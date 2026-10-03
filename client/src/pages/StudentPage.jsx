import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { API_BASE_URL } from '../config/api'
import {
  GraduationCap,
  LogOut,
  Building2,
  Calendar,
  ShieldCheck,
  Radio,
  BookOpen,
  Sparkles,
  RefreshCw,
} from 'lucide-react'

export function StudentPage() {
  const { user, token, logout } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchStudentData = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE_URL}/api/student/classes`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      })
      if (!res.ok) {
        throw new Error(`Failed to load student classes: ${res.statusText}`)
      }
      const json = await res.json()
      setData(json)
    } catch (err) {
      setError(err.message || 'Failed to load classroom details.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStudentData()
  }, [])

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 selection:bg-blue-500/20 selection:text-blue-900 relative pb-16 font-sans">
      {/* iOS 27 Background Ambient Fluid Glow */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute -top-40 -left-40 w-[500px] h-[500px] bg-gradient-to-br from-blue-300/25 to-indigo-300/20 rounded-full blur-3xl opacity-70"></div>
        <div className="absolute top-1/3 -right-40 w-[500px] h-[500px] bg-gradient-to-br from-purple-300/20 via-pink-200/20 to-transparent rounded-full blur-3xl opacity-60"></div>
        <div className="absolute -bottom-40 left-1/3 w-[500px] h-[500px] bg-gradient-to-tr from-cyan-300/20 to-blue-200/20 rounded-full blur-3xl opacity-60"></div>
      </div>

      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-30 border-b border-white/60 bg-white/70 backdrop-blur-2xl px-6 py-4 shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-violet-600 flex items-center justify-center shadow-md shadow-blue-500/25 text-white">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
                Smart Classroom
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-blue-800 border border-blue-200/60">
                  Student Portal
                </span>
              </h1>
              <p className="text-xs text-slate-500">Autonomous IoT &amp; AI Facility Platform</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 text-right">
              <div>
                <p className="text-xs font-semibold text-slate-800">{user?.name || 'Student'}</p>
                <p className="text-[11px] text-slate-500">{user?.email}</p>
              </div>
            </div>

            <button
              onClick={logout}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-slate-100/80 hover:bg-rose-50 hover:text-rose-600 border border-slate-200/80 text-xs font-semibold text-slate-600 transition-all cursor-pointer shadow-sm active:scale-95"
              title="Sign Out"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-6xl mx-auto px-6 pt-8 space-y-6">
        {/* Welcome Banner Card */}
        <div className="bg-white/80 border border-white/90 rounded-[28px] p-6 sm:p-8 backdrop-blur-2xl shadow-[0_10px_35px_rgba(0,0,0,0.04)] relative overflow-hidden">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-200/80 text-blue-700 text-xs font-medium mb-3">
              <GraduationCap className="w-3.5 h-3.5 text-blue-600" />
              <span>Enrolled Student Session</span>
            </div>
            <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight mb-2">
              Welcome back, {user?.name || 'Student'}!
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Your student account allows you to view active smart classroom facilities and schedule information. Device controls and administrative features are restricted to authorized Faculty and Super Administrators.
            </p>
          </div>
        </div>

        {/* Classroom Info Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Enrolled Classes Card */}
          <div className="bg-white/80 border border-white/90 rounded-[28px] p-6 backdrop-blur-2xl shadow-[0_10px_35px_rgba(0,0,0,0.04)]">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-blue-600" />
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                  Enrolled Classes
                </h3>
              </div>
              <button
                onClick={fetchStudentData}
                disabled={loading}
                className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition cursor-pointer"
                title="Refresh"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {loading ? (
              <div className="py-8 text-center text-xs text-slate-400">Loading enrolled courses...</div>
            ) : error ? (
              <div className="p-3 rounded-2xl bg-rose-50 text-rose-700 text-xs border border-rose-200">
                {error}
              </div>
            ) : data?.student?.enrolledClasses && data.student.enrolledClasses.length > 0 ? (
              <ul className="space-y-2">
                {data.student.enrolledClasses.map((cls, idx) => (
                  <li
                    key={idx}
                    className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-100 text-xs"
                  >
                    <span className="font-semibold text-slate-800">{cls}</span>
                    <span className="text-emerald-600 font-medium flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Active
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="py-6 text-center text-xs text-slate-500">
                No specific classes assigned to your student profile yet.
              </div>
            )}
          </div>

          {/* Active Classrooms Card */}
          <div className="bg-white/80 border border-white/90 rounded-[28px] p-6 backdrop-blur-2xl shadow-[0_10px_35px_rgba(0,0,0,0.04)]">
            <div className="flex items-center gap-2 mb-4">
              <Building2 className="w-4 h-4 text-indigo-600" />
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                Available Classrooms
              </h3>
            </div>

            {loading ? (
              <div className="py-8 text-center text-xs text-slate-400">Checking campus classrooms...</div>
            ) : data?.availableClassrooms && data.availableClassrooms.length > 0 ? (
              <div className="grid grid-cols-2 gap-2.5">
                {data.availableClassrooms.map((room, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-2xl bg-slate-50/80 border border-slate-200/60 flex items-center gap-2 text-xs font-semibold text-slate-800"
                  >
                    <Radio className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                    <span className="truncate">{room}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-6 text-center text-xs text-slate-500">
                Classroom list is being synchronized with active ESP32 nodes.
              </div>
            )}
          </div>
        </div>

        {/* Security & Access Rights Notice */}
        <div className="p-4 rounded-2xl bg-blue-50/60 border border-blue-200/50 flex items-start gap-3 text-xs text-blue-800">
          <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            Role-Based Access Control (RBAC) is enforced. Direct MQTT device relay control, voice automation, and administrative user provisioning are protected and audited server-side.
          </p>
        </div>
      </main>
    </div>
  )
}
