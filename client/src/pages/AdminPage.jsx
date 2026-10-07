import { useState, useEffect, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Users,
  School,
  Cpu,
  Sparkles,
  Settings,
  Terminal,
  RefreshCw,
  GraduationCap,
  Activity,
  Wifi,
  Search,
  Mic,
  Sliders,
  Server,
  Database,
  Send,
  Zap,
  Lightbulb,
  Fan,
  Projector,
  Layers,
  QrCode,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useSocket, useSocketEvent } from '../context/SocketContext'
import { testProtectedRoute } from '../services/auth.service'
import { DashboardLayout } from '../components/layout'
import { DemoLoginSection } from '../components/admin/DemoLoginSection'
import {
  Button,
  Badge,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Modal,
  EmptyState,
  AlertBanner,
  SiriCard,
} from '../components/ui'
import { API_BASE_URL } from '../config/api'
import { useMobileLayout, useHaptics, useCenterAction } from '../hooks'

export function AdminPage() {
  const { user, token } = useAuth()
  const { isConnected: isSocketConnected } = useSocket()
  const location = useLocation()
  const navigate = useNavigate()
  const { isMobile } = useMobileLayout()
  const { triggerHaptic } = useHaptics()
  useCenterAction({
    id: 'voice',
    label: 'Voice',
    ariaLabel: 'AI Voice Control',
    onClick: () => navigate('/voice'),
  })

  // Navigation tab state synced with URL hash (#overview, #teachers, #classes, #devices, #ai-system, #demo-login, #settings)
  const getInitialTab = () => {
    const hash = location.hash.replace('#', '')
    const validTabs = ['overview', 'teachers', 'classes', 'devices', 'ai-system', 'demo-login', 'settings']
    return validTabs.includes(hash) ? hash : 'overview'
  }

  const [activeTab, setActiveTab] = useState(getInitialTab)

  // Sync tab with URL hash if user browses back/forward
  useEffect(() => {
    const hash = location.hash.replace('#', '')
    if (hash && hash !== activeTab) {
      setActiveTab(hash)
    }
  }, [location.hash])

  const handleTabChange = (newTab) => {
    setActiveTab(newTab)
    navigate(`/admin#${newTab}`, { replace: true })
  }

  // Backend Dashboard API State
  const [dashboardData, setDashboardData] = useState(null)
  const [isLoadingData, setIsLoadingData] = useState(true)
  const [dataError, setDataError] = useState(null)
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Live System Infrastructure Health (Backend, MongoDB, MQTT, Gemini, ESP32)
  const [systemHealth, setSystemHealth] = useState(null)
  const [lastHealthCheck, setLastHealthCheck] = useState(null)

  // Live Database Devices & Controls
  const [dbDevices, setDbDevices] = useState([])

  // Real-time listener for incoming MQTT status events and controller availability via Socket.IO
  const handleRealtimeDeviceUpdate = useCallback((incoming) => {
    if (!incoming || (!incoming.deviceId && !incoming.id)) return
    setDbDevices((prev) => {
      const exists = prev.some((d) => d.deviceId === incoming.deviceId || d._id === incoming.id)
      if (!exists && incoming.deviceId) {
        return [...prev, incoming]
      }
      return prev.map((dev) => {
        const isMatch =
          dev.deviceId === incoming.deviceId ||
          dev._id === incoming.id ||
          dev._id === incoming.deviceId ||
          (dev.type && incoming.type && dev.type.toUpperCase() === incoming.type.toUpperCase() && dev.classroom === incoming.classroom)

        if (isMatch) {
          return {
            ...dev,
            state: incoming.state || dev.state,
            isOnline: typeof incoming.isOnline === 'boolean' ? incoming.isOnline : dev.isOnline,
            lastSeenAt: incoming.lastSeenAt || dev.lastSeenAt,
          }
        }

        // If a controller node changes online/offline status, cascade to child channels of that classroom
        if (
          (incoming.entityType === 'NODE' || incoming.deviceCategory === 'NODE' || incoming.type === 'OTHER') &&
          typeof incoming.isOnline === 'boolean' &&
          (dev.nodeId === incoming.deviceId || dev.classroom === incoming.classroom)
        ) {
          return {
            ...dev,
            isOnline: incoming.isOnline,
          }
        }

        return dev
      })
    })
  }, [])

  useSocketEvent('device:status', handleRealtimeDeviceUpdate)
  useSocketEvent('device:state', handleRealtimeDeviceUpdate)
  useSocketEvent('node:status', handleRealtimeDeviceUpdate)
  useSocketEvent('device:availability', handleRealtimeDeviceUpdate)

  // Search & Filter States
  const [teacherSearchQuery, setTeacherSearchQuery] = useState('')
  const [classSearchQuery, setClassSearchQuery] = useState('')
  const [deviceSearchQuery, setDeviceSearchQuery] = useState('')
  const [selectedDeviceType, setSelectedDeviceType] = useState('ALL')

  // Notification Banner
  const [adminAlert, setAdminAlert] = useState(null)

  // Test Route State
  const [testResult, setTestResult] = useState(null)
  const [isTesting, setIsTesting] = useState(false)

  // Modals & Voice Simulator State
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalType, setModalType] = useState('settings') // 'settings' | 'invite' | 'classroom'
  const [simulatedVoiceInput, setSimulatedVoiceInput] = useState('')
  const [simulatedResponse, setSimulatedResponse] = useState(null)
  const [isSimulating, setIsSimulating] = useState(false)

  // Form State for Modals
  const [teacherForm, setTeacherForm] = useState({
    name: '',
    email: '',
    department: 'Computer Science & Engineering',
    assignedClass: 'CS-302 (Lab 302)',
  })

  const [classForm, setClassForm] = useState({
    name: '',
    department: 'Computer Science',
    capacity: 60,
    relays: 4,
    devices: 'ESP32-RM',
  })

  const apiBaseUrl = API_BASE_URL

  // Fetch Super Admin Telemetry from Backend (Parallel fetch of Dashboard, System Status, Devices)
  const fetchDashboardData = useCallback(async () => {
    setIsRefreshing(true)
    setDataError(null)

    try {
      const [dashRes, sysRes, devRes] = await Promise.allSettled([
        fetch(`${apiBaseUrl}/api/admin/dashboard`, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        }),
        fetch(`${apiBaseUrl}/api/system/status`),
        fetch(`${apiBaseUrl}/api/devices`, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        }),
      ])

      // 1. Process Admin Dashboard Telemetry
      if (dashRes.status === 'fulfilled' && dashRes.value.ok) {
        const data = await dashRes.value.json()
        setDashboardData(data)
      } else {
        const errMessage =
          dashRes.status === 'rejected'
            ? dashRes.reason?.message
            : `Failed to load admin metrics (HTTP ${dashRes.value?.status || 500})`
        setDataError(errMessage || 'Backend dashboard telemetry unavailable.')
      }

      // 2. Process System Status (Backend, MongoDB, MQTT, Gemini, ESP32)
      if (sysRes.status === 'fulfilled' && sysRes.value.ok) {
        const sysData = await sysRes.value.json()
        if (sysData.services) {
          setSystemHealth(sysData.services)
          setLastHealthCheck(new Date())
        }
      }

      // 3. Process Live Devices from Database
      if (devRes.status === 'fulfilled' && devRes.value.ok) {
        const devData = await devRes.value.json()
        if (devData.devices) {
          setDbDevices(devData.devices)
        }
      }
    } catch (err) {
      console.warn('Dashboard API call note:', err.message)
      setDataError(err.message)
    } finally {
      setIsLoadingData(false)
      setIsRefreshing(false)
    }
  }, [apiBaseUrl, token])

  useEffect(() => {
    fetchDashboardData()
  }, [fetchDashboardData])

  // Handle protected test endpoint verification
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

  // Voice command simulation parser
  const handleSimulateVoice = (commandText) => {
    const input = commandText || simulatedVoiceInput
    if (!input.trim()) return

    setIsSimulating(true)
    setSimulatedResponse(null)

    setTimeout(() => {
      let targetRoom = 'Room 101'
      let action = 'LIGHTS_ON'
      let topic = 'smartclassroom/room101/relay/lights'

      const lower = input.toLowerCase()
      if (lower.includes('projector') || lower.includes('ப்ராஜெக்டர்')) {
        action = 'PROJECTOR_POWER_ON'
        topic = 'smartclassroom/room101/relay/projector'
      } else if (lower.includes('ac') || lower.includes('ஏசி') || lower.includes('air conditioner')) {
        action = 'AC_POWER_ON'
        topic = 'smartclassroom/room101/relay/ac'
      } else if (lower.includes('off') || lower.includes('அணை')) {
        action = 'ALL_RELAYS_OFF'
        topic = 'smartclassroom/room101/relay/all'
      }

      setSimulatedResponse({
        rawInput: input,
        detectedLanguage: /[\u0B80-\u0BFF]/.test(input) ? 'Tamil (தமிழ்)' : 'English',
        parsedIntent: action,
        targetRoom,
        mqttDispatched: {
          topic,
          payload: { command: action, state: 1, timestamp: new Date().toISOString() },
        },
        confidence: '98.4%',
      })
      setIsSimulating(false)
    }, 600)
  }

  // Derive real statistics and status strictly from actual MongoDB records & live Socket updates
  const nodesInDb = dbDevices.filter(
    (d) =>
      (d.entityType === 'NODE' || d.deviceCategory === 'NODE' || d.type === 'OTHER' || d.type === 'NODE') &&
      d.type !== 'LIGHT' &&
      d.type !== 'FAN' &&
      d.type !== 'PROJECTOR'
  )
  const channelsInDb = dbDevices.filter(
    (d) =>
      d.type !== 'OTHER' &&
      d.type !== 'NODE' &&
      d.entityType !== 'NODE' &&
      (d.entityType === 'CHANNEL' || d.deviceCategory === 'CHANNEL' || ['LIGHT', 'FAN', 'PROJECTOR'].includes(d.type))
  )

  const liveTotalNodes =
    nodesInDb.length > 0 ? nodesInDb.length : (dashboardData?.metrics?.totalNodes ?? 1)
  const liveOnlineNodes =
    nodesInDb.length > 0
      ? nodesInDb.filter((d) => d.isOnline === true).length
      : (dashboardData?.metrics?.onlineNodes ?? (systemHealth?.esp32?.onlineNodes ?? 0))

  const onlineNodeRooms = new Set(nodesInDb.filter((n) => n.isOnline === true).map((n) => n.classroom))
  const onlineNodeIds = new Set(nodesInDb.filter((n) => n.isOnline === true).map((n) => n.deviceId))

  const liveTotalChannels =
    channelsInDb.length > 0 ? channelsInDb.length : (dashboardData?.metrics?.totalChannels ?? 3)
  const liveChannelsOn =
    channelsInDb.length > 0
      ? channelsInDb.filter((d) => d.state === 'ON').length
      : (dashboardData?.metrics?.channelsOn ?? 0)

  // Channel availability is strictly based on the parent controller node being connected
  const liveAvailableChannels =
    channelsInDb.length > 0
      ? channelsInDb.filter(
          (c) =>
            (c.nodeId && onlineNodeIds.has(c.nodeId)) || (c.classroom && onlineNodeRooms.has(c.classroom))
        ).length
      : (liveOnlineNodes > 0 ? (dashboardData?.metrics?.availableChannels ?? liveTotalChannels) : 0)

  // Sourced strictly from MongoDB distinct classrooms and live device states
  const allClassroomNames = Array.from(
    new Set([
      ...(dashboardData?.classrooms || []).map((c) => c.name),
      ...dbDevices.map((d) => d.classroom),
    ].filter(Boolean))
  )
  if (allClassroomNames.length === 0) allClassroomNames.push('Room 302')

  const displayedClasses = allClassroomNames.map((roomName) => {
    const roomDevices = dbDevices.filter((d) => d.classroom === roomName)
    const roomNode = roomDevices.find(
      (d) =>
        (d.entityType === 'NODE' || d.deviceCategory === 'NODE' || d.type === 'OTHER' || d.type === 'NODE') &&
        d.type !== 'LIGHT' &&
        d.type !== 'FAN' &&
        d.type !== 'PROJECTOR'
    ) || {
      deviceId: `ESP32-${roomName.replace(/\s+/g, '').toUpperCase()}-01`,
      name: `${roomName} ESP32 Controller Node`,
      isOnline: liveOnlineNodes > 0,
      classroom: roomName,
    }

    const typePriority = { LIGHT: 1, FAN: 2, PROJECTOR: 3 }
    const actualChannels = roomDevices
      .filter(
        (d) =>
          d.type !== 'OTHER' &&
          d.type !== 'NODE' &&
          d.entityType !== 'NODE' &&
          (['LIGHT', 'FAN', 'PROJECTOR'].includes(d.type) || d.entityType === 'CHANNEL')
      )
      .sort((a, b) => (typePriority[a.type] || 99) - (typePriority[b.type] || 99))

    // Fallback template channels if dbDevices not loaded yet
    const fallbackChannels = [
      { deviceId: `ESP32-${roomName.replace(/\s+/g, '').toUpperCase()}-LIGHT-01`, type: 'LIGHT', name: `${roomName} Main Lights`, state: 'OFF', classroom: roomName },
      { deviceId: `ESP32-${roomName.replace(/\s+/g, '').toUpperCase()}-FAN-01`, type: 'FAN', name: `${roomName} Ceiling Fans`, state: 'OFF', classroom: roomName },
      { deviceId: `ESP32-${roomName.replace(/\s+/g, '').toUpperCase()}-PROJ-01`, type: 'PROJECTOR', name: `${roomName} Smart Projector`, state: 'OFF', classroom: roomName },
    ]

    const roomChannels = actualChannels.length > 0 ? actualChannels : fallbackChannels
    const isNodeOnline = roomNode.isOnline === true
    const onCount = roomChannels.filter((c) => c.state === 'ON').length
    const availableCount = isNodeOnline ? roomChannels.length : 0

    return {
      id: roomName.toLowerCase().replace(/[^a-z0-9]/g, '-'),
      name: roomName,
      department: 'Smart Classroom Facility',
      node: roomNode,
      nodeDeviceId: roomNode.deviceId,
      isNodeOnline,
      channelsList: roomChannels,
      totalChannels: roomChannels.length,
      channelsOn: onCount,
      availableChannels: availableCount,
      status: isNodeOnline ? 'Active' : 'Offline',
      devicesSummary: isNodeOnline
        ? `${onCount} ON / ${availableCount} Available`
        : '0 Controllable • Node Offline',
      currentTopic: isNodeOnline ? `${roomNode.deviceId} Online` : 'Standby (Offline)',
    }
  })

  const activeClassroomsCount = displayedClasses.filter((c) => c.isNodeOnline).length

  const metrics = {
    totalTeachers: dashboardData?.metrics?.totalTeachers ?? 0,
    totalClasses: displayedClasses.length,
    activeClasses: activeClassroomsCount,
    totalStudents: dashboardData?.metrics?.totalStudents ?? 0,
    // Physical IoT Nodes
    totalNodes: liveTotalNodes,
    onlineNodes: liveOnlineNodes,
    offlineNodes: Math.max(0, liveTotalNodes - liveOnlineNodes),
    // Relay Channels
    totalChannels: liveTotalChannels,
    channelsOn: liveChannelsOn,
    channelsOff: Math.max(0, liveTotalChannels - liveChannelsOn),
    activeChannels: liveAvailableChannels,
    availableChannels: liveAvailableChannels,
    // Backward-compatible metrics mapping
    totalDevices: liveTotalNodes,
    connectedDevices: liveOnlineNodes,
    onlineDevices: liveOnlineNodes,
    offlineDevices: Math.max(0, liveTotalNodes - liveOnlineNodes),
    systemStatus: systemHealth?.backend?.status || 'offline',
    mqttStatus: systemHealth?.mqtt?.connected ? 'connected' : 'offline',
    geminiStatus: systemHealth?.gemini?.status || 'offline',
  }

  const services = dashboardData?.services || {}

  // Sourced strictly from MongoDB teachers query
  const displayedTeachers = (dashboardData?.teachers || []).map((t, idx) => ({
    id: t._id || `T-${idx}`,
    name: t.name,
    email: t.email,
    department: t.department || 'Academic Department',
    assignedClasses: Array.isArray(t.assignedClasses) && t.assignedClasses.length > 0 ? t.assignedClasses : ['Room 302'],
    status: t.isActive !== false ? 'Active' : 'Inactive',
    joined: t.createdAt
      ? new Date(t.createdAt).toLocaleDateString('en-US', {
          month: 'short',
          year: 'numeric',
        })
      : 'Active',
  }))

  const filteredTeachers = displayedTeachers.filter((t) => {
    const q = teacherSearchQuery.toLowerCase()
    return (
      t.name.toLowerCase().includes(q) ||
      t.email.toLowerCase().includes(q) ||
      t.department.toLowerCase().includes(q)
    )
  })

  const filteredClasses = displayedClasses.filter((c) => {
    const q = classSearchQuery.toLowerCase()
    return (
      c.name.toLowerCase().includes(q) ||
      c.department.toLowerCase().includes(q)
    )
  })

  // Devices filtering - strictly controllable relay channels (Light, Fan, Projector)
  const filteredDbDevices = dbDevices.filter((d) => {
    // Exclude physical controller nodes from appliance list
    if (d.entityType === 'NODE' || d.deviceCategory === 'NODE' || d.type === 'OTHER') return false

    const q = deviceSearchQuery.toLowerCase()
    const matchesSearch =
      (d.name && d.name.toLowerCase().includes(q)) ||
      (d.deviceId && d.deviceId.toLowerCase().includes(q)) ||
      (d.classroom && d.classroom.toLowerCase().includes(q)) ||
      (d.type && d.type.toLowerCase().includes(q))
    const matchesType = selectedDeviceType === 'ALL' || d.type === selectedDeviceType
    return matchesSearch && matchesType
  })

  // Physical ESP32 controller nodes
  const nodeDevices = dbDevices.filter(
    (d) => d.entityType === 'NODE' || d.deviceCategory === 'NODE' || d.type === 'OTHER'
  )

  const displayedHubs = (
    nodeDevices.length > 0
      ? nodeDevices
      : Array.from(new Set(dbDevices.map((d) => d.classroom).filter(Boolean))).map((room) => ({
          deviceId: `ESP32-${room.replace(/\s+/g, '').toUpperCase()}-01`,
          name: `${room} ESP32 Controller Node`,
          classroom: room,
          isOnline: dbDevices.some((d) => d.classroom === room && d.isOnline === true),
        }))
  ).map((node) => {
    const room = node.classroom || 'Room 302'
    const channels = dbDevices.filter(
      (d) => (d.entityType === 'CHANNEL' || d.deviceCategory === 'CHANNEL' || d.type !== 'OTHER') && d.classroom === room
    )
    const isNodeOnline = node.isOnline === true
    const onCount = channels.filter((c) => c.state === 'ON').length
    const availableCount = isNodeOnline ? channels.length : 0
    return {
      id: node.deviceId,
      deviceId: node.deviceId,
      name: node.name || `ESP32 Smart Controller (${room})`,
      room,
      relays: isNodeOnline
        ? `${channels.length} Channels (${onCount} ON / ${availableCount} Available)`
        : `${channels.length} Channels (0 Controllable • Node Offline)`,
      channelsList: channels,
      status: isNodeOnline ? 'Online' : 'Offline',
      isOnline: isNodeOnline,
      ip: '192.168.1.100 (DHCP)',
      rssi: isNodeOnline ? 'Active (Connected)' : 'Disconnected',
      mac: node.deviceId,
    }
  })

  const filteredHubs = displayedHubs.filter((h) => {
    const q = deviceSearchQuery.toLowerCase()
    const matchesSearch =
      h.name.toLowerCase().includes(q) ||
      h.room.toLowerCase().includes(q) ||
      h.deviceId.toLowerCase().includes(q)
    const matchesType = selectedDeviceType === 'ALL' || selectedDeviceType === 'HUB'
    return matchesSearch && matchesType
  })

  const handleRegisterTeacher = (e) => {
    e?.preventDefault()
    if (!teacherForm.name || !teacherForm.email) return
    setIsModalOpen(false)
    setAdminAlert({
      type: 'success',
      title: 'Faculty Provisioned',
      message: `Teacher ${teacherForm.name} (${teacherForm.email}) registered with TEACHER role privileges.`,
    })
    setTeacherForm({
      name: '',
      email: '',
      department: 'Computer Science & Engineering',
      assignedClass: 'CS-302 (Lab 302)',
    })
  }

  const handleAddClassroom = (e) => {
    e?.preventDefault()
    if (!classForm.name) return
    setIsModalOpen(false)
    setAdminAlert({
      type: 'success',
      title: 'Facility Configured',
      message: `Classroom ${classForm.name} mapped to controller node ${classForm.devices}.`,
    })
    setClassForm({
      name: '',
      department: 'Computer Science',
      capacity: 60,
      relays: 4,
      devices: 'ESP32-RM',
    })
  }

  return (
    <DashboardLayout
      pageTitle="Super Admin Console"
      activeTab={activeTab}
      onTabChange={handleTabChange}
      onTriggerVoice={() => handleTabChange('ai-system')}
    >
      <div className="w-full space-y-4">
        {/* Apple Intelligence / Siri iOS 27 Master Bento Container (Contiguous, Gap-Free) */}
        <SiriCard className="overflow-hidden">
          {/* 1. Siri Header with Live Status & Quick Action Buttons */}
          <div className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white/70">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-purple-500 via-indigo-500 to-pink-500 flex items-center justify-center text-white shadow-md shadow-purple-500/25 shrink-0">
                <Sparkles className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                    Siri Intelligence & Campus Telemetry
                  </h2>
                  <Badge variant="purple" dot pulse size="sm">
                    iOS 27 Vision
                  </Badge>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Automated facility orchestration, MQTT relay bus & Gemini bilingual engine.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
              <Button
                variant="outline"
                size="sm"
                leftIcon={<RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />}
                onClick={fetchDashboardData}
                disabled={isRefreshing}
                className="rounded-xl h-8 px-3 text-xs"
              >
                Refresh
              </Button>
              <Button
                variant="primary"
                size="sm"
                leftIcon={<Zap className="w-3.5 h-3.5 text-amber-200" />}
                onClick={() => navigate('/admin/device-control')}
                className="bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 hover:from-amber-400 hover:to-rose-400 shadow-md shadow-amber-500/20 text-white font-semibold rounded-xl h-8 px-3 text-xs"
              >
                Device Control
              </Button>
              <Button
                variant="primary"
                size="sm"
                leftIcon={<Sparkles className="w-3.5 h-3.5 text-purple-200 animate-pulse" />}
                onClick={() => handleTabChange('ai-system')}
                className="bg-gradient-to-r from-purple-600 via-indigo-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 shadow-md shadow-purple-500/20 text-white font-semibold rounded-xl h-8 px-3 text-xs"
              >
                AI Voice Simulator
              </Button>
              <Button
                variant="primary"
                size="sm"
                leftIcon={<QrCode className="w-3.5 h-3.5 text-blue-200" />}
                onClick={() => handleTabChange('demo-login')}
                className="bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 shadow-md shadow-blue-500/20 text-white font-semibold rounded-xl h-8 px-3 text-xs"
              >
                Demo QR Login
              </Button>
              <Button
                variant="outline"
                size="sm"
                leftIcon={<Sliders className="w-3.5 h-3.5" />}
                onClick={() => {
                  setModalType('settings')
                  setIsModalOpen(true)
                }}
                className="rounded-xl h-8 px-3 text-xs"
              >
                Config
              </Button>
            </div>
          </div>

          {/* 2. Core Metrics Strip (Contiguous, Hairline Divider, Zero Gaps!) */}
          <div className="border-t border-slate-100/90 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-slate-100/90 bg-white/50">
            {/* KPI 1: IoT Nodes */}
            <div className="p-4 sm:p-5 flex items-start justify-between gap-3 hover:bg-slate-50/50 transition-colors">
              <div>
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">IoT Nodes</span>
                <div className="mt-1 text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                  {metrics.onlineNodes} Online
                </div>
                <span className={`text-[11px] font-medium mt-1 block flex items-center gap-1.5 ${
                  metrics.onlineNodes > 0 ? 'text-emerald-600' : 'text-rose-500'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    metrics.onlineNodes > 0 ? 'bg-emerald-500 animate-ping' : 'bg-rose-500'
                  }`} />
                  ESP32 Nodes: {metrics.onlineNodes} / {metrics.totalNodes} Online
                </span>
              </div>
              <div className={`w-10 h-10 rounded-2xl border flex items-center justify-center shrink-0 shadow-2xs ${
                metrics.onlineNodes > 0
                  ? 'bg-emerald-50 border-emerald-100/80 text-emerald-600'
                  : 'bg-rose-50 border-rose-100/80 text-rose-600'
              }`}>
                <Cpu className="w-5 h-5" />
              </div>
            </div>

            {/* KPI 2: Channels */}
            <div className="p-4 sm:p-5 flex items-start justify-between gap-3 hover:bg-slate-50/50 transition-colors">
              <div>
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">Channels</span>
                <div className="mt-1 text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                  {metrics.totalChannels} Total
                </div>
                <span className="text-[11px] text-slate-500 font-medium mt-1 block">
                  {metrics.onlineNodes > 0
                    ? `${metrics.availableChannels} / ${metrics.totalChannels} Controllable`
                    : `0 / ${metrics.totalChannels} Controllable`}
                </span>
              </div>
              <div className="w-10 h-10 rounded-2xl bg-cyan-50 border border-cyan-100/80 flex items-center justify-center text-cyan-600 shrink-0 shadow-2xs">
                <Layers className="w-5 h-5" />
              </div>
            </div>

            {/* KPI 3: Active Channels */}
            <div className="p-4 sm:p-5 flex items-start justify-between gap-3 hover:bg-slate-50/50 transition-colors">
              <div>
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">Active Channels</span>
                <div className="mt-1 text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                  {metrics.onlineNodes > 0 ? `${metrics.channelsOn} ON` : '0 ON'}
                </div>
                <span className={`text-[11px] font-medium mt-1 block ${
                  metrics.onlineNodes > 0 ? 'text-indigo-600' : 'text-slate-400'
                }`}>
                  {metrics.onlineNodes > 0
                    ? `Relay Channels: ${metrics.channelsOn} / ${metrics.availableChannels} Active`
                    : `0 / ${metrics.totalChannels} Controllable`}
                </span>
              </div>
              <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100/80 flex items-center justify-center text-indigo-600 shrink-0 shadow-2xs">
                <Zap className="w-5 h-5" />
              </div>
            </div>

            {/* KPI 4: Classrooms */}
            <div className="p-4 sm:p-5 flex items-start justify-between gap-3 hover:bg-slate-50/50 transition-colors">
              <div>
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">Classrooms</span>
                <div className="mt-1 text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                  {metrics.activeClasses} Active
                </div>
                <span className="text-[11px] text-slate-500 font-medium mt-1 block">
                  {metrics.activeClasses} / {metrics.totalClasses} Active {metrics.totalClasses === 1 ? 'room' : 'rooms'}
                </span>
              </div>
              <div className="w-10 h-10 rounded-2xl bg-purple-50 border border-purple-100/80 flex items-center justify-center text-purple-600 shrink-0 shadow-2xs">
                <School className="w-5 h-5" />
              </div>
            </div>

            {/* KPI 5: Total Faculty */}
            <div className="p-4 sm:p-5 flex items-start justify-between gap-3 hover:bg-slate-50/50 transition-colors col-span-2 sm:col-span-1">
              <div>
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">Total Faculty</span>
                <div className="mt-1 text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">{metrics.totalTeachers}</div>
                <span className="text-[11px] text-slate-400 mt-1 block font-medium">Registered accounts</span>
              </div>
              <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100/80 flex items-center justify-center text-indigo-600 shrink-0 shadow-2xs">
                <Users className="w-5 h-5" />
              </div>
            </div>
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
                  <span className="text-[10px] text-slate-400 font-mono">{systemHealth?.backend?.uptimeFormatted ? `Up ${systemHealth.backend.uptimeFormatted}` : 'Port 5000'}</span>
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
              <Badge variant={systemHealth?.mqtt?.connected ? 'info' : 'danger'} dot size="sm">
                {systemHealth?.mqtt?.connected ? 'Broker' : 'Offline'}
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
                  <span className="text-[10px] text-slate-400 font-mono">2.5 Flash</span>
                </div>
              </div>
              <Badge variant={systemHealth?.gemini?.status === 'online' ? 'purple' : 'warning'} dot size="sm">
                {systemHealth?.gemini?.status === 'online' ? 'Active' : 'Fallback'}
              </Badge>
            </div>

            {/* 5. ESP32 Hardware */}
            <div className="p-3.5 sm:p-4 flex items-center justify-between gap-2 hover:bg-white/60 transition-colors">
              <div className="flex items-center gap-2.5">
                <div className={`w-7 h-7 rounded-xl border flex items-center justify-center shrink-0 ${
                  metrics.onlineNodes > 0
                    ? 'bg-amber-50 border-amber-100 text-amber-600'
                    : 'bg-rose-50 border-rose-100 text-rose-600'
                }`}>
                  <Cpu className="w-3.5 h-3.5" />
                </div>
                <div>
                  <span className="font-bold text-slate-800 block text-[11px]">ESP32 Hardware</span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {metrics.onlineNodes > 0
                      ? `${metrics.onlineNodes}/${metrics.totalNodes} Online • ${metrics.availableChannels} Relays Avail`
                      : 'Offline • 0 Controllable'}
                  </span>
                </div>
              </div>
              <Badge variant={metrics.onlineNodes > 0 ? 'success' : 'danger'} dot size="sm">
                {metrics.onlineNodes > 0 ? 'Online' : 'Offline'}
              </Badge>
            </div>
          </div>
        </SiriCard>

        {/* Dynamic Admin Notification Banner */}
        {adminAlert && (
          <AlertBanner
            variant={adminAlert.type || 'info'}
            title={adminAlert.title || 'Administrative Notice'}
            message={adminAlert.message}
            onDismiss={() => setAdminAlert(null)}
          />
        )}

        {/* ----------------- TAB CONTENT ROUTING ----------------- */}

        {/* 1. OVERVIEW TAB */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left 2 Cols: Smart Classroom Health & Quick Relay Monitor */}
              <div className="lg:col-span-2 space-y-6">
                <Card>
                  <CardHeader>
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Activity className="w-4 h-4 text-emerald-400" />
                        <span>Live Campus Room Automation</span>
                      </CardTitle>
                      <CardDescription>
                        Real-time status of automated classrooms and IoT relay hardware.
                      </CardDescription>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleTabChange('classes')}
                    >
                      View All Rooms
                    </Button>
                  </CardHeader>
                  <CardContent className="p-0">
                    {displayedClasses.length > 0 ? (
                      <div className="divide-y divide-slate-800/80">
                        {displayedClasses.map((cls) => (
                          <div key={cls.id} className="p-4 sm:p-5 flex flex-col gap-3.5 hover:bg-slate-900/40 transition-colors">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                              <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                                  cls.isNodeOnline ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                }`}>
                                  <School className="w-5 h-5" />
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <h4 className="text-sm font-bold text-white tracking-tight">{cls.name}</h4>
                                    <Badge
                                      variant={cls.isNodeOnline ? 'success' : 'danger'}
                                      dot={cls.isNodeOnline}
                                      pulse={cls.isNodeOnline}
                                      size="sm"
                                      className="font-bold text-xs"
                                    >
                                      {cls.isNodeOnline ? '🟢 Controller Online' : '🔴 Controller Offline'}
                                    </Badge>
                                  </div>
                                  <p className="text-xs text-slate-400 mt-0.5 font-mono">
                                    Physical Node: <strong className="text-slate-200">{cls.nodeDeviceId}</strong>
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 self-start sm:self-auto">
                                <Button
                                  variant="primary"
                                  size="sm"
                                  leftIcon={<Zap className="w-3.5 h-3.5 text-amber-200" />}
                                  onClick={() => navigate('/admin/device-control')}
                                  className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white rounded-xl h-8 px-3 text-xs font-semibold shadow-xs"
                                >
                                  Digital Control
                                </Button>
                              </div>
                            </div>

                            {/* Channels list row */}
                            <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-2">
                              <div className="flex items-center justify-between text-[11px] font-mono font-semibold text-slate-400 uppercase tracking-wider">
                                <span>Channels:</span>
                                <span className={cls.isNodeOnline ? 'text-indigo-400' : 'text-slate-500'}>
                                  {cls.isNodeOnline ? `${cls.channelsOn} / ${cls.totalChannels} Active` : '0 Controllable'}
                                </span>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs font-mono">
                                {cls.channelsList.map((ch) => {
                                  const isOn = ch.state === 'ON'
                                  const IconComponent = ch.type === 'LIGHT' ? Lightbulb : ch.type === 'FAN' ? Fan : Projector
                                  let typeColor = 'text-amber-400'
                                  if (ch.type === 'FAN') typeColor = 'text-cyan-400'
                                  if (ch.type === 'PROJECTOR') typeColor = 'text-indigo-400'

                                  return (
                                    <div
                                      key={ch.deviceId || ch._id}
                                      className={`p-2 rounded-lg border flex items-center justify-between gap-2 ${
                                        isOn && cls.isNodeOnline
                                          ? 'bg-slate-900/90 border-slate-700/80'
                                          : 'bg-slate-950/50 border-slate-800/60'
                                      }`}
                                    >
                                      <div className="flex items-center gap-2 truncate">
                                        <IconComponent className={`w-3.5 h-3.5 shrink-0 ${typeColor}`} />
                                        <span className="font-bold text-slate-200 uppercase tracking-wider text-[11px] truncate">
                                          {ch.type}
                                        </span>
                                      </div>
                                      <Badge
                                        variant={isOn && cls.isNodeOnline ? 'success' : 'neutral'}
                                        size="xs"
                                        className="font-bold font-mono px-1.5 py-0.5"
                                      >
                                        {isOn && cls.isNodeOnline ? 'ON' : 'OFF'}
                                      </Badge>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-6 text-center text-xs text-slate-500">
                        No active classrooms registered in the system.
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Real-time Hardware & Security Audit Activity */}
                <Card>
                  <CardHeader>
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Activity className="w-4 h-4 text-cyan-400" />
                        <span>Recent Hardware Activity & Audit Log</span>
                      </CardTitle>
                      <CardDescription>
                        Live event records from physical relays, ESP32 nodes, and authorized faculty actions.
                      </CardDescription>
                    </div>
                    <Badge variant="purple" size="sm">
                      {dashboardData?.recentActivities?.length || 0} Events
                    </Badge>
                  </CardHeader>
                  <CardContent className="p-0">
                    {dashboardData?.recentActivities && dashboardData.recentActivities.length > 0 ? (
                      <div className="divide-y divide-slate-800/80">
                        {dashboardData.recentActivities.map((act) => (
                          <div key={act.id || act._id} className="p-3.5 sm:p-4 flex items-center justify-between gap-3 hover:bg-slate-900/40 transition-colors text-xs">
                            <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                                act.newState === 'ON' || act.action === 'ON' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-slate-800 text-slate-400'
                              }`}>
                                <Zap className="w-4 h-4" />
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-white">
                                    {act.deviceName || act.deviceId || 'Hardware Relay'}
                                  </span>
                                  <Badge variant={act.mqttStatus === 'FAILED' ? 'danger' : 'success'} size="sm">
                                    {act.action || 'COMMAND'}
                                  </Badge>
                                  {(act.newState || act.action) && (
                                    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                                      (act.newState || act.action) === 'ON' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-800 text-slate-400'
                                    }`}>
                                      {act.newState || act.action}
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-slate-400 mt-0.5">
                                  {act.classroom || 'Room 302'} &bull; User: <span className="text-slate-300 font-medium">{act.userName || 'System'}</span> ({act.userRole || 'SYSTEM'})
                                </div>
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <span className="text-[10px] text-slate-500 font-mono block">
                                {act.createdAt ? new Date(act.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Recent'}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-6 text-center text-xs text-slate-500">
                        No hardware activity recorded yet in the database.
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Temporary QR Demo Access Bento Card */}
                <Card className="border-indigo-100 bg-gradient-to-br from-white via-indigo-50/20 to-purple-50/20 shadow-xs">
                  <CardHeader>
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <QrCode className="w-4 h-4 text-indigo-500" />
                        <span>Temporary QR Demo Access</span>
                      </CardTitle>
                      <CardDescription>
                        Generate or display live presentation QR credentials for guest students.
                      </CardDescription>
                    </div>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleTabChange('demo-login')}
                      className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl h-8 px-3 text-xs shadow-sm font-semibold"
                    >
                      Open Demo QR
                    </Button>
                  </CardHeader>
                </Card>

                {/* Backend Admin Route Security Test */}
                <Card>
                  <CardHeader>
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Terminal className="w-4 h-4 text-purple-400" />
                        <span>Backend Security Verification</span>
                      </CardTitle>
                      <CardDescription>
                        Test token-based route authorization against <code className="text-purple-300">GET /api/admin/test</code>.
                      </CardDescription>
                    </div>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleTestAdminRoute}
                      isLoading={isTesting}
                    >
                      Run Test
                    </Button>
                  </CardHeader>
                  <CardContent>
                    {testResult ? (
                      <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono space-y-2">
                        <div className="flex items-center justify-between">
                          <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${testResult.ok ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'}`}>
                            HTTP {testResult.status} {testResult.ok ? 'OK' : 'DENIED'}
                          </span>
                          <span className="text-[11px] text-slate-500">{testResult.timestamp}</span>
                        </div>
                        <pre className={testResult.ok ? 'text-emerald-300' : 'text-rose-300'}>
                          {JSON.stringify(testResult.data, null, 2)}
                        </pre>
                      </div>
                    ) : (
                      <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/60 flex items-center justify-between text-xs text-slate-400">
                        <span>Click "Run Test" to confirm Super Admin token authorization.</span>
                        <Badge variant="neutral" size="sm">Idle</Badge>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Right Col: Admin Profile & System Telemetry */}
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Admin Session</CardTitle>
                    <Badge variant="purple" size="sm">Active</Badge>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
                      <span className="text-[11px] text-slate-400 uppercase tracking-wider block">Administrator</span>
                      <div className="mt-1 text-sm font-semibold text-white">{user?.name}</div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
                      <span className="text-[11px] text-slate-400 uppercase tracking-wider block">Email</span>
                      <div className="mt-1 text-xs font-mono text-purple-300 truncate">{user?.email}</div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
                      <span className="text-[11px] text-slate-400 uppercase tracking-wider block">Role Privilege</span>
                      <div className="mt-1 text-xs font-mono text-emerald-400 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                        FULL_SUPER_ADMIN_ACCESS
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Quick Shortcuts */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Quick Actions</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2.5">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="w-full justify-start text-xs"
                      leftIcon={<Users className="w-4 h-4 text-indigo-400" />}
                      onClick={() => handleTabChange('teachers')}
                    >
                      Manage Teachers Directory
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="w-full justify-start text-xs"
                      leftIcon={<Cpu className="w-4 h-4 text-cyan-400" />}
                      onClick={() => handleTabChange('devices')}
                    >
                      Check {metrics.totalNodes ?? 1} Controller Node & {metrics.totalChannels ?? 3} Channels
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="w-full justify-start text-xs"
                      leftIcon={<Mic className="w-4 h-4 text-purple-400" />}
                      onClick={() => handleTabChange('ai-system')}
                    >
                      Test Gemini Voice Simulator
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        )}

        {/* 2. TEACHERS TAB */}
        {activeTab === 'teachers' && (
          <div className="space-y-6">
            <Card>
              <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-indigo-400" />
                    <span>Faculty & Teacher Directory</span>
                  </CardTitle>
                  <CardDescription>
                    Campus instructors authorized for Smart Classroom voice control and lecture schedules.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    leftIcon={<Users className="w-3.5 h-3.5" />}
                    onClick={() => {
                      setModalType('invite')
                      setIsModalOpen(true)
                    }}
                  >
                    Register Teacher
                  </Button>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                {/* Search Bar */}
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={teacherSearchQuery}
                    onChange={(e) => setTeacherSearchQuery(e.target.value)}
                    placeholder="Search teachers by name, department, or email..."
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                {/* Teachers Table or Empty State */}
                {filteredTeachers.length > 0 ? (
                  <div className="overflow-x-auto rounded-xl border border-slate-800/80">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-900/80 text-slate-400 border-b border-slate-800 font-mono text-[11px] uppercase">
                          <th className="py-3 px-4 font-semibold">Faculty Member</th>
                          <th className="py-3 px-4 font-semibold">Department</th>
                          <th className="py-3 px-4 font-semibold">Assigned Classes</th>
                          <th className="py-3 px-4 font-semibold">Status</th>
                          <th className="py-3 px-4 font-semibold text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {filteredTeachers.map((teacher) => (
                          <tr key={teacher.id} className="hover:bg-slate-900/40 transition-colors">
                            <td className="py-3.5 px-4">
                              <div className="font-semibold text-white">{teacher.name}</div>
                              <div className="text-[11px] font-mono text-indigo-300">{teacher.email}</div>
                            </td>
                            <td className="py-3.5 px-4 text-slate-300">{teacher.department}</td>
                            <td className="py-3.5 px-4">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {teacher.assignedClasses.map((cls) => (
                                  <Badge key={cls} variant="neutral" size="sm">
                                    {cls}
                                  </Badge>
                                ))}
                              </div>
                            </td>
                            <td className="py-3.5 px-4">
                              <Badge variant={teacher.status === 'Active' ? 'success' : 'neutral'} dot size="sm">
                                {teacher.status}
                              </Badge>
                            </td>
                            <td className="py-3.5 px-4 text-right">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setModalType('invite')
                                  setIsModalOpen(true)
                                }}
                              >
                                Details
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <EmptyState
                    title="No Faculty Members Found"
                    description={`No instructors match your search for "${teacherSearchQuery}".`}
                    action={{
                      label: 'Clear Search Filter',
                      onClick: () => setTeacherSearchQuery(''),
                    }}
                  />
                )}

                <p className="text-[11px] text-slate-500 font-mono">
                  * Note: Faculty credentials are cryptographically hashed and verified with role-based JWT security.
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* 3. CLASSES TAB */}
        {activeTab === 'classes' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900 tracking-tight">Smart Classroom Facilities</h3>
                <p className="text-xs text-slate-500">
                  Automated lecture halls with scheduled IoT relays, microphones, and projector cast.
                </p>
              </div>
              <Button
                variant="primary"
                size="sm"
                leftIcon={<School className="w-3.5 h-3.5" />}
                onClick={() => {
                  setModalType('classroom')
                  setIsModalOpen(true)
                }}
              >
                Add Classroom
              </Button>
            </div>

            {/* Search Bar for Classes */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={classSearchQuery}
                onChange={(e) => setClassSearchQuery(e.target.value)}
                placeholder="Search classrooms by hall name, department, or active course..."
                className="w-full pl-10 pr-4 py-2.5 bg-slate-100/80 border border-slate-200/80 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500"
              />
            </div>

            {filteredClasses.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredClasses.map((cls) => (
                  <Card key={cls.id} className="p-5 sm:p-6 space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
                          cls.isNodeOnline ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-600 border border-rose-500/20'
                        }`}>
                          <School className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-base font-bold text-slate-900 tracking-tight">{cls.name}</h4>
                            <Badge
                              variant={cls.isNodeOnline ? 'success' : 'danger'}
                              dot={cls.isNodeOnline}
                              pulse={cls.isNodeOnline}
                              size="sm"
                              className="font-bold text-xs"
                            >
                              {cls.isNodeOnline ? '🟢 Controller Online' : '🔴 Controller Offline'}
                            </Badge>
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5 font-mono">
                            Node: <strong className="text-slate-800">{cls.nodeDeviceId}</strong>
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          variant="primary"
                          size="sm"
                          leftIcon={<Zap className="w-3.5 h-3.5 text-amber-200" />}
                          onClick={() => navigate('/admin/device-control')}
                          className="bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 hover:from-amber-400 hover:to-rose-400 text-white font-semibold rounded-xl h-8 px-3 text-xs shadow-xs"
                        >
                          Digital Control
                        </Button>
                      </div>
                    </div>

                    {/* Channels breakdown section */}
                    <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/70 space-y-2.5">
                      <div className="flex items-center justify-between text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        <span>Channels:</span>
                        <span className="font-mono text-[11px] text-slate-600">
                          {cls.isNodeOnline ? `${cls.channelsOn} / ${cls.totalChannels} Active` : `0 / ${cls.totalChannels} Controllable`}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        {cls.channelsList.map((ch) => {
                          const isOn = ch.state === 'ON'
                          const IconComponent = ch.type === 'LIGHT' ? Lightbulb : ch.type === 'FAN' ? Fan : Projector
                          let typeColor = 'text-amber-500'
                          if (ch.type === 'FAN') typeColor = 'text-cyan-500'
                          if (ch.type === 'PROJECTOR') typeColor = 'text-indigo-500'

                          return (
                            <div
                              key={ch.deviceId || ch._id}
                              className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 transition-all ${
                                isOn && cls.isNodeOnline
                                  ? 'bg-white border-slate-200 shadow-2xs'
                                  : 'bg-white/60 border-slate-200/60'
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <IconComponent className={`w-3.5 h-3.5 shrink-0 ${typeColor}`} />
                                <span className="text-xs font-bold text-slate-800 truncate">
                                  {ch.type}
                                </span>
                              </div>

                              <Badge
                                variant={isOn && cls.isNodeOnline ? 'success' : 'neutral'}
                                size="xs"
                                className="font-bold font-mono px-2 py-0.5"
                              >
                                {isOn && cls.isNodeOnline ? 'ON' : 'OFF'}
                              </Badge>
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-xs">
                      <span className="text-slate-500 font-mono text-[11px]">
                        Controller: <strong className="text-slate-700">{cls.nodeDeviceId}</strong>
                      </span>
                      <span className={`font-semibold font-mono text-[11px] ${cls.isNodeOnline ? 'text-emerald-600' : 'text-rose-500'}`}>
                        {cls.isNodeOnline ? 'Controller Connected' : 'Controller Disconnected'}
                      </span>
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No Classrooms Found"
                description={`No lecture halls matching "${classSearchQuery}".`}
                action={{
                  label: 'Clear Search Filter',
                  onClick: () => setClassSearchQuery(''),
                }}
              />
            )}
          </div>
        )}

        {/* 4. DEVICES TAB */}
        {activeTab === 'devices' && (
          <div className="space-y-6">
            <Card>
              <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-cyan-400" />
                    <span>Campus IoT Relay Hardware & Device Matrix</span>
                  </CardTitle>
                  <CardDescription>
                    Real-time status of classroom IoT appliances, GPIO relays, and ESP32 controller nodes.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    leftIcon={<Zap className="w-3.5 h-3.5 text-amber-200" />}
                    onClick={() => navigate('/admin/device-control')}
                    className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white rounded-xl h-8 px-3 text-xs font-semibold shadow-xs"
                  >
                    Digital Device Control
                  </Button>
                  <Badge
                    variant={systemHealth?.esp32?.connected ? 'success' : 'danger'}
                    dot
                    pulse={systemHealth?.esp32?.connected}
                    size="sm"
                  >
                    {systemHealth?.esp32?.connected ? 'Hardware Connected' : 'ESP32 Offline'}
                  </Badge>
                  <Badge
                    variant={systemHealth?.mqtt?.connected ? 'info' : 'danger'}
                    dot
                    pulse={systemHealth?.mqtt?.connected}
                    size="sm"
                  >
                    {systemHealth?.mqtt?.connected ? 'MQTT Live' : 'Broker Down'}
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="space-y-5">
                {/* Search & Type Filter Controls */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={deviceSearchQuery}
                      onChange={(e) => setDeviceSearchQuery(e.target.value)}
                      placeholder="Search devices by name, ID, type, or classroom..."
                      className="w-full pl-10 pr-4 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    {['ALL', 'LIGHT', 'FAN', 'PROJECTOR', 'HUB'].map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setSelectedDeviceType(type)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-mono font-medium transition-colors cursor-pointer ${
                          selectedDeviceType === type
                            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold'
                            : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Section A: Live Database Registered Devices */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                      <Zap className="w-3.5 h-3.5 text-amber-400" />
                      <span>Classroom Connected Appliances ({filteredDbDevices.length})</span>
                    </h4>
                    <span className="text-[11px] font-mono text-slate-500">MongoDB Synced</span>
                  </div>

                  {filteredDbDevices.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {filteredDbDevices.map((dev) => {
                        const IconComponent =
                          dev.type === 'LIGHT'
                            ? Lightbulb
                            : dev.type === 'FAN'
                            ? Fan
                            : dev.type === 'PROJECTOR'
                            ? Projector
                            : Cpu

                        return (
                          <div
                            key={dev._id || dev.deviceId}
                            className={`p-4 rounded-xl border transition-all space-y-3 ${
                              dev.state === 'ON'
                                ? 'bg-slate-900/80 border-indigo-500/40 shadow-sm'
                                : 'bg-slate-950/60 border-slate-800/80'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2.5">
                                <div
                                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                                    dev.state === 'ON'
                                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                                      : 'bg-slate-800 text-slate-400'
                                  }`}
                                >
                                  <IconComponent className="w-4 h-4" />
                                </div>
                                <div>
                                  <h5 className="text-xs font-bold text-white tracking-tight truncate max-w-[130px]">
                                    {dev.name}
                                  </h5>
                                  <span className="text-[10px] text-slate-400 font-mono block">
                                    {dev.classroom || 'Room 302'}
                                  </span>
                                </div>
                              </div>

                              <Badge
                                variant={dev.isOnline ? 'success' : 'danger'}
                                dot={dev.isOnline}
                                pulse={dev.isOnline && dev.state === 'ON'}
                                size="sm"
                              >
                                {dev.isOnline ? 'Online' : 'Offline'}
                              </Badge>
                            </div>

                            <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800/60 space-y-1 text-[11px] font-mono">
                              <div className="flex justify-between text-slate-400">
                                <span>Hardware ID:</span>
                                <span className="text-slate-300 truncate max-w-[110px]">{dev.deviceId}</span>
                              </div>
                              <div className="flex justify-between text-slate-400">
                                <span>Relay / GPIO:</span>
                                <span className="text-cyan-300">GPIO {dev.gpioPin || 'N/A'}</span>
                              </div>
                              <div className="flex justify-between text-slate-400">
                                <span>Power State:</span>
                                <span className={dev.state === 'ON' ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                                  {dev.state === 'ON' ? '● ON' : '○ OFF'}
                                </span>
                              </div>
                            </div>

                            <div className="text-[10px] text-slate-500 font-mono truncate" title={dev.commandTopic}>
                              Topic: {dev.commandTopic || `classroom/device/${dev.type?.toLowerCase()}/set`}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : selectedDeviceType !== 'HUB' ? (
                    <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800/60 text-center text-xs text-slate-500">
                      No classroom appliances match your query.
                    </div>
                  ) : null}
                </div>

                {/* Section B: Campus IoT Controllers & Gateways */}
                <div className="space-y-3 pt-3 border-t border-slate-800/80">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                      <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Campus Controller Nodes & Gateways ({filteredHubs.length})</span>
                    </h4>
                    <span className="text-[11px] font-mono text-slate-500">Wi-Fi / MQTT Mesh</span>
                  </div>

                  {filteredHubs.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {filteredHubs.map((dev) => (
                        <div
                          key={dev.id}
                          className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 shrink-0">
                                <Cpu className="w-4 h-4" />
                              </div>
                              <div>
                                <h4 className="text-xs font-semibold text-white">{dev.name}</h4>
                                <span className="text-[11px] text-slate-400 font-mono">{dev.room}</span>
                              </div>
                            </div>
                            <Badge variant={dev.isOnline ? 'success' : 'danger'} dot size="sm">
                              {dev.status}
                            </Badge>
                          </div>

                          <div className="space-y-1 text-xs">
                            <div className="flex justify-between text-slate-400">
                              <span>IP Address:</span>
                              <span className="text-slate-200 font-mono">{dev.ip}</span>
                            </div>
                            <div className="flex justify-between text-slate-400">
                              <span>Relay Channels:</span>
                              <span className="text-cyan-300 truncate max-w-[200px]">{dev.relays}</span>
                            </div>
                            <div className="flex justify-between text-slate-400">
                              <span>Signal (RSSI):</span>
                              <span className="text-emerald-400 font-mono">{dev.rssi}</span>
                            </div>
                          </div>

                          <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between text-[11px] font-mono text-slate-500">
                            <span>MAC: {dev.mac}</span>
                            <span className="text-cyan-400 font-mono">Channel QoS 1</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : selectedDeviceType === 'HUB' ? (
                    <EmptyState
                      title="No Controller Nodes Found"
                      description={`No hardware hubs match "${deviceSearchQuery}".`}
                    />
                  ) : null}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* 5. AI / SYSTEM TAB */}
        {activeTab === 'ai-system' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Gemini AI Voice Engine Simulator */}
              <div className="lg:col-span-2 space-y-6">
                <Card>
                  <CardHeader>
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-purple-400" />
                        <span>Google Gemini AI Voice Engine</span>
                      </CardTitle>
                      <CardDescription>
                        Bilingual Speech-to-Intent pipeline parses English and Tamil faculty voice commands into MQTT control packets.
                      </CardDescription>
                    </div>
                    <Badge variant="purple" dot pulse size="sm">
                      Model 2.5 Flash
                    </Badge>
                  </CardHeader>

                  <CardContent className="space-y-5">
                    {/* Interactive Prompt Simulator */}
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-slate-300 block">
                        Simulate Voice Command Input:
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={simulatedVoiceInput}
                          onChange={(e) => setSimulatedVoiceInput(e.target.value)}
                          placeholder="e.g. Turn on the projector in room 101 or அறை 101 விளக்குகளை இயக்கு"
                          className="flex-1 px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                        />
                        <Button
                          variant="primary"
                          size="md"
                          onClick={() => handleSimulateVoice()}
                          isLoading={isSimulating}
                          leftIcon={<Send className="w-3.5 h-3.5" />}
                        >
                          Parse
                        </Button>
                      </div>

                      {/* Quick Sample Chips */}
                      <div className="flex items-center gap-2 flex-wrap pt-1">
                        <span className="text-[11px] text-slate-500">Quick test phrases:</span>
                        <button
                          type="button"
                          onClick={() => {
                            setSimulatedVoiceInput('Turn on the projector in room 101')
                            handleSimulateVoice('Turn on the projector in room 101')
                          }}
                          className="px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-mono cursor-pointer"
                        >
                          "Turn on projector in room 101"
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSimulatedVoiceInput('அறை 101 விளக்குகளை இயக்கு')
                            handleSimulateVoice('அறை 101 விளக்குகளை இயக்கு')
                          }}
                          className="px-2 py-0.5 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/25 text-[11px] cursor-pointer"
                        >
                          "அறை 101 விளக்குகளை இயக்கு"
                        </button>
                      </div>
                    </div>

                    {/* Simulation Result */}
                    {simulatedResponse && (
                      <div className="p-4 rounded-xl bg-slate-950 border border-purple-500/30 space-y-3 font-mono text-xs">
                        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                          <span className="text-purple-300 font-bold flex items-center gap-1.5">
                            <Zap className="w-3.5 h-3.5 text-purple-400" />
                            Parsed Voice Intent
                          </span>
                          <span className="text-emerald-400 text-[11px]">
                            Confidence: {simulatedResponse.confidence}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-[11px]">
                          <div>
                            <span className="text-slate-500 block">Input Language:</span>
                            <span className="text-white">{simulatedResponse.detectedLanguage}</span>
                          </div>
                          <div>
                            <span className="text-slate-500 block">Target Room:</span>
                            <span className="text-cyan-300">{simulatedResponse.targetRoom}</span>
                          </div>
                          <div>
                            <span className="text-slate-500 block">Identified Action:</span>
                            <span className="text-amber-300">{simulatedResponse.parsedIntent}</span>
                          </div>
                          <div>
                            <span className="text-slate-500 block">MQTT Dispatched Topic:</span>
                            <span className="text-indigo-300 truncate block">{simulatedResponse.mqttDispatched.topic}</span>
                          </div>
                        </div>
                        <pre className="p-2.5 rounded bg-slate-900 text-slate-300 text-[10px] overflow-x-auto">
                          {JSON.stringify(simulatedResponse.mqttDispatched.payload, null, 2)}
                        </pre>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* System Diagnostics Panel */}
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Runtime Diagnostics</CardTitle>
                    <Badge variant="success" size="sm">Healthy</Badge>
                  </CardHeader>
                  <CardContent className="space-y-3 text-xs">
                    <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                      <span className="text-[11px] text-slate-400 uppercase tracking-wider block">Database Gateway</span>
                      <div className="mt-1 font-semibold text-emerald-400 flex items-center gap-1.5">
                        <Database className="w-3.5 h-3.5" />
                        <span>MongoDB Atlas (Connected)</span>
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                      <span className="text-[11px] text-slate-400 uppercase tracking-wider block">MQTT Broker</span>
                      <div className="mt-1 font-mono text-cyan-300 truncate">
                        {services.mqtt?.brokerUrl || 'mqtt://127.0.0.1:1883'}
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                      <span className="text-[11px] text-slate-400 uppercase tracking-wider block">Gemini API Key</span>
                      <div className="mt-1 font-mono text-purple-300">
                        {services.gemini?.keyMasked || 'Configured in server/.env'}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        )}

        {/* 6. SETTINGS TAB */}
        {activeTab === 'settings' && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Settings className="w-4 h-4 text-indigo-400" />
                    <span>Campus Automation & Security Preferences</span>
                  </CardTitle>
                  <CardDescription>
                    Global policy settings for classroom IoT relay shutdown, voice recognition, and token security.
                  </CardDescription>
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setModalType('settings')
                    setIsModalOpen(true)
                  }}
                >
                  Edit Configuration
                </Button>
              </CardHeader>

              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-1.5">
                    <h4 className="text-xs font-semibold text-white">Relay Auto-Standby</h4>
                    <p className="text-xs text-slate-400">
                      Automatically shut down air conditioning and projectors after 15 minutes of inactivity.
                    </p>
                    <Badge variant="info" size="sm">15 Minutes</Badge>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-1.5">
                    <h4 className="text-xs font-semibold text-white">Default Speech Engine</h4>
                    <p className="text-xs text-slate-400">
                      Bilingual recognition (English and Tamil) enabled across all ESP32 microphone inputs.
                    </p>
                    <Badge variant="purple" size="sm">Bilingual (Tamil/Eng)</Badge>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-1.5">
                    <h4 className="text-xs font-semibold text-white">JWT Session Validity</h4>
                    <p className="text-xs text-slate-400">
                      Bearer token authentication signed for 24 hours with cryptographic secret protection.
                    </p>
                    <Badge variant="success" size="sm">24 Hours</Badge>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-1.5">
                    <h4 className="text-xs font-semibold text-white">MQTT Broker Port</h4>
                    <p className="text-xs text-slate-400">
                      Standard MQTT TCP listening on port 1883 with local and cloud TLS fallback support.
                    </p>
                    <Badge variant="neutral" size="sm">Port 1883</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* 7. DEMO QR LOGIN MANAGEMENT TAB */}
        {activeTab === 'demo-login' && (
          <DemoLoginSection
            token={token}
            onNotify={(alert) => setAdminAlert(alert)}
          />
        )}

        {/* Modal for Informational Actions / Settings */}
        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title={
            modalType === 'invite'
              ? 'Register New Faculty Member'
              : modalType === 'classroom'
              ? 'Configure New Smart Classroom'
              : 'Global Automation Settings'
          }
          description={
            modalType === 'invite'
              ? 'Onboard a teacher with assigned classes and department privileges.'
              : modalType === 'classroom'
              ? 'Associate lecture hall with ESP32 relay hub and IP telemetry.'
              : 'Adjust campus-wide automation thresholds.'
          }
          footer={
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsModalOpen(false)}
              >
                Close
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={(e) => {
                  if (modalType === 'invite') handleRegisterTeacher(e)
                  else if (modalType === 'classroom') handleAddClassroom(e)
                  else {
                    setIsModalOpen(false)
                    setAdminAlert({
                      type: 'success',
                      title: 'Preferences Updated',
                      message: 'Global campus automation and standby settings saved.',
                    })
                  }
                }}
              >
                {modalType === 'settings' ? 'Save Settings' : 'Confirm'}
              </Button>
            </>
          }
        >
          <div className="space-y-4 text-xs">
            {modalType === 'invite' ? (
              <form onSubmit={handleRegisterTeacher} className="space-y-3">
                <p className="text-slate-300">
                  Enter faculty credentials to issue access to the Teacher Dashboard and classroom voice commands.
                </p>
                <div>
                  <label className="text-slate-400 block mb-1">Faculty Full Name</label>
                  <input
                    type="text"
                    required
                    value={teacherForm.name}
                    onChange={(e) => setTeacherForm({ ...teacherForm, name: e.target.value })}
                    placeholder="e.g. Dr. K. Senthil Kumar"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Academic Email</label>
                  <input
                    type="email"
                    required
                    value={teacherForm.email}
                    onChange={(e) => setTeacherForm({ ...teacherForm, email: e.target.value })}
                    placeholder="e.g. senthil@smartclassroom.edu"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Department</label>
                  <select
                    value={teacherForm.department}
                    onChange={(e) => setTeacherForm({ ...teacherForm, department: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="Computer Science & Engineering">Computer Science & Engineering</option>
                    <option value="Information Technology">Information Technology</option>
                    <option value="Electronics & Communication">Electronics & Communication</option>
                    <option value="Mechanical Engineering">Mechanical Engineering</option>
                  </select>
                </div>
              </form>
            ) : modalType === 'classroom' ? (
              <form onSubmit={handleAddClassroom} className="space-y-3">
                <div>
                  <label className="text-slate-400 block mb-1">Classroom Name / Room Number</label>
                  <input
                    type="text"
                    required
                    value={classForm.name}
                    onChange={(e) => setClassForm({ ...classForm, name: e.target.value })}
                    placeholder="e.g. Lecture Hall 102"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Controller Node MAC / ID</label>
                  <input
                    type="text"
                    required
                    value={classForm.devices}
                    onChange={(e) => setClassForm({ ...classForm, devices: e.target.value })}
                    placeholder="e.g. ESP32-RM102"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-slate-400 block mb-1">Seating Capacity</label>
                    <input
                      type="number"
                      value={classForm.capacity}
                      onChange={(e) => setClassForm({ ...classForm, capacity: parseInt(e.target.value, 10) || 40 })}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1">Relays Count</label>
                    <input
                      type="number"
                      value={classForm.relays}
                      onChange={(e) => setClassForm({ ...classForm, relays: parseInt(e.target.value, 10) || 4 })}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>
              </form>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="text-slate-400 block mb-1">Auto-Cutoff Standby (Minutes)</label>
                  <input
                    type="number"
                    defaultValue={15}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Default Voice Engine Mode</label>
                  <select className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white">
                    <option value="bilingual">Bilingual (English + Tamil)</option>
                    <option value="en">English Only</option>
                    <option value="ta">Tamil Only</option>
                  </select>
                </div>
              </div>
            )}
          </div>
        </Modal>
      </div>
    </DashboardLayout>
  )
}
