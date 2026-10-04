import { useState, useEffect, useCallback, useRef } from 'react'
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
  Palette,
  FileText,
  HelpCircle,
  Image as ImageIcon,
  Presentation,
  Power,
  Plus,
  Server,
  Database,
  Cpu,
  Wifi,
  AlertTriangle,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useSocket, useSocketEvent } from '../context/SocketContext'
import { testProtectedRoute } from '../services/auth.service'
import { DashboardLayout } from '../components/layout'
import {
  Button,
  Badge,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Modal,
  AlertBanner,
  SiriCard,
  BentoContainer,
  CircularColorPicker,
} from '../components/ui'
import { VoiceAssistant } from '../components/voice'
import { API_BASE_URL } from '../config/api'

export function TeacherPage() {
  const { user, token } = useAuth()
  const { socket, isConnected, joinClassroom, leaveClassroom } = useSocket()

  const apiBaseUrl = API_BASE_URL

  // API Verification State
  const [testResult, setTestResult] = useState(null)
  const [isTesting, setIsTesting] = useState(false)

  // Feedback Notification Banner
  const [actionAlert, setActionAlert] = useState(null)

  // System Infrastructure Health (Backend, MongoDB, MQTT, Gemini, ESP32)
  const [systemHealth, setSystemHealth] = useState(null)
  const [healthLoading, setHealthLoading] = useState(false)
  const [lastHealthCheck, setLastHealthCheck] = useState(null)

  // Live Recent Activity Audit Feed (Voice & Hardware Commands)
  const [recentActivities, setRecentActivities] = useState([])
  const [activitiesLoading, setActivitiesLoading] = useState(false)

  // 1. Classroom Devices (Light, Fan, Projector) - Sourced dynamically from MongoDB
  const [devices, setDevices] = useState([])
  const [devicesLoading, setDevicesLoading] = useState(true)
  const [devicesError, setDevicesError] = useState(null)

  // Fetch live devices from MongoDB backend
  const loadBackendDevices = useCallback(async () => {
    if (!token) return
    setDevicesLoading(true)
    setDevicesError(null)

    try {
      const res = await fetch(`${apiBaseUrl}/api/devices?classroom=Room 302&category=CHANNEL`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      })
      if (res.ok) {
        const data = await res.json()
        const sourceChannels = (data.channels && data.channels.length > 0)
          ? data.channels
          : (data.devices || []).filter((d) => d.entityType === 'CHANNEL' || (d.type !== 'OTHER' && ['LIGHT', 'FAN', 'PROJECTOR'].includes(d.type)))

        if (sourceChannels.length > 0) {
          const iconMap = {
            LIGHT: Lightbulb,
            FAN: Fan,
            PROJECTOR: Projector,
          }
          const mappedDevices = sourceChannels.map((d) => ({
            id: d._id || d.id,
            deviceId: d.deviceId,
            name: d.name,
            type: d.type,
            icon: iconMap[d.type] || Lightbulb,
            room: d.classroom || 'Room 302',
            isOn: d.state === 'ON',
            isOnline: typeof d.isOnline === 'boolean' ? d.isOnline : false,
            requestedState: d.requestedState || null,
            confirmedState: d.confirmedState || null,
            color: d.color || { r: 255, g: 255, b: 255 },
            colorPower: d.colorPower || (d.state === 'ON' ? 'ON' : 'OFF'),
            details: d.description || `GPIO ${d.gpioPin ?? 'N/A'} (ESP32)`,
            relayChannel: `GPIO ${d.gpioPin ?? 'N/A'} (ESP32)`,
            nodeId: d.nodeId || 'ESP32-RM302-01',
          }))
          setDevices(mappedDevices)
        } else {
          setDevices([])
        }
      } else {
        setDevicesError(`Failed to load devices (HTTP ${res.status}).`)
      }
    } catch (err) {
      console.warn('Initial device fetch error:', err.message)
      setDevicesError('Unable to connect to backend device service.')
    } finally {
      setDevicesLoading(false)
    }
  }, [token, apiBaseUrl])

  useEffect(() => {
    loadBackendDevices()
  }, [loadBackendDevices])

  // Subscribe to Room 302 real-time classroom telemetry
  useEffect(() => {
    joinClassroom('Room 302')
    return () => {
      leaveClassroom('Room 302')
    }
  }, [joinClassroom, leaveClassroom])

  // Real-Time Socket.IO Listener: Listen for "device:status" safely without duplicate listeners
  useSocketEvent('device:status', (incoming) => {
    console.log('[Socket.IO UI] ⚡ Received live device:status event:', incoming)

    // Ignore controller node heartbeats in the appliance relay switch view
    if (incoming.type === 'OTHER' || incoming.entityType === 'NODE') {
      return
    }

    setDevices((prev) =>
      prev.map((dev) => {
        const isMatch =
          dev.deviceId === incoming.deviceId ||
          dev.id === incoming.id ||
          dev.id === incoming.deviceId ||
          (dev.type && incoming.type && dev.type.toUpperCase() === incoming.type.toUpperCase())

        if (isMatch) {
          const nextIsOn = incoming.state === 'ON'
          return {
            ...dev,
            isOn: nextIsOn,
            isOnline: typeof incoming.isOnline === 'boolean' ? incoming.isOnline : dev.isOnline,
            color: dev.type === 'PROJECTOR'
              ? (nextIsOn ? (incoming.color || { r: 255, g: 255, b: 255 }) : { r: 0, g: 0, b: 0 })
              : dev.color,
            colorPower: dev.type === 'PROJECTOR'
              ? (nextIsOn ? 'ON' : 'OFF')
              : dev.colorPower,
          }
        }
        return dev
      })
    )

    setActionAlert({
      type: 'info',
      message: `Real-time update: ${incoming.name || incoming.deviceId} is now ${incoming.state} (${
        incoming.isOnline ? 'Online' : 'Offline'
      }).`,
    })
  })

  // Real-Time Socket.IO Listener: Dedicated projector RGB color broadcast
  useSocketEvent('device:color', (incoming) => {
    if (!incoming || !incoming.color) return
    setDevices((prev) =>
      prev.map((dev) => {
        if (dev.type === 'PROJECTOR') {
          return {
            ...dev,
            color: incoming.color || dev.color,
            colorPower: incoming.power || incoming.colorPower || dev.colorPower,
          }
        }
        return dev
      })
    )
  })

  // Classroom-scoped status listener
  useSocketEvent('classroom:device:status', (incoming) => {
    console.log('[Socket.IO UI] 🏫 Received classroom-scoped device telemetry:', incoming.deviceId, incoming.state)
  })

  // Fetch system status (Backend, MongoDB, MQTT, Gemini, ESP32)
  const fetchSystemStatus = useCallback(async () => {
    setHealthLoading(true)
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 6000)

    try {
      const res = await fetch(`${apiBaseUrl}/api/system/status`, {
        signal: controller.signal,
      })
      clearTimeout(timeoutId)
      if (res.ok) {
        const data = await res.json()
        if (data.services) {
          setSystemHealth(data.services)
          setLastHealthCheck(new Date())
        }
      } else {
        setSystemHealth({
          backend: { name: 'Backend API', status: 'degraded', details: `HTTP ${res.status}` },
          mongodb: { name: 'MongoDB', status: 'offline', details: 'Status unreachable' },
          mqtt: { name: 'MQTT Broker', status: 'offline', details: 'Status unreachable' },
          gemini: { name: 'Gemini AI', status: 'offline', details: 'Status unreachable' },
          esp32: { name: 'ESP32 Hardware', status: 'offline', details: 'Status unreachable' },
        })
      }
    } catch (err) {
      clearTimeout(timeoutId)
      console.warn('[SystemStatus] Backend unreachable:', err.message)
      setSystemHealth({
        backend: { name: 'Backend API', status: 'offline', details: 'Unreachable / Server Down' },
        mongodb: { name: 'MongoDB', status: 'offline', details: 'Backend Down' },
        mqtt: { name: 'MQTT Broker', status: 'offline', details: 'Backend Down' },
        gemini: { name: 'Gemini AI', status: 'offline', details: 'Backend Down' },
        esp32: { name: 'ESP32 Hardware', status: 'offline', details: 'Backend Down' },
      })
    } finally {
      setHealthLoading(false)
    }
  }, [apiBaseUrl])

  useEffect(() => {
    fetchSystemStatus()
    const interval = setInterval(fetchSystemStatus, 20000)
    return () => clearInterval(interval)
  }, [fetchSystemStatus])

  // Fetch recent voice and device activity from backend
  const fetchRecentActivity = useCallback(async () => {
    if (!token) return
    setActivitiesLoading(true)
    try {
      const res = await fetch(`${apiBaseUrl}/api/voice/history?limit=5`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      })
      if (res.ok) {
        const data = await res.json()
        if (data.status === 'success') {
          const historyItems = data.data || data.commands || []
          setRecentActivities(historyItems)
        }
      }
    } catch (err) {
      console.warn('Recent activity fetch note:', err.message)
    } finally {
      setActivitiesLoading(false)
    }
  }, [apiBaseUrl, token])

  useEffect(() => {
    fetchRecentActivity()
  }, [fetchRecentActivity])

  // Dispatch device control command via Backend POST /api/devices/:id/command
  const handleToggleDevice = async (device) => {
    const nextState = !device.isOn
    const targetAction = nextState ? 'ON' : 'OFF'

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 8000)

    try {
      const identifier = device.deviceId || device.id
      const res = await fetch(`${apiBaseUrl}/api/devices/${identifier}/command`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: targetAction }),
        signal: controller.signal,
      })
      clearTimeout(timeoutId)

      const data = await res.json()
      if (res.ok && data.status === 'success') {
        // Device commanded successfully; update state and display execution message
        setDevices((prev) =>
          prev.map((dev) =>
            dev.id === device.id || dev.deviceId === device.deviceId
              ? {
                  ...dev,
                  isOn: nextState,
                  color: dev.type === 'PROJECTOR'
                    ? (nextState ? { r: 255, g: 255, b: 255 } : { r: 0, g: 0, b: 0 })
                    : dev.color,
                  colorPower: dev.type === 'PROJECTOR' ? (nextState ? 'ON' : 'OFF') : dev.colorPower,
                }
              : dev
          )
        )
        setActionAlert({
          type: 'success',
          message: data.message || `${device.name} ${targetAction} command sent.`,
        })
        fetchRecentActivity()
      } else {
        // Hardware or broker offline - do not fake successful hardware status
        setActionAlert({
          type: 'danger',
          message: data?.message || 'Command could not be delivered. Hardware or broker may be offline.',
        })
      }
    } catch (err) {
      clearTimeout(timeoutId)
      console.error('Command dispatch error:', err)
      const msg =
        err.name === 'AbortError'
          ? 'Command timed out after 8s. Backend or IoT broker did not respond.'
          : 'Backend server is unavailable. Could not send device command.'
      setActionAlert({
        type: 'danger',
        message: msg,
      })
    }
  }

  // Simulate incoming status update (Flow: Simulation -> DB update -> Socket.IO -> UI)
  const handleSimulateStatus = async (device) => {
    const nextState = device.isOn ? 'OFF' : 'ON'
    try {
      const identifier = device.deviceId || device.id
      const res = await fetch(`${apiBaseUrl}/api/devices/${identifier}/simulate-status`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          state: nextState,
          isOnline: device.isOnline,
        }),
      })
      if (res.ok) {
        setActionAlert({
          type: 'info',
          message: `Simulated MQTT status dispatched for ${device.name}. Processing real-time update...`,
        })
      }
    } catch (err) {
      console.warn('Status simulation notice:', err.message)
    }
  }

  // Toggle online/offline state simulation
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

  // Helper to convert RGB to HEX string
  const toHexStr = (n) => {
    const hex = Math.max(0, Math.min(255, Math.round(Number(n) || 0))).toString(16)
    return hex.length === 1 ? '0' + hex : hex
  }
  const rgbToHexStr = (r, g, b) => `#${toHexStr(r)}${toHexStr(g)}${toHexStr(b)}`.toUpperCase()

  // High-performance Live Projector RGB streaming
  const teacherInFlightColorRef = useRef(false)
  const teacherQueuedColorRef = useRef(null)
  const teacherLastTimeRef = useRef(0)
  const teacherThrottleTimerRef = useRef(null)

  const sendTeacherLiveColor = useCallback(
    async (device, targetColor, isImmediate = false) => {
      const devId = device.deviceId || device.id
      if (!devId) return

      if (teacherInFlightColorRef.current) {
        teacherQueuedColorRef.current = { device, color: targetColor }
        return
      }

      const now = Date.now()
      const THROTTLE_MS = 60
      const timeSince = now - teacherLastTimeRef.current

      if (!isImmediate && timeSince < THROTTLE_MS) {
        teacherQueuedColorRef.current = { device, color: targetColor }
        if (!teacherThrottleTimerRef.current) {
          teacherThrottleTimerRef.current = setTimeout(() => {
            teacherThrottleTimerRef.current = null
            if (teacherQueuedColorRef.current) {
              const next = teacherQueuedColorRef.current
              teacherQueuedColorRef.current = null
              sendTeacherLiveColor(next.device, next.color, true)
            }
          }, THROTTLE_MS - timeSince)
        }
        return
      }

      teacherInFlightColorRef.current = true
      teacherLastTimeRef.current = now

      try {
        await fetch(`${apiBaseUrl}/api/devices/${encodeURIComponent(devId)}/color`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({ power: 'ON', color: targetColor }),
        })
      } catch (err) {
        console.warn('[TeacherPage] Live color error:', err.message)
      } finally {
        teacherInFlightColorRef.current = false
        if (teacherQueuedColorRef.current) {
          const next = teacherQueuedColorRef.current
          teacherQueuedColorRef.current = null
          sendTeacherLiveColor(next.device, next.color, true)
        }
      }
    },
    [apiBaseUrl, token]
  )

  const handleTeacherColorWheel = (device, newRgb, meta) => {
    setDevices((prev) =>
      prev.map((d) => (d.id === device.id || d.deviceId === device.deviceId ? { ...d, color: newRgb } : d))
    )
    sendTeacherLiveColor(device, newRgb, meta?.isFinal === true)
  }

  const handleProjectorColorChange = (device, hexColor) => {
    const hex = hexColor.replace('#', '')
    const r = parseInt(hex.substring(0, 2), 16) || 0
    const g = parseInt(hex.substring(2, 4), 16) || 0
    const b = parseInt(hex.substring(4, 6), 16) || 0
    const targetColor = { r, g, b }

    setDevices((prev) =>
      prev.map((d) => (d.id === device.id || d.deviceId === device.deviceId ? { ...d, color: targetColor } : d))
    )
    sendTeacherLiveColor(device, targetColor, true)
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

  const [activeTab, setActiveTab] = useState('overview')

  const handleTabChange = (tabId) => {
    setActiveTab(tabId)
    if (tabId === 'voice') {
      setActiveModal('voice')
    } else if (tabId === 'devices' || tabId === 'relays') {
      document.getElementById('device-controls-section')?.scrollIntoView({ behavior: 'smooth' })
    } else if (tabId === 'classes' || tabId === 'schedule') {
      document.getElementById('classes-section')?.scrollIntoView({ behavior: 'smooth' })
    } else if (tabId === 'overview') {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  return (
    <DashboardLayout
      pageTitle="Faculty Workspace"
      activeTab={activeTab}
      onTabChange={handleTabChange}
      onTriggerVoice={() => setActiveModal('voice')}
    >
      <div className="w-full space-y-5">
        {/* Dynamic Action Alert Notification */}
        {actionAlert && (
          <AlertBanner
            variant="info"
            title="Classroom Action Dispatched"
            message={actionAlert.message}
            onDismiss={() => setActionAlert(null)}
          />
        )}

        {/* Apple Intelligence / Siri iOS 27 Master Bento Container (Contiguous, Gap-Free) */}
        <SiriCard className="overflow-hidden">
          {/* 1. Siri Header with Faculty Details & Quick Actions */}
          <div className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white/70">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-purple-500 via-indigo-500 to-pink-500 flex items-center justify-center text-white shadow-md shadow-purple-500/25 shrink-0">
                <Sparkles className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                    Welcome back, {user?.name || 'Prof. Faculty'}
                  </h2>
                  <Badge variant="purple" dot pulse size="sm">
                    iOS 27 Vision
                  </Badge>
                  <span className="hidden sm:inline-flex text-[11px] font-medium text-slate-500">
                    &bull; {user?.department || 'Computer Science & Engineering'}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Smart lecture hall Lab 302 &bull; Automated IoT relays, bilingual voice commands & instructional tools.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
              <Button
                variant="outline"
                size="sm"
                leftIcon={<Terminal className="w-3.5 h-3.5" />}
                onClick={handleTestTeacherRoute}
                isLoading={isTesting}
                className="rounded-xl h-8 px-3 text-xs"
              >
                Verify Token
              </Button>
              <Button
                variant="primary"
                size="sm"
                leftIcon={<Mic className="w-3.5 h-3.5 text-purple-200 animate-pulse" />}
                onClick={() => setActiveModal('voice')}
                className="bg-gradient-to-r from-purple-600 via-indigo-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 shadow-md shadow-purple-500/20 text-white font-semibold rounded-xl h-8 px-3 text-xs"
              >
                Voice Assistant
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setActiveModal('notes')}
                className="rounded-xl h-8 px-3 text-xs"
              >
                Summarize Class
              </Button>
            </div>
          </div>

          {/* 2. Siri Shortcuts & Quick Actions Strip (Contiguous, Hairline Divider, Zero Gaps!) */}
          <div className="border-t border-slate-100/90 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 divide-y sm:divide-y-0 sm:divide-x divide-slate-100/90 bg-white/50">
            {/* Action 1: Control Devices */}
            <button
              type="button"
              onClick={() => {
                const el = document.getElementById('device-controls-section')
                el?.scrollIntoView({ behavior: 'smooth' })
              }}
              className="p-4 flex flex-col justify-between hover:bg-slate-50/70 transition-colors group cursor-pointer text-left focus:outline-none"
            >
              <div className="w-9 h-9 rounded-2xl bg-cyan-50 border border-cyan-100 flex items-center justify-center text-cyan-600 group-hover:scale-110 transition-transform shadow-2xs">
                <Power className="w-4 h-4" />
              </div>
              <div className="mt-3">
                <div className="text-xs font-bold text-slate-900 group-hover:text-cyan-700 transition-colors">
                  Control Devices
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5 font-medium">Lights, Fan, Projector</div>
              </div>
            </button>

            {/* Action 2: Voice Control */}
            <button
              type="button"
              onClick={() => setActiveModal('voice')}
              className="p-4 flex flex-col justify-between hover:bg-slate-50/70 transition-colors group cursor-pointer text-left focus:outline-none"
            >
              <div className="w-9 h-9 rounded-2xl bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-600 group-hover:scale-110 transition-transform shadow-2xs">
                <Mic className="w-4 h-4" />
              </div>
              <div className="mt-3">
                <div className="text-xs font-bold text-slate-900 group-hover:text-purple-700 transition-colors">
                  Voice Control
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5 font-medium">English & Tamil Audio</div>
              </div>
            </button>

            {/* Action 3: Create Notes */}
            <button
              type="button"
              onClick={() => setActiveModal('notes')}
              className="p-4 flex flex-col justify-between hover:bg-slate-50/70 transition-colors group cursor-pointer text-left focus:outline-none"
            >
              <div className="w-9 h-9 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 group-hover:scale-110 transition-transform shadow-2xs">
                <FileText className="w-4 h-4" />
              </div>
              <div className="mt-3">
                <div className="text-xs font-bold text-slate-900 group-hover:text-emerald-700 transition-colors">
                  Create Notes
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5 font-medium">Classroom Summary</div>
              </div>
            </button>

            {/* Action 4: Generate Quiz */}
            <button
              type="button"
              onClick={() => setActiveModal('quiz')}
              className="p-4 flex flex-col justify-between hover:bg-slate-50/70 transition-colors group cursor-pointer text-left focus:outline-none"
            >
              <div className="w-9 h-9 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 group-hover:scale-110 transition-transform shadow-2xs">
                <HelpCircle className="w-4 h-4" />
              </div>
              <div className="mt-3">
                <div className="text-xs font-bold text-slate-900 group-hover:text-amber-700 transition-colors">
                  Generate Quiz
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5 font-medium">Gemini AI Test Bank</div>
              </div>
            </button>

            {/* Action 5: Generate Image */}
            <button
              type="button"
              onClick={() => setActiveModal('image')}
              className="p-4 flex flex-col justify-between hover:bg-slate-50/70 transition-colors group cursor-pointer text-left focus:outline-none"
            >
              <div className="w-9 h-9 rounded-2xl bg-pink-50 border border-pink-100 flex items-center justify-center text-pink-600 group-hover:scale-110 transition-transform shadow-2xs">
                <ImageIcon className="w-4 h-4" />
              </div>
              <div className="mt-3">
                <div className="text-xs font-bold text-slate-900 group-hover:text-pink-700 transition-colors">
                  Generate Image
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5 font-medium">Educational Diagrams</div>
              </div>
            </button>

            {/* Action 6: Generate PPT */}
            <button
              type="button"
              onClick={() => setActiveModal('ppt')}
              className="p-4 flex flex-col justify-between hover:bg-slate-50/70 transition-colors group cursor-pointer text-left focus:outline-none"
            >
              <div className="w-9 h-9 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 group-hover:scale-110 transition-transform shadow-2xs">
                <Presentation className="w-4 h-4" />
              </div>
              <div className="mt-3">
                <div className="text-xs font-bold text-slate-900 group-hover:text-blue-700 transition-colors">
                  Generate PPT
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5 font-medium">Lecture Slide Outlines</div>
              </div>
            </button>
          </div>

          {/* 3. System Infrastructure Health (Contiguous, Hairline Divider, Zero Gaps!) */}
          <div className="border-t border-slate-100/90 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-slate-100/90 bg-slate-50/40 text-xs">
            {/* 1. Backend */}
            <div className="p-3.5 sm:p-4 flex items-center justify-between gap-2 hover:bg-white/60 transition-colors">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                  <Server className="w-3.5 h-3.5" />
                </div>
                <div>
                  <span className="font-bold text-slate-800 block text-[11px]">Backend API</span>
                  <span className="text-[10px] text-slate-400 font-mono truncate max-w-[90px] block">
                    {systemHealth?.backend?.uptimeFormatted ? `Up ${systemHealth.backend.uptimeFormatted}` : 'Port 5000'}
                  </span>
                </div>
              </div>
              <Badge variant={systemHealth?.backend?.status === 'online' ? 'success' : 'danger'} dot size="sm">
                {systemHealth?.backend?.status === 'online' ? 'Online' : 'Offline'}
              </Badge>
            </div>

            {/* 2. MongoDB */}
            <div className="p-3.5 sm:p-4 flex items-center justify-between gap-2 hover:bg-white/60 transition-colors">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                  <Database className="w-3.5 h-3.5" />
                </div>
                <div>
                  <span className="font-bold text-slate-800 block text-[11px]">MongoDB</span>
                  <span className="text-[10px] text-slate-400 font-mono">Atlas Live</span>
                </div>
              </div>
              <Badge variant={systemHealth?.mongodb?.connected ? 'success' : 'danger'} dot size="sm">
                {systemHealth?.mongodb?.connected ? 'Live' : 'Offline'}
              </Badge>
            </div>

            {/* 3. MQTT */}
            <div className="p-3.5 sm:p-4 flex items-center justify-between gap-2 hover:bg-white/60 transition-colors">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-xl bg-cyan-50 border border-cyan-100 text-cyan-600 flex items-center justify-center shrink-0">
                  <Wifi className="w-3.5 h-3.5" />
                </div>
                <div>
                  <span className="font-bold text-slate-800 block text-[11px]">MQTT Broker</span>
                  <span className="text-[10px] text-slate-400 font-mono">1883</span>
                </div>
              </div>
              <Badge variant={systemHealth?.mqtt?.connected ? 'success' : 'danger'} dot size="sm">
                {systemHealth?.mqtt?.connected ? 'Live' : 'Offline'}
              </Badge>
            </div>

            {/* 4. Gemini */}
            <div className="p-3.5 sm:p-4 flex items-center justify-between gap-2 hover:bg-white/60 transition-colors">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-xl bg-purple-50 border border-purple-100 text-purple-600 flex items-center justify-center shrink-0">
                  <Sparkles className="w-3.5 h-3.5" />
                </div>
                <div>
                  <span className="font-bold text-slate-800 block text-[11px]">Gemini AI</span>
                  <span className="text-[10px] text-slate-400 font-mono">2.5-flash</span>
                </div>
              </div>
              <Badge variant={systemHealth?.gemini?.status === 'online' ? 'purple' : 'warning'} dot size="sm">
                {systemHealth?.gemini?.status === 'online' ? 'Online' : 'Degraded'}
              </Badge>
            </div>

            {/* 5. ESP32 */}
            <div className="p-3.5 sm:p-4 flex items-center justify-between gap-2 hover:bg-white/60 transition-colors">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-xl bg-amber-50 border border-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                  <Cpu className="w-3.5 h-3.5" />
                </div>
                <div>
                  <span className="font-bold text-slate-800 block text-[11px]">ESP32 Relays</span>
                  <span className="text-[10px] text-slate-400 font-mono">RM-302</span>
                </div>
              </div>
              <Badge variant={systemHealth?.esp32?.connected ? 'success' : 'danger'} dot size="sm">
                {systemHealth?.esp32?.connected ? 'Active' : 'Offline'}
              </Badge>
            </div>
          </div>
        </SiriCard>

        {/* ---------------- 3. CLASSROOM DEVICE STATUS (Light, Fan, Projector) ---------------- */}
        <section id="device-controls-section" className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2.5">
                <h3 className="text-base font-bold text-slate-900 tracking-tight">
                  Classroom Device Status & Relays
                </h3>
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-indigo-50 border border-indigo-200/70 text-indigo-700">
                  Room 302
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                MongoDB source of truth &bull; Real-time telemetry via EMQX Cloud &amp; Socket.IO
              </p>
            </div>

            {/* Master Batch & Socket Status */}
            <div className="flex items-center gap-2 flex-wrap">
              <Badge
                variant={isConnected ? 'success' : 'warning'}
                dot
                pulse={isConnected}
                size="sm"
                title={`Socket.IO Real-Time Engine (${transport})`}
              >
                {isConnected ? 'Socket.IO Live' : 'Connecting...'}
              </Badge>

              <Button
                variant="outline"
                size="sm"
                onClick={() => handleAllDevices(true)}
                disabled={devicesLoading || devices.length === 0}
              >
                All ON
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleAllDevices(false)}
                disabled={devicesLoading || devices.length === 0}
              >
                All OFF
              </Button>
            </div>
          </div>

          {/* 3 Core Device Cards: Light, Fan, Projector (Gap-Free Bento Container) */}
          <BentoContainer className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-100/90">
            {devicesLoading ? (
              [1, 2, 3].map((n) => (
                <div key={n} className="p-6 space-y-4 animate-pulse">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-slate-200/80"></div>
                    <div className="space-y-1.5 flex-1">
                      <div className="h-4 bg-slate-200 rounded w-2/3"></div>
                      <div className="h-3 bg-slate-100 rounded w-1/3"></div>
                    </div>
                  </div>
                  <div className="h-16 bg-slate-100/70 rounded-2xl"></div>
                  <div className="h-10 bg-slate-200/60 rounded-xl"></div>
                </div>
              ))
            ) : devicesError ? (
              <div className="col-span-1 md:col-span-3 p-8 text-center space-y-3">
                <div className="w-10 h-10 mx-auto rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <p className="text-xs text-rose-700 font-medium">{devicesError}</p>
                <Button variant="outline" size="sm" onClick={loadBackendDevices}>
                  Retry Loading Devices
                </Button>
              </div>
            ) : devices.length === 0 ? (
              <div className="col-span-1 md:col-span-3 p-8 text-center space-y-2">
                <p className="text-xs text-slate-500 font-medium">No devices registered for Room 302 in MongoDB database.</p>
                <Button variant="outline" size="sm" onClick={loadBackendDevices}>
                  Refresh Devices
                </Button>
              </div>
            ) : (
              devices.map((device) => {
              const IconComponent = device.icon
              return (
                <div
                  key={device.id}
                  className={`p-6 space-y-4 transition-all hover:bg-slate-50/40 ${
                    device.isOn ? 'bg-blue-50/20' : ''
                  }`}
                >
                  {/* Top Bar: Icon, Name, and Status Badges */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-colors ${
                          device.isOn
                            ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                            : 'bg-slate-100 text-slate-500 border border-slate-200/80'
                        }`}
                      >
                        <IconComponent className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-900 tracking-tight">
                          {device.name}
                        </h4>
                        <span className="text-[11px] text-slate-400 font-medium block">
                          {device.type}
                        </span>
                      </div>
                    </div>

                    {/* Actual Hardware Online / Offline State Badge */}
                    <Badge
                      variant={device.isOnline ? 'success' : 'danger'}
                      dot={device.isOnline}
                      pulse={device.isOnline && device.isOn}
                      size="sm"
                    >
                      {device.isOnline ? 'Online' : 'Offline'}
                    </Badge>
                  </div>

                  {/* Device Telemetry Specs */}
                  <div className="p-3.5 rounded-2xl bg-white/90 border border-slate-200/70 space-y-1.5 text-xs shadow-xs">
                    <div className="flex justify-between items-center text-slate-500">
                      <span>Operating State:</span>
                      <span
                        className={`font-semibold ${
                          device.isOn ? 'text-emerald-600' : 'text-slate-400'
                        }`}
                      >
                        {device.isOn ? '● ACTIVE (ON)' : '○ STANDBY (OFF)'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-slate-500">
                      <span>Parameters:</span>
                      <span className="text-slate-800 font-medium truncate max-w-[150px]">
                        {device.details}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-slate-500">
                      <span>Relay Channel:</span>
                      <span className="text-blue-600 font-mono text-[10px] font-semibold">
                        {device.relayChannel}
                      </span>
                    </div>
                  </div>

                  {/* Control Button (ON/OFF Toggle) & Real-time Simulation */}
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          device.isOn ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'
                        }`}
                      ></span>
                      <span className="text-[11px] text-slate-500 font-medium">
                        Power: {device.isOn ? 'ON' : 'OFF'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-[11px] h-8 px-2 text-slate-500 hover:text-blue-600"
                        title="Simulate incoming MQTT status message from ESP32"
                        onClick={() => handleSimulateStatus(device)}
                      >
                        Simulate
                      </Button>
                      <Button
                        variant={device.isOn ? 'danger' : 'primary'}
                        size="sm"
                        leftIcon={<Power className="w-3.5 h-3.5" />}
                        onClick={() => handleToggleDevice(device)}
                        className="rounded-xl"
                      >
                        {device.isOn ? 'Turn OFF' : 'Turn ON'}
                      </Button>
                    </div>
                  </div>

                  {/* Projector RGB Light Color Control */}
                  {device.type === 'PROJECTOR' && (
                    <div className="pt-3 border-t border-slate-100 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <Palette className="w-3.5 h-3.5 text-purple-600" />
                          <span className="text-xs font-bold text-slate-800">Projector RGB Light</span>
                        </div>
                        <Badge variant={device.isOn ? 'purple' : 'neutral'} size="xs">
                          {device.isOn ? 'RGB Active' : 'RGB OFF'}
                        </Badge>
                      </div>

                      {/* Live Circular Color Wheel */}
                      <div className="flex flex-col items-center justify-center p-3 rounded-2xl bg-white border border-slate-200/80 shadow-xs">
                        <CircularColorPicker
                          color={device.isOn ? (device.color || { r: 255, g: 255, b: 255 }) : { r: 255, g: 255, b: 255 }}
                          power={device.isOn ? 'ON' : 'OFF'}
                          onChange={(rgb, meta) => handleTeacherColorWheel(device, rgb, meta)}
                          onDragEnd={(finalRgb) => sendTeacherLiveColor(device, finalRgb, true)}
                          onDisabledClick={() => {
                            if (!device.isOn) handleToggleDevice(device)
                          }}
                          disabled={!device.isOnline}
                          size={150}
                        />
                        <span className="text-[10px] text-slate-400 mt-1.5 font-medium text-center">
                          {device.isOn
                            ? 'Drag or click along wheel to control RGB live'
                            : 'Projector is OFF. Click wheel or Turn ON to light RGB.'}
                        </span>
                      </div>

                      {/* Live Preview & Color Input */}
                      <div className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-slate-50/80 border border-slate-200/70">
                        <div className="flex items-center gap-2.5">
                          <div
                            className="w-7 h-7 rounded-xl border-2 border-white shadow-xs shrink-0 transition-all"
                            style={{
                              backgroundColor: device.isOn
                                ? `rgb(${device.color?.r ?? 255}, ${device.color?.g ?? 255}, ${device.color?.b ?? 255})`
                                : '#334155',
                              boxShadow: device.isOn
                                ? `0 0 12px rgba(${device.color?.r ?? 255}, ${device.color?.g ?? 255}, ${device.color?.b ?? 255}, 0.5)`
                                : 'none',
                            }}
                          />
                          <div className="text-[11px] font-mono leading-tight">
                            <span className="text-slate-400 text-[10px] block">RGB:</span>
                            <span className="font-bold text-slate-800">
                              {device.isOn
                                ? `R ${device.color?.r ?? 255}  G ${device.color?.g ?? 255}  B ${device.color?.b ?? 255}`
                                : 'R 0  G 0  B 0'}
                            </span>
                          </div>
                        </div>

                        {/* Native Color Picker */}
                        <div className="flex items-center gap-1.5">
                          <input
                            type="color"
                            value={
                              device.isOn
                                ? rgbToHexStr(device.color?.r ?? 255, device.color?.g ?? 255, device.color?.b ?? 255)
                                : '#FFFFFF'
                            }
                            disabled={!device.isOn || !device.isOnline}
                            onChange={(e) => handleProjectorColorChange(device, e.target.value)}
                            className="w-7 h-7 rounded-lg cursor-pointer border border-slate-200 disabled:opacity-30 disabled:cursor-not-allowed p-0.5 bg-white shadow-xs"
                            title={!device.isOn ? 'Projector is OFF' : 'Click to choose color'}
                          />
                        </div>
                      </div>

                      {/* Quick Preset Colors: White, Red, Green, Blue, Purple */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {[
                          { name: 'White', hex: '#FFFFFF' },
                          { name: 'Red', hex: '#EF4444' },
                          { name: 'Green', hex: '#10B981' },
                          { name: 'Blue', hex: '#3B82F6' },
                          { name: 'Purple', hex: '#A855F7' },
                        ].map((preset) => (
                          <button
                            key={preset.name}
                            type="button"
                            disabled={!device.isOn || !device.isOnline}
                            onClick={() => handleProjectorColorChange(device, preset.hex)}
                            className="w-5 h-5 rounded-full border border-slate-300 shadow-xs hover:scale-110 active:scale-95 transition-all cursor-pointer disabled:opacity-25 disabled:cursor-not-allowed"
                            style={{ backgroundColor: preset.hex }}
                            title={`${preset.name} (${preset.hex})`}
                          />
                        ))}
                      </div>

                      {!device.isOn && (
                        <p className="text-[10px] text-amber-700 italic">
                          Projector is OFF. Switch Projector ON to enable RGB lighting.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )
            })
          )}
          </BentoContainer>
        </section>

        {/* ---------------- 3. TODAY'S CLASSES & RECENT NOTES ---------------- */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Today's Classes List (Left 2 Columns) */}
          <div id="classes-section" className="lg:col-span-2 space-y-4">
            <Card id="schedule-section">
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

          {/* Right Column: Live Recent Activity & Lesson Notes */}
          <div className="space-y-4">
            {/* Card 1: Live Voice & IoT Recent Activity */}
            <Card>
              <CardHeader className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Clock className="w-4 h-4 text-cyan-400" />
                    <span>Recent Activity</span>
                  </CardTitle>
                  <CardDescription>Live voice commands & relay dispatch audit.</CardDescription>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={fetchRecentActivity}
                  isLoading={activitiesLoading}
                  className="h-7 px-2 text-xs text-slate-400 hover:text-white"
                  title="Refresh activity logs"
                >
                  <RefreshCw className={`w-3 h-3 ${activitiesLoading ? 'animate-spin' : ''}`} />
                </Button>
              </CardHeader>

              <CardContent className="space-y-3">
                {recentActivities.length > 0 ? (
                  <div className="space-y-2">
                    {recentActivities.map((act) => (
                      <div
                        key={act._id}
                        className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-1.5 hover:border-slate-700 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-xs font-semibold text-white font-mono truncate max-w-[150px]">
                            "{act.transcript}"
                          </span>
                          <Badge
                            variant={
                              act.result?.executionStatus === 'EXECUTED'
                                ? 'success'
                                : act.result?.executionStatus === 'FAILED'
                                ? 'danger'
                                : 'info'
                            }
                            size="sm"
                          >
                            {act.result?.executionStatus || act.intent}
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                          <span className="text-cyan-300">
                            {act.device ? `${act.device.toUpperCase()} → ${act.action}` : act.intent}
                          </span>
                          <span className="text-[10px] text-slate-500">
                            {new Date(act.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800/60 text-center space-y-1">
                    <p className="text-xs text-slate-400">No voice activity recorded yet.</p>
                    <p className="text-[11px] text-slate-500">
                      Use the Voice Assistant or buttons to command devices.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Card 2: Classroom Notes & Teaching Materials */}
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
          description="English voice engine for Room 302 IoT appliances and educational AI triggers."
          size="lg"
        >
          <VoiceAssistant
            classroom="Room 302"
            onClose={() => setActiveModal(null)}
            onCommandExecuted={(cmdData) => {
              fetchRecentActivity()
              if (cmdData.executionStatus === 'EXECUTED') {
                setActionAlert({
                  type: 'success',
                  message: cmdData.message,
                })
              } else if (cmdData.executionStatus === 'FAILED') {
                setActionAlert({
                  type: 'danger',
                  message: cmdData.message || 'Command could not be delivered.',
                })
              } else {
                setActionAlert({
                  type: 'info',
                  message: cmdData.message || `Voice command: ${cmdData.transcript}`,
                })
              }
            }}
          />
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
      </div>
    </DashboardLayout>
  )
}
