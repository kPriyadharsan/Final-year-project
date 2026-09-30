import { useState } from 'react'
import {
  School,
  MonitorPlay,
  Mic,
  CalendarCheck,
  Terminal,
  Layers,
  Sparkles,
  Sliders,
  CheckCircle2,
  RefreshCw,
  Clock,
  BookOpen,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { testProtectedRoute } from '../services/auth.service'
import { DashboardLayout, PageContainer } from '../components/layout'
import {
  Button,
  Badge,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  StatCard,
  Modal,
  LoadingSpinner,
  SkeletonCard,
  EmptyState,
  ErrorState,
  AlertBanner,
} from '../components/ui'

export function TeacherPage() {
  const { user, token } = useAuth()

  // API Verification State
  const [testResult, setTestResult] = useState(null)
  const [isTesting, setIsTesting] = useState(false)

  // Interactive UI Showcase States
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [showLoadingDemo, setShowLoadingDemo] = useState(false)
  const [showAlert, setShowAlert] = useState(true)

  const handleTestTeacherRoute = async () => {
    setIsTesting(true)
    try {
      const result = await testProtectedRoute('/api/teacher/test', token)
      setTestResult({
        status: result.status,
        ok: result.ok,
        data: result.data,
        timestamp: new Date().toLocaleTimeString(),
      })
    } catch (err) {
      setTestResult({
        status: 500,
        ok: false,
        data: { message: err.message },
        timestamp: new Date().toLocaleTimeString(),
      })
    } finally {
      setIsTesting(false)
    }
  }

  return (
    <DashboardLayout pageTitle="Faculty Workspace">
      <PageContainer
        title="Teacher Dashboard"
        subtitle="Manage assigned lecture halls, voice controls, and smart classroom equipment."
        badge={
          <Badge variant="info" dot pulse size="md">
            TEACHER
          </Badge>
        }
        breadcrumbs={[
          { label: 'Faculty', href: '#' },
          { label: 'Portal' },
          { label: 'Dashboard' },
        ]}
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Sliders className="w-3.5 h-3.5" />}
              onClick={() => setIsModalOpen(true)}
            >
              Session Settings
            </Button>
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Terminal className="w-3.5 h-3.5" />}
              isLoading={isTesting}
              onClick={handleTestTeacherRoute}
            >
              Verify Access
            </Button>
          </>
        }
      >
        {/* Notice Banner */}
        {showAlert && (
          <AlertBanner
            variant="info"
            title="Faculty Access Authorized"
            message="Smart classroom automated controls ready. Voice commands can be initiated from lecture rooms."
            onDismiss={() => setShowAlert(false)}
          />
        )}

        {/* Top Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
          <StatCard
            title="Assigned Rooms"
            value="Room 302"
            description="Smart Lab & Lecture Hall"
            icon={<School className="w-5 h-5 text-cyan-400" />}
            badge={
              <Badge variant="success" dot pulse size="sm">
                Ready for Class
              </Badge>
            }
          />
          <StatCard
            title="Smart Projector"
            value="Standby"
            description="HDMI 1 + Wireless Cast"
            icon={<MonitorPlay className="w-5 h-5" />}
            badge={
              <Badge variant="neutral" size="sm">
                Power Off
              </Badge>
            }
          />
          <StatCard
            title="Voice Assistant"
            value="Active"
            description="Mic relay online"
            icon={<Mic className="w-5 h-5 text-indigo-400" />}
            badge={
              <Badge variant="purple" size="sm">
                Bilingual Enabled
              </Badge>
            }
          />
          <StatCard
            title="Schedule"
            value="10:00 AM"
            description="Next: Distributed Systems"
            icon={<Clock className="w-5 h-5" />}
            badge={
              <Badge variant="info" size="sm">
                Upcoming
              </Badge>
            }
          />
        </div>

        {/* Main Content Sections */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* Teacher Route Security Verification Card */}
            <Card>
              <CardHeader>
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-cyan-400" />
                    <span>Teacher Authorization Verification</span>
                  </CardTitle>
                  <CardDescription>
                    Validates <code className="text-cyan-300">GET /api/teacher/test</code> token authorization using JWT authentication.
                  </CardDescription>
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleTestTeacherRoute}
                  isLoading={isTesting}
                >
                  Verify Access
                </Button>
              </CardHeader>

              <CardContent className="space-y-4">
                {testResult ? (
                  <div className="rounded-xl bg-slate-950 border border-slate-800 p-4 font-mono text-xs space-y-2">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                          testResult.ok
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-rose-500/20 text-rose-300'
                        }`}
                      >
                        HTTP {testResult.status} {testResult.ok ? 'OK' : 'FORBIDDEN'}
                      </span>
                      <span className="text-[11px] text-slate-500">{testResult.timestamp}</span>
                    </div>
                    <pre
                      className={`overflow-x-auto ${
                        testResult.ok ? 'text-emerald-300' : 'text-rose-300'
                      }`}
                    >
                      {JSON.stringify(testResult.data, null, 2)}
                    </pre>
                  </div>
                ) : (
                  <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/60 flex items-center justify-between text-xs text-slate-400">
                    <span>Click "Verify Access" to execute the test query.</span>
                    <Badge variant="neutral" size="sm">Idle</Badge>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Reusable UI Components Preview for Faculty */}
            <Card>
              <CardHeader>
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-indigo-400" />
                    <span>Quick Action Relays</span>
                  </CardTitle>
                  <CardDescription>
                    Classroom preset toggles powered by reusable Button & Badge components.
                  </CardDescription>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <Button variant="secondary" size="md">
                    Start Presentation
                  </Button>
                  <Button variant="outline" size="md">
                    Toggle Lights (50%)
                  </Button>
                  <Button variant="outline" size="md">
                    Air Conditioner
                  </Button>
                </div>

                <div className="pt-3 border-t border-slate-800/60 flex items-center justify-between">
                  <span className="text-xs text-slate-400">Loading State Component:</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowLoadingDemo(!showLoadingDemo)}
                  >
                    {showLoadingDemo ? 'Hide Loader' : 'Demo Loader'}
                  </Button>
                </div>

                {showLoadingDemo && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                    <SkeletonCard />
                    <SkeletonCard />
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Column: Faculty Profile & Empty State */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Faculty Profile</CardTitle>
                <Badge variant="info" size="sm">Authorized</Badge>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
                  <span className="text-[11px] text-slate-400 font-medium uppercase tracking-wider block">Faculty Member</span>
                  <div className="mt-1 text-sm font-semibold text-white">{user?.name}</div>
                </div>

                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
                  <span className="text-[11px] text-slate-400 font-medium uppercase tracking-wider block">Email Address</span>
                  <div className="mt-1 text-xs font-mono text-cyan-300 truncate">{user?.email}</div>
                </div>

                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
                  <span className="text-[11px] text-slate-400 font-medium uppercase tracking-wider block">Department</span>
                  <div className="mt-1 text-xs text-slate-300">{user?.department || 'Department of Computer Science'}</div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Attendance Logs</CardTitle>
              </CardHeader>
              <CardContent>
                <EmptyState
                  title="No active session logs"
                  description="Attendance tracking will initialize automatically when class begins."
                  action={
                    <Button variant="outline" size="sm" onClick={() => setIsModalOpen(true)}>
                      Configure Class
                    </Button>
                  }
                />
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Modal Base Component */}
        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title="Classroom Environment Preferences"
          description="Customize default lecture lighting and projector preset for Room 302."
          footer={
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setIsModalOpen(false)}
              >
                Save Preferences
              </Button>
            </>
          }
        >
          <div className="space-y-3 text-xs">
            <p className="text-slate-300">
              When class begins, the smart system can automatically configure projectors, dim front ambient light relays, and initialize speech recognition.
            </p>
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 font-mono text-[11px]">
              Preset: Computer Science Lecture (Lab 302)
            </div>
          </div>
        </Modal>
      </PageContainer>
    </DashboardLayout>
  )
}
