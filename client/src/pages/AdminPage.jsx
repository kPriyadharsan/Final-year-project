import { useState } from 'react'
import {
  School,
  Cpu,
  Mic,
  Users,
  Terminal,
  Layers,
  Sparkles,
  Sliders,
  CheckCircle2,
  RefreshCw,
  BellRing,
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
  CardFooter,
  StatCard,
  Modal,
  LoadingSpinner,
  PageLoading,
  SkeletonCard,
  SkeletonTable,
  EmptyState,
  ErrorState,
  AlertBanner,
} from '../components/ui'

export function AdminPage() {
  const { user, token } = useAuth()

  // API Verification State
  const [testResult, setTestResult] = useState(null)
  const [isTesting, setIsTesting] = useState(false)

  // Interactive UI Showcase States
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [showLoadingDemo, setShowLoadingDemo] = useState(false)
  const [showErrorDemo, setShowErrorDemo] = useState(false)
  const [showAlert, setShowAlert] = useState(true)

  const handleTestAdminRoute = async () => {
    setIsTesting(true)
    try {
      const result = await testProtectedRoute('/api/admin/test', token)
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
    <DashboardLayout pageTitle="Super Admin Console">
      <PageContainer
        title="Admin Overview"
        subtitle="Manage automated classroom IoT hardware, faculty permissions, and voice assistant telemetry."
        badge={
          <Badge variant="purple" dot pulse size="md">
            SUPER_ADMIN
          </Badge>
        }
        breadcrumbs={[
          { label: 'System', href: '#' },
          { label: 'Management' },
          { label: 'Overview' },
        ]}
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Sliders className="w-3.5 h-3.5" />}
              onClick={() => setIsModalOpen(true)}
            >
              System Modal
            </Button>
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Terminal className="w-3.5 h-3.5" />}
              isLoading={isTesting}
              onClick={handleTestAdminRoute}
            >
              Test Route
            </Button>
          </>
        }
      >
        {/* Optional Alert Notification Banner */}
        {showAlert && (
          <AlertBanner
            variant="info"
            title="Smart Classroom System Notice"
            message="UI component system initialized with Tailwind CSS and Lucide React. Live data hooks will connect in subsequent modules."
            onDismiss={() => setShowAlert(false)}
          />
        )}

        {/* Top Metric / StatCards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
          <StatCard
            title="Classrooms"
            value="14 / 16"
            description="Active automated lecture halls"
            icon={<School className="w-5 h-5" />}
            badge={
              <Badge variant="success" dot pulse size="sm">
                Operational
              </Badge>
            }
          />
          <StatCard
            title="IoT Relay Hubs"
            value="48 Relays"
            description="ESP32 Smart controllers online"
            icon={<Cpu className="w-5 h-5" />}
            badge={
              <Badge variant="info" size="sm">
                48 / 48 Linked
              </Badge>
            }
          />
          <StatCard
            title="Voice Engine"
            value="Gemini AI"
            description="Speech-to-relay intent parser"
            icon={<Mic className="w-5 h-5 text-purple-400" />}
            badge={
              <Badge variant="purple" size="sm">
                Ready (Tamil/Eng)
              </Badge>
            }
          />
          <StatCard
            title="Faculty Registered"
            value="24 Accounts"
            description="Verified teacher profiles"
            icon={<Users className="w-5 h-5" />}
            badge={
              <Badge variant="neutral" size="sm">
                RBAC Active
              </Badge>
            }
          />
        </div>

        {/* Two-column Core Workspace */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main 2-column wide block: Live API Verification + UI Component Preview */}
          <div className="lg:col-span-2 space-y-6">
            {/* Backend Admin Route Verification Card */}
            <Card>
              <CardHeader>
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-purple-400" />
                    <span>Backend Route Security Verification</span>
                  </CardTitle>
                  <CardDescription>
                    Executes <code className="text-purple-300">GET /api/admin/test</code> using your JWT Bearer token to guarantee authorization enforcement.
                  </CardDescription>
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleTestAdminRoute}
                  isLoading={isTesting}
                >
                  Execute Check
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
                    <span>Click "Execute Check" to dispatch an authorized request.</span>
                    <Badge variant="neutral" size="sm">Idle</Badge>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* UI System Showcase: Buttons & Status Badges */}
            <Card>
              <CardHeader>
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-indigo-400" />
                    <span>Reusable UI Component System</span>
                  </CardTitle>
                  <CardDescription>
                    Tailwind CSS primitives designed for educational technology dashboards.
                  </CardDescription>
                </div>
              </CardHeader>

              <CardContent className="space-y-5">
                {/* Button Variants */}
                <div>
                  <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2.5">
                    Button Variants & Sizes
                  </h4>
                  <div className="flex flex-wrap gap-2.5">
                    <Button variant="primary" size="sm">Primary</Button>
                    <Button variant="secondary" size="sm">Secondary</Button>
                    <Button variant="outline" size="sm">Outline</Button>
                    <Button variant="ghost" size="sm">Ghost</Button>
                    <Button variant="success" size="sm">Success</Button>
                    <Button variant="danger" size="sm">Danger</Button>
                    <Button variant="primary" size="sm" isLoading>Loading</Button>
                  </div>
                </div>

                {/* Status Badges */}
                <div>
                  <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2.5">
                    Status Badges with Pulse Dots
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="success" dot pulse>Online / Operational</Badge>
                    <Badge variant="warning" dot>Warning / Pending</Badge>
                    <Badge variant="danger" dot pulse>Alarm / Offline</Badge>
                    <Badge variant="info">Info / Telemetry</Badge>
                    <Badge variant="purple" dot pulse>Super Admin</Badge>
                    <Badge variant="neutral">Neutral System</Badge>
                  </div>
                </div>

                {/* State Toggles (Loading, Empty, Error) */}
                <div className="pt-2 border-t border-slate-800/60">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400 font-medium">State Previews:</span>
                    <div className="flex items-center gap-2">
                      <Button
                        variant={showLoadingDemo ? 'secondary' : 'outline'}
                        size="sm"
                        onClick={() => setShowLoadingDemo(!showLoadingDemo)}
                      >
                        {showLoadingDemo ? 'Hide Skeletons' : 'View Skeletons'}
                      </Button>
                      <Button
                        variant={showErrorDemo ? 'danger' : 'outline'}
                        size="sm"
                        onClick={() => setShowErrorDemo(!showErrorDemo)}
                      >
                        {showErrorDemo ? 'Hide Error State' : 'View Error State'}
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Skeleton Loader Demo */}
                {showLoadingDemo && (
                  <div className="space-y-4 pt-2">
                    <h5 className="text-xs text-slate-400 font-mono">Skeleton Placeholders:</h5>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <SkeletonCard />
                      <SkeletonCard />
                    </div>
                    <SkeletonTable rows={3} />
                  </div>
                )}

                {/* Error State Demo */}
                {showErrorDemo && (
                  <ErrorState
                    title="Telemetry Gateway Error Simulated"
                    message="Failed to establish secure WebSocket handshake with NodeMCU room relay 101."
                    onRetry={() => setShowErrorDemo(false)}
                  />
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Column: User Profile & Empty State Card */}
          <div className="space-y-6">
            {/* Authenticated Profile Card */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Session Credentials</CardTitle>
                <Badge variant="purple" size="sm">Active</Badge>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
                  <span className="text-[11px] text-slate-400 font-medium uppercase tracking-wider block">Administrator</span>
                  <div className="mt-1 text-sm font-semibold text-white">{user?.name}</div>
                </div>

                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
                  <span className="text-[11px] text-slate-400 font-medium uppercase tracking-wider block">Email</span>
                  <div className="mt-1 text-xs font-mono text-purple-300 truncate">{user?.email}</div>
                </div>

                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
                  <span className="text-[11px] text-slate-400 font-medium uppercase tracking-wider block">Department</span>
                  <div className="mt-1 text-xs text-slate-300">{user?.department || 'Executive Campus Admin'}</div>
                </div>
              </CardContent>
            </Card>

            {/* Reusable Empty State Demo */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Automated Schedules</CardTitle>
              </CardHeader>
              <CardContent>
                <EmptyState
                  title="No active schedule overrides"
                  description="All classrooms are following standard timetable bell automation."
                  action={
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsModalOpen(true)}
                    >
                      Create Automation Rule
                    </Button>
                  }
                />
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Reusable Base Modal Component */}
        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title="Smart Classroom Configuration"
          description="Adjust system preferences for automated IoT relays and Gemini voice recognition."
          size="md"
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
                Apply Changes
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1.5">
                Automatic Relay Standby (Minutes)
              </label>
              <input
                type="number"
                defaultValue={15}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700/80 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
              />
              <span className="text-[11px] text-slate-500 mt-1 block">
                Turn off AC and projectors after classroom inactivity.
              </span>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1.5">
                Default Voice Assistant Language
              </label>
              <select className="w-full px-3 py-2 bg-slate-950 border border-slate-700/80 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500">
                <option value="en">English (Universal Campus)</option>
                <option value="ta">Tamil (Regional Faculty)</option>
                <option value="auto">Bilingual Automatic Detect</option>
              </select>
            </div>
          </div>
        </Modal>
      </PageContainer>
    </DashboardLayout>
  )
}
