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
  Lightbulb,
  Fan,
  Projector,
  FileText,
  HelpCircle,
  Image as ImageIcon,
  Presentation,
  Power,
  Users,
  Search,
  Plus,
  Send,
  Zap,
  Volume2,
  Share2,
  Download,
  AlertTriangle,
  Play,
  RotateCcw,
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
  SkeletonCard,
  EmptyState,
  AlertBanner,
} from '../components/ui'

export function TeacherPage() {
  const { user, token } = useAuth()

  // API Verification State
  const [testResult, setTestResult] = useState(null)
  const [isTesting, setIsTesting] = useState(false)

  // Feedback Notification Banner
  const [actionAlert, setActionAlert] = useState(null)

  // 1. MOCK STATE: Classroom Devices (Light, Fan, Projector)
  const [devices, setDevices] = useState([
    {
      id: 'light',
      name: 'Classroom Lights',
      type: 'Lighting Relay',
      icon: Lightbulb,
      room: 'Lab 302',
      isOn: true,
      isOnline: true,
      details: '80% Daylight Spectrum',
      relayChannel: 'Relay 1 (ESP32-RM302)',
    },
    {
      id: 'fan',
      name: 'Ceiling Fans',
      type: 'Ventilation Relay',
      icon: Fan,
      room: 'Lab 302',
      isOn: false,
      isOnline: true,
      details: 'Speed 3 (Medium)',
      relayChannel: 'Relay 2 (ESP32-RM302)',
    },
    {
      id: 'projector',
      name: 'Smart Projector',
      type: 'Presentation & Cast',
      icon: Projector,
      room: 'Lab 302',
      isOn: true,
      isOnline: true,
      details: 'HDMI 1 (Wireless Cast Ready)',
      relayChannel: 'Relay 3 (ESP32-RM302)',
    },
  ])

  // Toggle single device ON/OFF
  const handleToggleDevice = (deviceId) => {
    setDevices((prev) =>
      prev.map((dev) => {
        if (dev.id === deviceId) {
          const nextState = !dev.isOn
          setActionAlert({
            type: 'info',
            message: `${dev.name} turned ${nextState ? 'ON' : 'OFF'} in Room 302.`,
          })
          return { ...dev, isOn: nextState }
        }
        return dev
      })
    )
  }

  // Toggle online/offline state for simulation
  const handleToggleOnline = (deviceId) => {
    setDevices((prev) =>
      prev.map((dev) => {
        if (dev.id === deviceId) {
          const nextOnline = !dev.isOnline
          return { ...dev, isOnline: nextOnline }
        }
        return dev
      })
    )
  }

  // Master device toggles
  const handleAllDevices = (targetState) => {
    setDevices((prev) => prev.map((d) => ({ ...d, isOn: targetState })))
    setActionAlert({
      type: 'info',
      message: `All classroom devices turned ${targetState ? 'ON' : 'OFF'} in Room 302.`,
    })
  }

  // 2. MOCK STATE: Today's Classes
  const [todayClasses] = useState([
    {
      id: 'CLS-101',
      code: 'CS-302',
      title: 'AI & Natural Language Systems',
      room: 'Lab 302',
      time: '09:30 AM - 10:45 AM',
      studentsCount: 45,
      status: 'Live Now',
      isLive: true,
    },
    {
      id: 'CLS-102',
      code: 'CS-401',
      title: 'Cloud Infrastructure & Microservices',
      room: 'Room 101',
      time: '11:15 AM - 12:30 PM',
      studentsCount: 58,
      status: 'Upcoming',
      isLive: false,
    },
    {
      id: 'CLS-103',
      code: 'CS-Lab-3',
      title: 'Embedded Systems & IoT Relays',
      room: 'Lab 405',
      time: '02:00 PM - 04:00 PM',
      studentsCount: 36,
      status: 'Scheduled',
      isLive: false,
    },
  ])

  // 3. MOCK STATE: Recent Notes
  const [notes, setNotes] = useState([
    {
      id: 'NOTE-1',
      title: 'Lecture 14: Attention Mechanisms & Transformers',
      subject: 'CS-302 AI',
      time: 'Today, 09:10 AM',
      snippets: 'Overview of self-attention matrices, query-key-value projections, and multi-head attention.',
      attachments: 'Lecture_14_Slides.pdf',
    },
    {
      id: 'NOTE-2',
      title: 'Lab 4 Handout: NodeMCU Relay GPIO Wiring',
      subject: 'CS-Lab-3',
      time: 'Yesterday, 04:20 PM',
      snippets: 'Optocoupler isolation, 5V active-low relay triggering, and MQTT payload subscription.',
      attachments: 'Relay_Interfacing_Guide.docx',
    },
    {
      id: 'NOTE-3',
      title: 'Mid-term Quiz Revision Topics',
      subject: 'CS-401 Cloud',
      time: '2 days ago',
      snippets: 'Kubernetes pods, ingress controllers, distributed locks, and cap theorem trade-offs.',
      attachments: 'Revision_Bank.pdf',
    },
  ])

  // Modals Management for Quick Actions
  const [activeModal, setActiveModal] = useState(null) // 'voice' | 'notes' | 'quiz' | 'image' | 'ppt' | 'devices'

  // Voice Assistant Simulation State
  const [voiceInput, setVoiceInput] = useState('')
  const [isVoiceProcessing, setIsVoiceProcessing] = useState(false)
  const [voiceResult, setVoiceResult] = useState(null)

  // AI Generation Mock States
  const [newNoteTitle, setNewNoteTitle] = useState('')
  const [newNoteContent, setNewNoteContent] = useState('')
  const [quizTopic, setQuizTopic] = useState('Introduction to IoT Relays')
  const [quizResult, setQuizResult] = useState(null)
  const [imagePrompt, setImagePrompt] = useState('Schematic diagram of smart classroom IoT architecture')
  const [isGenerating, setIsGenerating] = useState(false)
  const [pptTopic, setPptTopic] = useState('Distributed Operating Systems Overview')
  const [pptResult, setPptResult] = useState(null)

  // Verify backend teacher route
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

  // Process Simulated Voice Command
  const handleProcessVoice = (inputCommand) => {
    const text = inputCommand || voiceInput
    if (!text.trim()) return

    setIsVoiceProcessing(true)
    setVoiceResult(null)

    setTimeout(() => {
      const lower = text.toLowerCase()
      let affectedDevice = null
      let targetState = true
      let actionLabel = 'DEVICE_COMMAND'

      if (lower.includes('light') || lower.includes('விளக்கு')) {
        affectedDevice = 'light'
        targetState = !lower.includes('off') && !lower.includes('அணை')
        actionLabel = targetState ? 'TURN_LIGHTS_ON' : 'TURN_LIGHTS_OFF'
      } else if (lower.includes('fan') || lower.includes('மின்விசிறி') || lower.includes('காற்றாடி')) {
        affectedDevice = 'fan'
        targetState = !lower.includes('off') && !lower.includes('அணை')
        actionLabel = targetState ? 'TURN_FANS_ON' : 'TURN_FANS_OFF'
      } else if (lower.includes('projector') || lower.includes('ப்ராஜெக்டர்')) {
        affectedDevice = 'projector'
        targetState = !lower.includes('off') && !lower.includes('அணை')
        actionLabel = targetState ? 'PROJECTOR_ON' : 'PROJECTOR_OFF'
      } else if (lower.includes('all off') || lower.includes('எல்லாம் அணை')) {
        handleAllDevices(false)
        actionLabel = 'ALL_RELAYS_OFF'
      }

      if (affectedDevice) {
        setDevices((prev) =>
          prev.map((d) => (d.id === affectedDevice ? { ...d, isOn: targetState } : d))
        )
      }

      setVoiceResult({
        command: text,
        language: /[\u0B80-\u0BFF]/.test(text) ? 'Tamil (தமிழ்)' : 'English',
        intent: actionLabel,
        targetRoom: 'Lab 302',
        status: 'Dispatched to Classroom Relay Hub',
        confidence: '99.1%',
      })

      setIsVoiceProcessing(false)
    }, 700)
  }

  // Create new note
  const handleSaveNote = (e) => {
    e.preventDefault()
    if (!newNoteTitle.trim()) return

    const newNote = {
      id: `NOTE-${Date.now()}`,
      title: newNoteTitle,
      subject: 'CS-302 AI',
      time: 'Just now',
      snippets: newNoteContent || 'Lecture notes summary created from faculty dashboard.',
      attachments: 'Quick_Class_Notes.txt',
    }

    setNotes([newNote, ...notes])
    setNewNoteTitle('')
    setNewNoteContent('')
    setActiveModal(null)
    setActionAlert({ type: 'success', message: 'New teaching notes saved successfully.' })
  }

  // Generate Quiz mock
  const handleGenerateQuiz = () => {
    setIsGenerating(true)
    setTimeout(() => {
      setQuizResult([
        {
          q: '1. What protocol is most commonly used for lightweight IoT sensor-to-broker telemetry?',
          options: ['A) HTTP/1.1', 'B) MQTT', 'C) FTP', 'D) Telnet'],
          ans: 'B) MQTT',
        },
        {
          q: '2. In an active-low relay module, which GPIO logic level activates the load?',
          options: ['A) Logic LOW (0V)', 'B) Logic HIGH (3.3V)', 'C) High Impedance', 'D) 12V'],
          ans: 'A) Logic LOW (0V)',
        },
        {
          q: '3. What role does optocoupler isolation provide in smart classroom hardware?',
          options: ['A) Increases Wi-Fi range', 'B) Electrical isolation between MCU and AC mains', 'C) Compresses voice packets', 'D) Powers HDMI output'],
          ans: 'B) Electrical isolation between MCU and AC mains',
        },
      ])
      setIsGenerating(false)
    }, 800)
  }

  // Generate PPT outline mock
  const handleGeneratePPT = () => {
    setIsGenerating(true)
    setTimeout(() => {
      setPptResult([
        { slide: 1, title: 'Title & Objective', bullets: ['Course: ' + pptTopic, 'Faculty: ' + (user?.name || 'Faculty Member'), 'Classroom: Lab 302'] },
        { slide: 2, title: 'Core Principles & Architecture', bullets: ['Key component diagram', 'Communication protocols', 'State management'] },
        { slide: 3, title: 'Practical Demonstration', bullets: ['Live sensor readings', 'Relay triggering sequence', 'Error recovery'] },
        { slide: 4, title: 'Summary & Quiz Review', bullets: ['Takeaways', 'Interactive question check', 'Next lecture preview'] },
      ])
      setIsGenerating(false)
    }, 800)
  }

  return (
    <DashboardLayout pageTitle="Faculty Workspace">
      <PageContainer
        title={`Welcome back, ${user?.name || 'Prof. Faculty'}`}
        subtitle="Manage live lecture halls, automated IoT relays, voice commands, and instructional materials."
        badge={
          <div className="flex items-center gap-2">
            <Badge variant="info" dot pulse size="md">
              TEACHER
            </Badge>
            <Badge variant="purple" size="sm">
              {user?.department || 'Computer Science & Engineering'}
            </Badge>
          </div>
        }
        breadcrumbs={[
          { label: 'Faculty Hub', href: '/teacher' },
          { label: 'Dashboard' },
          { label: 'Room 302' },
        ]}
        actions={
          <>
            {/* Prominent Voice Assistant Button */}
            <Button
              variant="primary"
              size="md"
              leftIcon={<Mic className="w-4 h-4 text-purple-200 animate-pulse" />}
              onClick={() => setActiveModal('voice')}
              className="bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-700 hover:from-indigo-500 hover:to-purple-500 shadow-md shadow-indigo-600/30 font-semibold"
            >
              Voice Assistant
            </Button>

            <Button
              variant="outline"
              size="md"
              leftIcon={<Terminal className="w-3.5 h-3.5" />}
              onClick={handleTestTeacherRoute}
              isLoading={isTesting}
            >
              Verify Token
            </Button>
          </>
        }
      >
        {/* Dynamic Action Alert Notification */}
        {actionAlert && (
          <AlertBanner
            variant="info"
            title="Classroom Action Dispatched"
            message={actionAlert.message}
            onDismiss={() => setActionAlert(null)}
          />
        )}

        {/* ---------------- 1. QUICK ACTIONS SECTION ---------------- */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>Quick Actions</span>
            </h2>
            <span className="text-[11px] text-slate-400 font-mono">
              Classroom & Content Shortcuts
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {/* Action 1: Control Devices */}
            <button
              type="button"
              onClick={() => {
                const el = document.getElementById('device-controls-section')
                el?.scrollIntoView({ behavior: 'smooth' })
              }}
              className="p-3.5 rounded-2xl bg-slate-900/70 border border-slate-800/90 hover:border-cyan-500/50 hover:bg-slate-800/80 transition-all text-left flex flex-col justify-between group cursor-pointer shadow-sm hover:scale-[1.02]"
            >
              <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center group-hover:bg-cyan-500/20 transition-colors">
                <Power className="w-4 h-4" />
              </div>
              <div className="mt-3">
                <div className="text-xs font-bold text-white group-hover:text-cyan-300 transition-colors">
                  Control Devices
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">Lights, Fan, Projector</div>
              </div>
            </button>

            {/* Action 2: Voice Control */}
            <button
              type="button"
              onClick={() => setActiveModal('voice')}
              className="p-3.5 rounded-2xl bg-slate-900/70 border border-slate-800/90 hover:border-purple-500/50 hover:bg-slate-800/80 transition-all text-left flex flex-col justify-between group cursor-pointer shadow-sm hover:scale-[1.02]"
            >
              <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center group-hover:bg-purple-500/20 transition-colors">
                <Mic className="w-4 h-4" />
              </div>
              <div className="mt-3">
                <div className="text-xs font-bold text-white group-hover:text-purple-300 transition-colors">
                  Voice Control
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">English & Tamil Audio</div>
              </div>
            </button>

            {/* Action 3: Create Notes */}
            <button
              type="button"
              onClick={() => setActiveModal('notes')}
              className="p-3.5 rounded-2xl bg-slate-900/70 border border-slate-800/90 hover:border-emerald-500/50 hover:bg-slate-800/80 transition-all text-left flex flex-col justify-between group cursor-pointer shadow-sm hover:scale-[1.02]"
            >
              <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center group-hover:bg-emerald-500/20 transition-colors">
                <FileText className="w-4 h-4" />
              </div>
              <div className="mt-3">
                <div className="text-xs font-bold text-white group-hover:text-emerald-300 transition-colors">
                  Create Notes
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">Classroom Summary</div>
              </div>
            </button>

            {/* Action 4: Generate Quiz */}
            <button
              type="button"
              onClick={() => setActiveModal('quiz')}
              className="p-3.5 rounded-2xl bg-slate-900/70 border border-slate-800/90 hover:border-amber-500/50 hover:bg-slate-800/80 transition-all text-left flex flex-col justify-between group cursor-pointer shadow-sm hover:scale-[1.02]"
            >
              <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center group-hover:bg-amber-500/20 transition-colors">
                <HelpCircle className="w-4 h-4" />
              </div>
              <div className="mt-3">
                <div className="text-xs font-bold text-white group-hover:text-amber-300 transition-colors">
                  Generate Quiz
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">Gemini AI Test Bank</div>
              </div>
            </button>

            {/* Action 5: Generate Image */}
            <button
              type="button"
              onClick={() => setActiveModal('image')}
              className="p-3.5 rounded-2xl bg-slate-900/70 border border-slate-800/90 hover:border-pink-500/50 hover:bg-slate-800/80 transition-all text-left flex flex-col justify-between group cursor-pointer shadow-sm hover:scale-[1.02]"
            >
              <div className="w-9 h-9 rounded-xl bg-pink-500/10 border border-pink-500/20 text-pink-400 flex items-center justify-center group-hover:bg-pink-500/20 transition-colors">
                <ImageIcon className="w-4 h-4" />
              </div>
              <div className="mt-3">
                <div className="text-xs font-bold text-white group-hover:text-pink-300 transition-colors">
                  Generate Image
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">Educational Diagrams</div>
              </div>
            </button>

            {/* Action 6: Generate PPT */}
            <button
              type="button"
              onClick={() => setActiveModal('ppt')}
              className="p-3.5 rounded-2xl bg-slate-900/70 border border-slate-800/90 hover:border-blue-500/50 hover:bg-slate-800/80 transition-all text-left flex flex-col justify-between group cursor-pointer shadow-sm hover:scale-[1.02]"
            >
              <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center group-hover:bg-blue-500/20 transition-colors">
                <Presentation className="w-4 h-4" />
              </div>
              <div className="mt-3">
                <div className="text-xs font-bold text-white group-hover:text-blue-300 transition-colors">
                  Generate PPT
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">Lecture Slide Outlines</div>
              </div>
            </button>
          </div>
        </div>

        {/* ---------------- 2. CLASSROOM DEVICE STATUS (Light, Fan, Projector) ---------------- */}
        <section id="device-controls-section" className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2.5">
                <h3 className="text-base font-bold text-white tracking-tight">
                  Classroom Device Status & Relays
                </h3>
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20 text-indigo-300">
                  Room 302
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Temporary mock state &bull; Hardware interface ready for ESP32 relay mapping
              </p>
            </div>

            {/* Master Batch Buttons */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleAllDevices(true)}
              >
                All ON
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleAllDevices(false)}
              >
                All OFF
              </Button>
            </div>
          </div>

          {/* 3 Core Device Cards: Light, Fan, Projector */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {devices.map((device) => {
              const IconComponent = device.icon
              return (
                <Card
                  key={device.id}
                  className={`p-5 space-y-4 border transition-all ${
                    device.isOn
                      ? 'border-indigo-500/40 bg-slate-900/80 shadow-md shadow-indigo-500/5'
                      : 'border-slate-800/80 bg-slate-900/40'
                  }`}
                >
                  {/* Top Bar: Icon, Name, and Status Badges */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-colors ${
                          device.isOn
                            ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                            : 'bg-slate-800 text-slate-400 border border-slate-700/80'
                        }`}
                      >
                        <IconComponent className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-white tracking-tight">
                          {device.name}
                        </h4>
                        <span className="text-[11px] text-slate-400 font-mono block">
                          {device.type}
                        </span>
                      </div>
                    </div>

                    {/* Online / Offline State Badge */}
                    <button
                      type="button"
                      onClick={() => handleToggleOnline(device.id)}
                      title="Click to toggle simulated online/offline status"
                      className="cursor-pointer"
                    >
                      <Badge
                        variant={device.isOnline ? 'success' : 'danger'}
                        dot={device.isOnline}
                        pulse={device.isOnline && device.isOn}
                        size="sm"
                      >
                        {device.isOnline ? 'Online' : 'Offline'}
                      </Badge>
                    </button>
                  </div>

                  {/* Device Telemetry Specs */}
                  <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-1 text-xs">
                    <div className="flex justify-between items-center text-slate-400">
                      <span>Operating State:</span>
                      <span
                        className={`font-mono font-bold ${
                          device.isOn ? 'text-emerald-400' : 'text-slate-400'
                        }`}
                      >
                        {device.isOn ? '● ACTIVE (ON)' : '○ STANDBY (OFF)'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-slate-400">
                      <span>Parameters:</span>
                      <span className="text-slate-200 font-medium truncate max-w-[150px]">
                        {device.details}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-slate-400">
                      <span>Relay Channel:</span>
                      <span className="text-cyan-300 font-mono text-[10px]">
                        {device.relayChannel}
                      </span>
                    </div>
                  </div>

                  {/* Control Button (ON/OFF Toggle) */}
                  <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          device.isOn ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'
                        }`}
                      ></span>
                      <span className="text-[11px] text-slate-400 font-mono">
                        Power: {device.isOn ? 'ON' : 'OFF'}
                      </span>
                    </div>

                    <Button
                      variant={device.isOn ? 'danger' : 'primary'}
                      size="sm"
                      leftIcon={<Power className="w-3.5 h-3.5" />}
                      onClick={() => handleToggleDevice(device.id)}
                    >
                      {device.isOn ? 'Turn OFF' : 'Turn ON'}
                    </Button>
                  </div>
                </Card>
              )
            })}
          </div>
        </section>

        {/* ---------------- 3. TODAY'S CLASSES & RECENT NOTES ---------------- */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Today's Classes List (Left 2 Columns) */}
          <div className="lg:col-span-2 space-y-4">
            <Card>
              <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <CalendarCheck className="w-4 h-4 text-cyan-400" />
                    <span>Today's Classes</span>
                  </CardTitle>
                  <CardDescription>
                    Scheduled lecture sessions and assigned smart hall automation.
                  </CardDescription>
                </div>
                <Badge variant="info" size="sm">
                  3 Lectures Today
                </Badge>
              </CardHeader>

              <CardContent className="p-0">
                <div className="divide-y divide-slate-800/80">
                  {todayClasses.map((cls) => (
                    <div
                      key={cls.id}
                      className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-900/40 transition-colors"
                    >
                      <div className="flex items-center gap-3.5">
                        <div
                          className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
                            cls.isLive
                              ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'
                              : 'bg-slate-800 border border-slate-700/80 text-slate-300'
                          }`}
                        >
                          <School className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2.5">
                            <h4 className="text-sm font-bold text-white">{cls.title}</h4>
                            <Badge
                              variant={cls.isLive ? 'success' : 'neutral'}
                              dot={cls.isLive}
                              pulse={cls.isLive}
                              size="sm"
                            >
                              {cls.status}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                            <span className="font-mono text-indigo-300 font-semibold">
                              {cls.code}
                            </span>
                            <span>&bull;</span>
                            <span className="flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5 text-slate-500" />
                              {cls.time}
                            </span>
                            <span>&bull;</span>
                            <span className="text-slate-300 font-mono">{cls.room}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs font-mono text-slate-400">
                          {cls.studentsCount} Students
                        </span>
                        <Button
                          variant={cls.isLive ? 'primary' : 'outline'}
                          size="sm"
                          onClick={() => {
                            setActionAlert({
                              type: 'info',
                              message: `Room relays primed for ${cls.title} (${cls.room}).`,
                            })
                          }}
                        >
                          {cls.isLive ? 'Manage Room' : 'Prepare Room'}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Backend Teacher Route Token Test Check */}
            <Card>
              <CardHeader>
                <div>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-cyan-400" />
                    <span>Role Authorization Verification</span>
                  </CardTitle>
                  <CardDescription>
                    Executes <code className="text-cyan-300">GET /api/teacher/test</code> with authenticated JWT.
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
              <CardContent>
                {testResult ? (
                  <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono space-y-2">
                    <div className="flex items-center justify-between">
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                          testResult.ok
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-rose-500/20 text-rose-300'
                        }`}
                      >
                        HTTP {testResult.status} {testResult.ok ? 'OK' : 'DENIED'}
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
                  <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/60 flex items-center justify-between text-xs text-slate-400">
                    <span>Click "Verify Access" to validate token authorization.</span>
                    <Badge variant="neutral" size="sm">Idle</Badge>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Recent Notes Placeholder (Right Column) */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-emerald-400" />
                    <span>Recent Notes</span>
                  </CardTitle>
                  <CardDescription>Handouts & classroom lesson summaries.</CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  leftIcon={<Plus className="w-3.5 h-3.5" />}
                  onClick={() => setActiveModal('notes')}
                >
                  New Note
                </Button>
              </CardHeader>

              <CardContent className="space-y-3">
                {notes.map((note) => (
                  <div
                    key={note.id}
                    className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-2 hover:border-slate-700 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="text-xs font-bold text-white line-clamp-1">{note.title}</h4>
                      <Badge variant="neutral" size="sm">
                        {note.subject}
                      </Badge>
                    </div>

                    <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                      {note.snippets}
                    </p>

                    <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between text-[10px] text-slate-500 font-mono">
                      <span>{note.time}</span>
                      <span className="text-emerald-400 font-medium truncate max-w-[140px]">
                        {note.attachments}
                      </span>
                    </div>
                  </div>
                ))}

                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-xs text-slate-400"
                  onClick={() => setActiveModal('notes')}
                >
                  View All Teaching Documents &rarr;
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* ---------------- 4. INTERACTIVE MODALS FOR QUICK ACTIONS ---------------- */}

        {/* Modal 1: Voice Assistant & Voice Control */}
        <Modal
          isOpen={activeModal === 'voice'}
          onClose={() => setActiveModal(null)}
          title="Classroom Voice Assistant"
          description="Bilingual voice engine for Room 302 IoT relays and presentation triggers."
          size="lg"
          footer={
            <>
              <Button variant="outline" size="sm" onClick={() => setActiveModal(null)}>
                Close
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => handleProcessVoice()}
                isLoading={isVoiceProcessing}
              >
                Send Voice Command
              </Button>
            </>
          }
        >
          <div className="space-y-5">
            {/* Animated Mic Wave Area */}
            <div className="p-6 rounded-2xl bg-gradient-to-b from-purple-500/10 to-slate-950 border border-purple-500/20 text-center space-y-3">
              <div className="w-14 h-14 mx-auto rounded-full bg-purple-600 flex items-center justify-center text-white shadow-xl shadow-purple-600/30 animate-pulse">
                <Mic className="w-7 h-7" />
              </div>
              <div>
                <p className="text-sm font-bold text-white">Voice Command Listener Active</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Listening on ESP32 Room 302 Microphone Relay
                </p>
              </div>
            </div>

            {/* Input & Simulated Phrases */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300 block">
                Type or select voice command:
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={voiceInput}
                  onChange={(e) => setVoiceInput(e.target.value)}
                  placeholder="e.g. Turn on projector or விளக்குகளை இயக்கு"
                  className="flex-1 px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-purple-500"
                />
                <Button
                  variant="primary"
                  size="md"
                  onClick={() => handleProcessVoice()}
                  isLoading={isVoiceProcessing}
                >
                  Execute
                </Button>
              </div>

              {/* Sample Voice Prompts */}
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setVoiceInput('Turn on classroom lights')
                    handleProcessVoice('Turn on classroom lights')
                  }}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono cursor-pointer"
                >
                  "Turn on classroom lights"
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setVoiceInput('Turn off the fan')
                    handleProcessVoice('Turn off the fan')
                  }}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono cursor-pointer"
                >
                  "Turn off the fan"
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setVoiceInput('விளக்குகளை இயக்கு')
                    handleProcessVoice('விளக்குகளை இயக்கு')
                  }}
                  className="px-2.5 py-1 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 text-xs cursor-pointer"
                >
                  "விளக்குகளை இயக்கு (Tamil)"
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setVoiceInput('Turn off all devices')
                    handleProcessVoice('Turn off all devices')
                  }}
                  className="px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs cursor-pointer"
                >
                  "Turn off all devices"
                </button>
              </div>
            </div>

            {/* Voice Result Breakdown */}
            {voiceResult && (
              <div className="p-4 rounded-xl bg-slate-950 border border-purple-500/30 space-y-2 text-xs font-mono">
                <div className="flex justify-between text-purple-300 font-bold border-b border-slate-800 pb-2">
                  <span>Intent: {voiceResult.intent}</span>
                  <span className="text-emerald-400">{voiceResult.confidence}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-slate-400 text-[11px]">
                  <div>Language: <span className="text-white">{voiceResult.language}</span></div>
                  <div>Room: <span className="text-white">{voiceResult.targetRoom}</span></div>
                </div>
                <p className="text-emerald-400 text-[11px] pt-1">
                  ✓ Mock MQTT Relay packet dispatched to ESP32-RM302.
                </p>
              </div>
            )}
          </div>
        </Modal>

        {/* Modal 2: Create Notes */}
        <Modal
          isOpen={activeModal === 'notes'}
          onClose={() => setActiveModal(null)}
          title="Create Classroom Notes"
          description="Prepare lesson summaries and study handouts for your students."
          size="md"
          footer={
            <>
              <Button variant="outline" size="sm" onClick={() => setActiveModal(null)}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={handleSaveNote}>
                Save Notes
              </Button>
            </>
          }
        >
          <form onSubmit={handleSaveNote} className="space-y-4 text-xs">
            <div>
              <label className="text-slate-300 font-semibold block mb-1">Note Title</label>
              <input
                type="text"
                value={newNoteTitle}
                onChange={(e) => setNewNoteTitle(e.target.value)}
                placeholder="e.g. Dynamic Programming & Bellman-Ford"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                required
              />
            </div>

            <div>
              <label className="text-slate-300 font-semibold block mb-1">Course / Room</label>
              <select className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500">
                <option>CS-302 AI & Natural Language (Room 302)</option>
                <option>CS-401 Cloud Infrastructure (Room 101)</option>
                <option>CS-Lab-3 Embedded Systems (Lab 405)</option>
              </select>
            </div>

            <div>
              <label className="text-slate-300 font-semibold block mb-1">Key Summary & Takeaways</label>
              <textarea
                rows={4}
                value={newNoteContent}
                onChange={(e) => setNewNoteContent(e.target.value)}
                placeholder="Enter lecture points, formulas, or homework reading..."
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
          </form>
        </Modal>

        {/* Modal 3: Generate Quiz */}
        <Modal
          isOpen={activeModal === 'quiz'}
          onClose={() => setActiveModal(null)}
          title="Gemini AI Quiz Generator"
          description="Automatically generate multiple-choice questions from lecture concepts."
          size="lg"
          footer={
            <>
              <Button variant="outline" size="sm" onClick={() => setActiveModal(null)}>
                Close
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleGenerateQuiz}
                isLoading={isGenerating}
              >
                Generate Quiz
              </Button>
            </>
          }
        >
          <div className="space-y-4 text-xs">
            <div className="flex gap-2">
              <input
                type="text"
                value={quizTopic}
                onChange={(e) => setQuizTopic(e.target.value)}
                placeholder="Topic: e.g. Microcontroller Interrupts"
                className="flex-1 px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-amber-500"
              />
              <Button
                variant="primary"
                size="md"
                onClick={handleGenerateQuiz}
                isLoading={isGenerating}
              >
                Generate
              </Button>
            </div>

            {quizResult && (
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="font-semibold text-white">Generated 3 Questions</span>
                  <span className="text-[11px] font-mono text-amber-400">Gemini 2.5 Flash</span>
                </div>
                <div className="space-y-2.5">
                  {quizResult.map((item, idx) => (
                    <div key={idx} className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
                      <p className="font-semibold text-white">{item.q}</p>
                      <div className="grid grid-cols-2 gap-1 text-[11px] text-slate-400 pl-2">
                        {item.options.map((opt, oIdx) => (
                          <span key={oIdx}>{opt}</span>
                        ))}
                      </div>
                      <p className="text-[11px] text-emerald-400 font-mono pt-1">
                        Correct: {item.ans}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Modal>

        {/* Modal 4: Generate Image */}
        <Modal
          isOpen={activeModal === 'image'}
          onClose={() => setActiveModal(null)}
          title="Educational AI Diagram Generator"
          description="Create custom illustrative visuals and technical schematics for class presentation."
          size="md"
          footer={
            <>
              <Button variant="outline" size="sm" onClick={() => setActiveModal(null)}>
                Close
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setIsGenerating(true)
                  setTimeout(() => setIsGenerating(false), 900)
                }}
                isLoading={isGenerating}
              >
                Generate Graphic
              </Button>
            </>
          }
        >
          <div className="space-y-4 text-xs">
            <div>
              <label className="text-slate-300 font-semibold block mb-1">Visual Prompt</label>
              <input
                type="text"
                value={imagePrompt}
                onChange={(e) => setImagePrompt(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-pink-500"
              />
            </div>

            {/* Generated Visual Card Simulator */}
            <div className="p-6 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col items-center justify-center text-center space-y-2">
              <div className="w-16 h-16 rounded-2xl bg-pink-500/10 border border-pink-500/20 text-pink-400 flex items-center justify-center">
                <ImageIcon className="w-8 h-8" />
              </div>
              <p className="text-sm font-semibold text-white">Smart Classroom Architecture</p>
              <p className="text-[11px] text-slate-400 max-w-xs">
                Generated schematic diagram ready to cast to Room 302 projector.
              </p>
              <Button variant="outline" size="sm" className="mt-2">
                Cast to Projector
              </Button>
            </div>
          </div>
        </Modal>

        {/* Modal 5: Generate PPT */}
        <Modal
          isOpen={activeModal === 'ppt'}
          onClose={() => setActiveModal(null)}
          title="Smart Lecture Slide Deck Generator"
          description="Compose structured presentation slides directly from lecture syllabi."
          size="lg"
          footer={
            <>
              <Button variant="outline" size="sm" onClick={() => setActiveModal(null)}>
                Close
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleGeneratePPT}
                isLoading={isGenerating}
              >
                Generate Outline
              </Button>
            </>
          }
        >
          <div className="space-y-4 text-xs">
            <div className="flex gap-2">
              <input
                type="text"
                value={pptTopic}
                onChange={(e) => setPptTopic(e.target.value)}
                placeholder="Topic: e.g. Distributed OS"
                className="flex-1 px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-blue-500"
              />
              <Button
                variant="primary"
                size="md"
                onClick={handleGeneratePPT}
                isLoading={isGenerating}
              >
                Generate
              </Button>
            </div>

            {pptResult && (
              <div className="space-y-2.5 pt-2">
                <span className="font-semibold text-white">Slide Deck Outline (4 Slides):</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {pptResult.map((s) => (
                    <div key={s.slide} className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
                      <span className="text-[10px] font-mono text-blue-400 uppercase font-semibold">
                        Slide {s.slide}
                      </span>
                      <h5 className="font-bold text-white text-xs">{s.title}</h5>
                      <ul className="list-disc list-inside text-[11px] text-slate-400 space-y-0.5">
                        {s.bullets.map((b, bIdx) => (
                          <li key={bIdx}>{b}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Modal>
      </PageContainer>
    </DashboardLayout>
  )
}
