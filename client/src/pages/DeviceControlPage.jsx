import { useState, useEffect, useCallback, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Cpu,
  Zap,
  Lightbulb,
  Fan,
  Projector,
  Power,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Wifi,
  Radio,
  Sliders,
  ArrowLeft,
  ChevronDown,
  Layers,
  Sparkles,
  ShieldCheck,
  ShieldAlert,
  Activity,
  Terminal,
  Palette,
  Check,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useSocket, useSocketEvent } from '../context/SocketContext'
import { DashboardLayout } from '../components/layout'
import {
  Button,
  Badge,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  SiriCard,
  AlertBanner,
  CircularColorPicker,
  rgbToHex,
} from '../components/ui'
import { API_BASE_URL } from '../config/api'

// 7 Preset Quick Colors requested for Projector RGB lighting
const QUICK_COLORS = [
  { name: 'White', hex: '#FFFFFF', r: 255, g: 255, b: 255 },
  { name: 'Red', hex: '#EF4444', r: 255, g: 0, b: 0 },
  { name: 'Green', hex: '#22C55E', r: 0, g: 255, b: 0 },
  { name: 'Blue', hex: '#3B82F6', r: 0, g: 0, b: 255 },
  { name: 'Yellow', hex: '#EAB308', r: 255, g: 255, b: 0 },
  { name: 'Cyan', hex: '#06B6D4', r: 0, g: 255, b: 255 },
  { name: 'Purple', hex: '#A855F7', r: 255, g: 0, b: 255 },
]

export function DeviceControlPage() {
  const { user, token } = useAuth()
  const { joinClassroom, leaveClassroom } = useSocket()
  const navigate = useNavigate()

  const apiBaseUrl = API_BASE_URL

  // State: Selected Room
  const [selectedRoom, setSelectedRoom] = useState('Room 302')
  const [availableRooms, setAvailableRooms] = useState(['Room 302'])

  // State: Controller Node
  const [controllerNode, setControllerNode] = useState(null)
  const [isNodeOnline, setIsNodeOnline] = useState(true)

  // State: Control Channels (LIGHT, FAN, PROJECTOR)
  const [channels, setChannels] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState(null)

  // In-flight command tracking to prevent rapid duplicate clicks
  const [pendingCommands, setPendingCommands] = useState({})
  const inFlightRef = useRef({})

  // User feedback notification
  const [notification, setNotification] = useState(null)

  // State: Projector RGB Lighting Control
  const [projectorColor, setProjectorColor] = useState({ r: 255, g: 0, b: 255 })
  const [projectorColorPower, setProjectorColorPower] = useState('OFF')
  const [isColorUpdating, setIsColorUpdating] = useState(false)
  const [colorSyncStatus, setColorSyncStatus] = useState('synced') // 'synced' | 'pending' | 'syncing' | 'error'
  const debounceTimerRef = useRef(null)
  const isInteractingColorRef = useRef(false)

  // Subscribe to real-time classroom telemetry for selected room
  useEffect(() => {
    if (selectedRoom) {
      joinClassroom(selectedRoom)
      return () => {
        leaveClassroom(selectedRoom)
      }
    }
  }, [selectedRoom, joinClassroom, leaveClassroom])

  // Fetch all devices for the selected classroom from backend REST API
  const fetchRoomDevices = useCallback(async (showRefreshing = false) => {
    if (!token) return
    if (showRefreshing) setIsRefreshing(true)
    else setIsLoading(true)
    setError(null)

    try {
      // 1. Fetch devices specifically for this classroom
      const res = await fetch(`${apiBaseUrl}/api/devices?classroom=${encodeURIComponent(selectedRoom)}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      })

      if (!res.ok) {
        throw new Error(`Failed to fetch room devices (HTTP ${res.status})`)
      }

      const data = await res.json()
      const allDevices = data.devices || []

      // Identify physical controller node
      const node = allDevices.find(
        (d) => d.entityType === 'NODE' || d.deviceCategory === 'NODE' || d.type === 'OTHER'
      ) || {
        deviceId: `ESP32-${selectedRoom.replace(/\s+/g, '').toUpperCase()}-01`,
        name: `${selectedRoom} ESP32 Controller Node`,
        isOnline: false,
        classroom: selectedRoom,
      }

      setControllerNode(node)
      setIsNodeOnline(node.isOnline === true)

      // Identify the relay channels (Light, Fan, Projector)
      const channelDevices = allDevices.filter(
        (d) =>
          d.entityType === 'CHANNEL' ||
          d.deviceCategory === 'CHANNEL' ||
          (d.type !== 'OTHER' && ['LIGHT', 'FAN', 'PROJECTOR'].includes(d.type))
      )

      // Ensure ordering: LIGHT, FAN, PROJECTOR
      const typePriority = { LIGHT: 1, FAN: 2, PROJECTOR: 3 }
      channelDevices.sort((a, b) => (typePriority[a.type] || 99) - (typePriority[b.type] || 99))

      setChannels(channelDevices)

      // Initialize Projector RGB state from DB
      const proj = channelDevices.find((c) => c.type === 'PROJECTOR')
      if (proj) {
        if (proj.color) {
          setProjectorColor(proj.color)
        }
        if (proj.colorPower) {
          setProjectorColorPower(proj.colorPower)
        }
      }

      // 2. Discover all distinct classrooms across the system for the room selector
      const allRes = await fetch(`${apiBaseUrl}/api/devices`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      })
      if (allRes.ok) {
        const allData = await allRes.json()
        const rooms = Array.from(
          new Set((allData.devices || []).map((d) => d.classroom).filter(Boolean))
        )
        if (rooms.length > 0) {
          setAvailableRooms(rooms)
        }
      }
    } catch (err) {
      console.error('[DeviceControl] Fetch error:', err)
      setError(err.message || 'Unable to connect to backend device service.')
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [apiBaseUrl, token, selectedRoom])

  useEffect(() => {
    fetchRoomDevices()
  }, [fetchRoomDevices])

  // Real-Time Socket.IO Listener: Listen for "device:status"
  useSocketEvent('device:status', (incoming) => {
    if (!incoming || !incoming.deviceId) return
    console.log('[DeviceControl] ⚡ Socket update:', incoming.deviceId, incoming.state, incoming.isOnline)

    // A. Check if the incoming update is for the physical controller node
    if (
      incoming.type === 'OTHER' ||
      incoming.entityType === 'NODE' ||
      incoming.deviceCategory === 'NODE' ||
      (controllerNode && (incoming.deviceId === controllerNode.deviceId || incoming.id === controllerNode._id))
    ) {
      const nodeOnline = typeof incoming.isOnline === 'boolean' ? incoming.isOnline : false
      setIsNodeOnline(nodeOnline)
      setControllerNode((prev) => ({
        ...prev,
        isOnline: nodeOnline,
        lastSeenAt: incoming.lastSeenAt || new Date().toISOString(),
      }))

      // Also cascade online/availability to channels
      setChannels((prev) =>
        prev.map((ch) => ({
          ...ch,
          isOnline: nodeOnline,
        }))
      )

      setNotification({
        type: nodeOnline ? 'success' : 'warning',
        title: nodeOnline ? 'Controller Online' : 'Controller Offline',
        message: `Hardware Controller [${incoming.deviceId || 'ESP32'}] is now ${nodeOnline ? 'ONLINE' : 'OFFLINE'}.`,
      })
      return
    }

    // B. Check if incoming update is for one of the relay channels
    setChannels((prev) =>
      prev.map((ch) => {
        const isMatch =
          ch.deviceId === incoming.deviceId ||
          ch._id === incoming.id ||
          ch._id === incoming.deviceId ||
          (ch.type && incoming.type && ch.type.toUpperCase() === incoming.type.toUpperCase())

        if (isMatch) {
          // Clear any in-flight lock for this device
          if (inFlightRef.current[ch.deviceId]) {
            delete inFlightRef.current[ch.deviceId]
            setPendingCommands((p) => {
              const updated = { ...p }
              delete updated[ch.deviceId]
              return updated
            })
          }

          // If incoming update carries projector RGB lighting data
          if ((ch.type === 'PROJECTOR' || incoming.type === 'PROJECTOR') && !isInteractingColorRef.current) {
            if (incoming.color) {
              setProjectorColor(incoming.color)
            }
            if (incoming.colorPower) {
              setProjectorColorPower(incoming.colorPower)
            }
          }

          return {
            ...ch,
            state: incoming.state || ch.state,
            isOnline: typeof incoming.isOnline === 'boolean' ? incoming.isOnline : ch.isOnline,
            confirmedState: incoming.confirmedState || incoming.state || ch.confirmedState,
            lastConfirmedAt: incoming.lastConfirmedAt || new Date().toISOString(),
            lastSeenAt: incoming.lastSeenAt || new Date().toISOString(),
            color: incoming.color || ch.color,
            colorPower: incoming.colorPower || ch.colorPower,
          }
        }
        return ch
      })
    )
  })

  // Real-time listener for dedicated "device:color" Socket.IO event
  useSocketEvent('device:color', (incoming) => {
    if (!incoming) return
    console.log('[DeviceControl] 🎨 Projector RGB socket telemetry:', incoming)
    if (incoming.color && !isInteractingColorRef.current) {
      setProjectorColor(incoming.color)
    }
    if ((incoming.power || incoming.colorPower) && !isInteractingColorRef.current) {
      setProjectorColorPower(incoming.power || incoming.colorPower)
    }
    setColorSyncStatus('synced')
  })

  // Dispatch Projector RGB Color Command via Node backend REST API -> MQTT -> EMQX -> ESP32
  const dispatchProjectorColor = useCallback(
    async (targetColor, targetPower) => {
      const proj = channels.find((c) => c.type === 'PROJECTOR')
      if (!proj) return
      const devId = proj.deviceId || proj._id

      if (!isNodeOnline) {
        setNotification({
          type: 'danger',
          title: 'Action Blocked',
          message: 'Cannot send RGB command. Hardware controller node is offline.',
        })
        return
      }

      const nextPower = targetPower !== undefined ? targetPower : projectorColorPower
      const nextColor = targetColor !== undefined ? targetColor : projectorColor

      setIsColorUpdating(true)
      setColorSyncStatus('syncing')

      try {
        const res = await fetch(`${apiBaseUrl}/api/devices/${encodeURIComponent(devId)}/color`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            power: nextPower,
            color: nextColor,
          }),
        })

        const data = await res.json()
        if (res.ok && data.status === 'success') {
          setColorSyncStatus('synced')
          setChannels((prev) =>
            prev.map((c) =>
              c.type === 'PROJECTOR'
                ? {
                    ...c,
                    color: nextColor,
                    colorPower: nextPower,
                  }
                : c
            )
          )
        } else {
          setColorSyncStatus('error')
          setNotification({
            type: 'danger',
            title: 'RGB Command Failed',
            message: data.message || 'Failed to dispatch projector RGB command.',
          })
        }
      } catch (err) {
        console.error('[DeviceControl] Color dispatch error:', err)
        setColorSyncStatus('error')
        setNotification({
          type: 'danger',
          title: 'Network Error',
          message: 'Unable to communicate with device service for RGB command.',
        })
      } finally {
        setIsColorUpdating(false)
      }
    },
    [channels, isNodeOnline, apiBaseUrl, token, projectorColorPower, projectorColor]
  )

  // Toggle Projector Lighting Power (ON / OFF)
  const handleToggleLightingPower = () => {
    if (!isNodeOnline) {
      setNotification({
        type: 'danger',
        title: 'Hardware Offline',
        message: 'Controller node is offline. Lighting power controls are locked.',
      })
      return
    }

    const nextPower = projectorColorPower === 'ON' ? 'OFF' : 'ON'
    setProjectorColorPower(nextPower)
    dispatchProjectorColor(projectorColor, nextPower)
  }

  // Handle Quick Color Click: If lighting is ON, dispatches immediately
  const handleSelectQuickColor = (qc) => {
    if (!isNodeOnline) return
    const nextColor = { r: qc.r, g: qc.g, b: qc.b }
    setProjectorColor(nextColor)

    if (projectorColorPower === 'ON') {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
      dispatchProjectorColor(nextColor, 'ON')
    } else {
      setColorSyncStatus('pending')
    }
  }

  // Handle Circular Color Selector change: Smooth preview + 300ms debounce when lighting is ON
  const handleColorWheelChange = (newRgb) => {
    if (!isNodeOnline) return
    setProjectorColor(newRgb)
    setColorSyncStatus('pending')
    isInteractingColorRef.current = true

    if (projectorColorPower === 'ON') {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = setTimeout(() => {
        dispatchProjectorColor(newRgb, 'ON')
        isInteractingColorRef.current = false
      }, 300)
    } else {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = setTimeout(() => {
        isInteractingColorRef.current = false
      }, 500)
    }
  }

  // Handle Relay Channel Toggle Command (ON / OFF)
  const handleToggleChannel = async (channel) => {
    const devId = channel.deviceId || channel._id
    if (!devId) return

    // 1. Guard: Controller Node must be Online
    if (!isNodeOnline) {
      setNotification({
        type: 'danger',
        title: 'Action Blocked: Hardware Offline',
        message: `Cannot dispatch command to ${channel.name}. Controller node ${controllerNode?.deviceId || 'ESP32'} is disconnected from EMQX MQTT.`,
      })
      return
    }

    // 2. Guard: Prevent rapid duplicate clicks (Debounce / In-flight lock)
    if (inFlightRef.current[devId]) {
      console.warn(`[DeviceControl] Command for [${devId}] is already in-flight. Ignoring rapid click.`)
      return
    }

    inFlightRef.current[devId] = true
    setPendingCommands((prev) => ({ ...prev, [devId]: true }))

    const nextState = channel.state === 'ON' ? 'OFF' : 'ON'

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 8000)

      // Dispatch to EXISTING backend command endpoint: POST /api/devices/:id/command
      const res = await fetch(`${apiBaseUrl}/api/devices/${encodeURIComponent(devId)}/command`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ action: nextState }),
        signal: controller.signal,
      })
      clearTimeout(timeoutId)

      const result = await res.json()

      if (res.ok && result.status === 'success') {
        // Optimistically set the state in local array (Socket.IO will also confirm it)
        setChannels((prev) =>
          prev.map((c) =>
            (c.deviceId === devId || c._id === devId)
              ? {
                  ...c,
                  state: nextState,
                  lastConfirmedAt: new Date().toISOString(),
                }
              : c
          )
        )

        setNotification({
          type: 'success',
          title: 'Command Dispatched',
          message: `${channel.name} turned ${nextState} (MQTT published to ESP32).`,
        })
      } else {
        setNotification({
          type: 'danger',
          title: 'Command Failed',
          message: result.message || `Failed to turn ${channel.name} ${nextState}.`,
        })
      }
    } catch (err) {
      console.error('[DeviceControl] Command error:', err)
      const isTimeout = err.name === 'AbortError'
      setNotification({
        type: 'danger',
        title: isTimeout ? 'Command Timeout' : 'Network Error',
        message: isTimeout
          ? 'Backend or MQTT broker did not respond within 8 seconds.'
          : 'Unable to connect to the backend server to dispatch command.',
      })
    } finally {
      // Clear in-flight lock after small safety buffer
      setTimeout(() => {
        delete inFlightRef.current[devId]
        setPendingCommands((prev) => {
          const updated = { ...prev }
          delete updated[devId]
          return updated
        })
      }, 350)
    }
  }

  // Handle Bulk Turn All Relays ON / OFF
  const handleBulkToggle = async (targetState) => {
    if (!isNodeOnline) {
      setNotification({
        type: 'danger',
        title: 'Action Blocked',
        message: `Cannot execute bulk action. Controller node is offline.`,
      })
      return
    }

    const eligibleChannels = channels.filter((c) => c.state !== targetState)
    if (eligibleChannels.length === 0) {
      setNotification({
        type: 'info',
        title: 'Already in State',
        message: `All relay channels in ${selectedRoom} are already ${targetState}.`,
      })
      return
    }

    // Execute in parallel through backend command API
    for (const ch of eligibleChannels) {
      handleToggleChannel(ch)
    }
  }

  // Helper: Format timestamps gracefully
  const formatTime = (isoString) => {
    if (!isoString) return 'Just now'
    try {
      const date = new Date(isoString)
      if (isNaN(date.getTime())) return 'Just now'
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    } catch {
      return 'Just now'
    }
  }

  const channelsOnCount = channels.filter((c) => c.state === 'ON').length
  const availableChannelsCount = isNodeOnline ? channels.length : 0

  return (
    <DashboardLayout
      pageTitle="Digital Device Control"
      activeTab="devices"
      onTabChange={(tab) => navigate(`/admin#${tab}`)}
      onTriggerVoice={() => navigate('/admin#ai-system')}
    >
      <div className="w-full space-y-6">
        {/* Navigation & Header Breadcrumb Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              to="/admin#devices"
              className="w-9 h-9 rounded-2xl bg-white/80 border border-slate-200/80 shadow-xs flex items-center justify-center text-slate-600 hover:text-slate-900 hover:bg-white transition-all cursor-pointer"
              title="Return to Admin Dashboard"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
                  Digital Device Control
                </h1>
                <Badge variant="purple" size="sm">
                  Hardware Console
                </Badge>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Physical IoT relay switching via MQTT bus with live bidirectional state feedback.
              </p>
            </div>
          </div>

          {/* Room Selector & Telemetry Refresh Actions */}
          <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
            {/* Room Selector Dropdown */}
            <div className="relative">
              <select
                value={selectedRoom}
                onChange={(e) => setSelectedRoom(e.target.value)}
                className="appearance-none pl-3.5 pr-8 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 shadow-xs focus:outline-none focus:border-indigo-500 cursor-pointer"
              >
                {availableRooms.map((room) => (
                  <option key={room} value={room}>
                    {room}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            <Button
              variant="outline"
              size="sm"
              leftIcon={<RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />}
              onClick={() => fetchRoomDevices(true)}
              disabled={isRefreshing}
              className="rounded-xl h-8 px-3 text-xs"
            >
              Refresh
            </Button>
          </div>
        </div>

        {/* Dynamic Notification Toast / Banner */}
        {notification && (
          <AlertBanner
            variant={notification.type || 'info'}
            title={notification.title || 'System Notice'}
            message={notification.message}
            onDismiss={() => setNotification(null)}
          />
        )}

        {/* Error State Banner */}
        {error && (
          <AlertBanner
            variant="danger"
            title="Communication Error"
            message={error}
            onDismiss={() => setError(null)}
          />
        )}

        {/* Controller Node Hardware Status Master Banner */}
        <SiriCard className="overflow-hidden">
          <div className="p-5 sm:p-6 bg-white/70 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div
                className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-md ${
                  isNodeOnline
                    ? 'bg-gradient-to-tr from-emerald-500 to-teal-500 text-white shadow-emerald-500/25'
                    : 'bg-gradient-to-tr from-rose-500 to-red-600 text-white shadow-rose-500/25'
                }`}
              >
                <Cpu className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                    {controllerNode?.name || `${selectedRoom} Controller Node`}
                  </h2>
                  <Badge
                    variant={isNodeOnline ? 'success' : 'danger'}
                    dot
                    pulse={isNodeOnline}
                    size="sm"
                  >
                    {isNodeOnline ? 'Online' : 'Offline'}
                  </Badge>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-500 mt-1 flex-wrap font-mono">
                  <span>Node: <strong className="text-slate-800">{controllerNode?.deviceId || 'ESP32-RM302-01'}</strong></span>
                  <span>&bull;</span>
                  <span>Classroom: <strong className="text-slate-800">{selectedRoom}</strong></span>
                  <span>&bull;</span>
                  <span>MQTT Broker: <strong className={isNodeOnline ? 'text-emerald-600' : 'text-rose-600'}>{isNodeOnline ? 'Connected' : 'Disconnected'}</strong></span>
                </div>
              </div>
            </div>

            {/* Quick Bulk Relay Switch Controls */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                leftIcon={<Power className="w-3.5 h-3.5 text-rose-500" />}
                onClick={() => handleBulkToggle('OFF')}
                disabled={!isNodeOnline || channelsOnCount === 0}
                className="rounded-xl h-8 px-3 text-xs font-semibold"
              >
                All OFF
              </Button>
              <Button
                variant="primary"
                size="sm"
                leftIcon={<Power className="w-3.5 h-3.5 text-emerald-200" />}
                onClick={() => handleBulkToggle('ON')}
                disabled={!isNodeOnline || channelsOnCount === channels.length}
                className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl h-8 px-3 text-xs font-semibold shadow-xs"
              >
                All ON
              </Button>
            </div>
          </div>

          {/* Node Health & Telemetry Hairline Footer */}
          <div className="border-t border-slate-100/90 grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-100/90 bg-white/40 text-xs">
            <div className="p-3.5 sm:p-4">
              <span className="text-[10px] uppercase font-semibold text-slate-400 block tracking-wider">Physical IoT Nodes</span>
              <span className="text-sm font-bold text-slate-900 mt-0.5 block">1 Physical Node</span>
            </div>
            <div className="p-3.5 sm:p-4">
              <span className="text-[10px] uppercase font-semibold text-slate-400 block tracking-wider">Active Channels</span>
              <span className="text-sm font-bold text-slate-900 mt-0.5 block">
                {isNodeOnline ? `${channelsOnCount} ON / ${availableChannelsCount} Available` : '0 Controllable'}
              </span>
            </div>
            <div className="p-3.5 sm:p-4">
              <span className="text-[10px] uppercase font-semibold text-slate-400 block tracking-wider">Node Status</span>
              <span className={`text-sm font-bold mt-0.5 block ${isNodeOnline ? 'text-emerald-600' : 'text-rose-600'}`}>
                {isNodeOnline ? 'Online (Heartbeat Active)' : 'Offline (Disconnected)'}
              </span>
            </div>
            <div className="p-3.5 sm:p-4">
              <span className="text-[10px] uppercase font-semibold text-slate-400 block tracking-wider">Telemetry Last Seen</span>
              <span className="text-sm font-mono text-slate-600 mt-0.5 block truncate">
                {formatTime(controllerNode?.lastSeenAt)}
              </span>
            </div>
          </div>
        </SiriCard>

        {/* Offline Warning Alert when Node is Disconnected */}
        {!isNodeOnline && (
          <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200/80 text-amber-900 flex items-start gap-3 shadow-xs">
            <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-amber-800">
                Hardware Controller Offline ({controllerNode?.deviceId || 'ESP32-RM302-01'})
              </h4>
              <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">
                Appliance switches are automatically locked. As soon as the physical ESP32 controller powers on and connects to EMQX Cloud MQTT, controls will automatically unlock in real time.
              </p>
            </div>
          </div>
        )}

        {/* THREE MAIN CONTROL CARDS: 1. LIGHT, 2. FAN, 3. PROJECTOR */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 tracking-tight uppercase">
                Relay Output Channels ({channels.length})
              </h3>
              <p className="text-xs text-slate-500">
                Direct GPIO actuation with confirmed physical state verification.
              </p>
            </div>
            <Badge variant="neutral" size="sm">
              QoS 1 Confirmed
            </Badge>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[1, 2, 3].map((idx) => (
                <div
                  key={idx}
                  className="h-64 rounded-3xl bg-white/60 border border-slate-200/60 animate-pulse p-6"
                />
              ))}
            </div>
          ) : channels.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {channels.map((channel) => {
                const devId = channel.deviceId || channel._id
                const isOn = channel.state === 'ON'
                const isPending = !!pendingCommands[devId]
                const isAvailable = isNodeOnline

                // Icon and Color Theme Mapping
                let IconComponent = Lightbulb
                let activeColor = 'from-amber-400 to-amber-500'
                let activeShadow = 'shadow-amber-500/25'
                let iconBg = isOn ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-400'

                if (channel.type === 'FAN') {
                  IconComponent = Fan
                  activeColor = 'from-cyan-400 to-blue-500'
                  activeShadow = 'shadow-cyan-500/25'
                  iconBg = isOn ? 'bg-cyan-500 text-white' : 'bg-slate-100 text-slate-400'
                } else if (channel.type === 'PROJECTOR') {
                  IconComponent = Projector
                  activeColor = 'from-indigo-500 to-purple-600'
                  activeShadow = 'shadow-indigo-500/25'
                  iconBg = isOn ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400'
                }

                const isProjector = channel.type === 'PROJECTOR'
                const matchingQuickColor = QUICK_COLORS.find(
                  (qc) => qc.r === projectorColor.r && qc.g === projectorColor.g && qc.b === projectorColor.b
                )
                const isCustomColor = !matchingQuickColor

                return (
                  <Card
                    key={devId}
                    className={`overflow-hidden transition-all duration-300 relative border ${
                      isProjector ? 'col-span-1 md:col-span-2 lg:col-span-3' : 'col-span-1'
                    } ${
                      isOn && isAvailable
                        ? 'border-indigo-200/80 shadow-md shadow-indigo-500/5'
                        : 'border-slate-200/70 hover:border-slate-300/80'
                    }`}
                  >
                    {/* Top Status Bar of Card */}
                    <div className="p-5 sm:p-6 pb-4 flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 transition-transform duration-300 shadow-md ${iconBg} ${
                            isOn ? activeShadow : ''
                          }`}
                        >
                          <IconComponent className={`w-6 h-6 ${isOn && channel.type === 'FAN' ? 'animate-spin' : ''}`} />
                        </div>
                        <div>
                          <h4 className="text-base font-bold text-slate-900 tracking-tight leading-tight">
                            {channel.name}
                          </h4>
                          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mt-0.5">
                            {channel.type} CHANNEL
                          </span>
                        </div>
                      </div>

                      {/* State Pill (ON / OFF) */}
                      <Badge
                        variant={isOn ? 'success' : 'neutral'}
                        dot={isOn}
                        pulse={isOn}
                        size="md"
                        className="font-bold text-xs px-2.5 py-0.5"
                      >
                        {isOn ? '● ON' : '○ OFF'}
                      </Badge>
                    </div>

                    {/* Middle Telemetry Specs Table */}
                    <div className="px-5 sm:px-6 py-3 bg-slate-50/60 border-y border-slate-100/90 text-xs font-mono space-y-2">
                      <div className="flex items-center justify-between text-slate-500">
                        <span>GPIO Output Pin:</span>
                        <strong className="text-slate-800">
                          {isProjector ? `GPIO ${channel.gpioPin ?? 21} (Relay) | GPIO 25, 27, 32 (RGB)` : `GPIO ${channel.gpioPin ?? 'N/A'}`}
                        </strong>
                      </div>
                      <div className="flex items-center justify-between text-slate-500">
                        <span>Connection Availability:</span>
                        <span className={`flex items-center gap-1 font-semibold ${isAvailable ? 'text-emerald-600' : 'text-rose-500'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${isAvailable ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                          {isAvailable ? 'Available' : 'Unavailable (Node Offline)'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-slate-500">
                        <span>Last State Update:</span>
                        <span className="text-slate-600">{formatTime(channel.lastConfirmedAt || channel.lastSeenAt)}</span>
                      </div>
                      <div className="flex items-center justify-between text-slate-400 text-[11px] pt-1 border-t border-slate-200/50">
                        <span>Device ID:</span>
                        <span className="text-slate-500 truncate max-w-[140px]">{channel.deviceId}</span>
                      </div>
                    </div>

                    {/* Interactive Toggle Actuator Section (Projector AC Relay Switch) */}
                    <div className="p-5 sm:p-6 flex items-center justify-between gap-4 bg-white/40">
                      <div>
                        <span className="text-xs font-medium text-slate-600 block">
                          {isProjector ? 'Projector AC Relay Power' : 'Physical Switch'}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          {isPending ? 'Sending MQTT packet...' : isAvailable ? (isOn ? 'Click to Turn OFF' : 'Click to Turn ON') : 'Controls locked'}
                        </span>
                      </div>

                      {/* Main Tactical Toggle Button */}
                      <button
                        type="button"
                        onClick={() => handleToggleChannel(channel)}
                        disabled={!isAvailable || isPending}
                        title={!isAvailable ? 'Controller node is offline' : `Turn ${isOn ? 'OFF' : 'ON'}`}
                        className={`relative inline-flex items-center justify-center h-10 px-5 rounded-2xl font-bold text-xs tracking-tight transition-all duration-200 cursor-pointer shadow-sm disabled:cursor-not-allowed disabled:opacity-50 ${
                          isOn
                            ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white hover:from-emerald-500 hover:to-teal-500 shadow-emerald-500/20 active:scale-95'
                            : 'bg-slate-900 text-white hover:bg-slate-800 active:scale-95'
                        }`}
                      >
                        {isPending ? (
                          <div className="flex items-center gap-2">
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>Updating...</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <Power className={`w-3.5 h-3.5 ${isOn ? 'text-emerald-200' : 'text-slate-400'}`} />
                            <span>{isOn ? 'SWITCH OFF' : 'SWITCH ON'}</span>
                          </div>
                        )}
                      </button>
                    </div>

                    {/* DEDICATED PROJECTOR RGB LIGHTING CONTROL SECTION */}
                    {isProjector && (
                      <div className="border-t border-slate-100 bg-gradient-to-b from-slate-50/80 via-white to-slate-50/40 p-5 sm:p-6 space-y-5">
                        {/* Section Header */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                          <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-purple-500 via-fuchsia-500 to-indigo-500 flex items-center justify-center text-white shadow-xs">
                              <Palette className="w-4 h-4" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <h5 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                                  Projector RGB Lighting Control
                                </h5>
                                <Badge variant="purple" size="xs">
                                  GPIO 25, 27, 32
                                </Badge>
                              </div>
                              <span className="text-[11px] font-mono text-slate-400 block mt-0.5">
                                Topic: smartclassroom/room302/projector/color/command
                              </span>
                            </div>
                          </div>

                          {/* Projector Lighting Power Segmented Toggle (ON / OFF) */}
                          <div className="flex items-center gap-2.5 self-start sm:self-auto">
                            <span className="text-xs font-semibold text-slate-600">Lighting Power:</span>
                            <div className="inline-flex p-0.5 bg-slate-200/80 rounded-xl shadow-inner">
                              <button
                                type="button"
                                onClick={handleToggleLightingPower}
                                disabled={!isAvailable || isColorUpdating}
                                title={!isAvailable ? 'Controller offline' : 'Turn Lighting Power ON'}
                                className={`px-3.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                                  projectorColorPower === 'ON'
                                    ? 'bg-emerald-600 text-white shadow-xs'
                                    : 'text-slate-600 hover:text-slate-900'
                                }`}
                              >
                                ON
                              </button>
                              <button
                                type="button"
                                onClick={handleToggleLightingPower}
                                disabled={!isAvailable || isColorUpdating}
                                title={!isAvailable ? 'Controller offline' : 'Turn Lighting Power OFF'}
                                className={`px-3.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                                  projectorColorPower === 'OFF'
                                    ? 'bg-slate-700 text-white shadow-xs'
                                    : 'text-slate-600 hover:text-slate-900'
                                }`}
                              >
                                OFF
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Interactive RGB Control Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
                          {/* 1. Circular Color Selector */}
                          <div className="md:col-span-5 flex flex-col items-center justify-center p-4 bg-white rounded-2xl border border-slate-100 shadow-xs">
                            <CircularColorPicker
                              color={projectorColor}
                              power={projectorColorPower}
                              onChange={handleColorWheelChange}
                              disabled={!isAvailable}
                              size={175}
                            />
                            <span className="text-[11px] text-slate-400 mt-2 font-medium text-center">
                              Click or drag along the ring to select any color
                            </span>
                          </div>

                          {/* 2. Values Display, Live Preview Swatch, Quick Colors, Apply Button */}
                          <div className="md:col-span-7 space-y-4">
                            {/* Live Preview Circle & Selected RGB Values Badges */}
                            <div className="p-4 rounded-2xl bg-white border border-slate-100 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                              <div className="flex items-center gap-3">
                                {/* Live Preview Swatch Circle */}
                                <div
                                  className="w-12 h-12 rounded-2xl border-2 border-white shadow-md transition-all duration-300 shrink-0"
                                  style={{
                                    backgroundColor:
                                      projectorColorPower === 'ON'
                                        ? `rgb(${projectorColor.r}, ${projectorColor.g}, ${projectorColor.b})`
                                        : '#475569',
                                    boxShadow:
                                      projectorColorPower === 'ON'
                                        ? `0 0 22px rgba(${projectorColor.r}, ${projectorColor.g}, ${projectorColor.b}, 0.55)`
                                        : 'none',
                                  }}
                                />
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold text-slate-900">
                                      {matchingQuickColor ? matchingQuickColor.name : 'Custom Selection'}
                                    </span>
                                    {isCustomColor ? (
                                      <Badge variant="purple" size="xs">
                                        Custom
                                      </Badge>
                                    ) : (
                                      <Badge variant="neutral" size="xs">
                                        Preset
                                      </Badge>
                                    )}
                                  </div>
                                  <span className="text-xs font-mono font-bold text-slate-500 block mt-0.5">
                                    {rgbToHex(projectorColor.r, projectorColor.g, projectorColor.b)}
                                  </span>
                                </div>
                              </div>

                              {/* Numeric Readout: R: 255, G: 0, B: 255 */}
                              <div className="flex items-center gap-1.5 font-mono text-xs">
                                <span className="px-2.5 py-1 bg-rose-50 text-rose-700 border border-rose-200/80 rounded-lg font-bold">
                                  R: {projectorColor.r}
                                </span>
                                <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200/80 rounded-lg font-bold">
                                  G: {projectorColor.g}
                                </span>
                                <span className="px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200/80 rounded-lg font-bold">
                                  B: {projectorColor.b}
                                </span>
                              </div>
                            </div>

                            {/* Quick Colors Set: White, Red, Green, Blue, Yellow, Cyan, Purple */}
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                                  Quick Colors ({QUICK_COLORS.length})
                                </span>
                                <span className="text-[11px] text-slate-400">
                                  {projectorColorPower === 'ON' ? 'Instant actuation' : 'Power is OFF'}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 flex-wrap">
                                {QUICK_COLORS.map((qc) => {
                                  const isSelected =
                                    projectorColor.r === qc.r &&
                                    projectorColor.g === qc.g &&
                                    projectorColor.b === qc.b

                                  return (
                                    <button
                                      key={qc.name}
                                      type="button"
                                      onClick={() => handleSelectQuickColor(qc)}
                                      disabled={!isAvailable}
                                      title={`${qc.name} (R:${qc.r}, G:${qc.g}, B:${qc.b})`}
                                      className={`group relative flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                                        isSelected
                                          ? 'border-indigo-500 bg-indigo-50/80 text-indigo-900 shadow-xs ring-2 ring-indigo-500/20'
                                          : 'border-slate-200/80 bg-white hover:border-slate-300 text-slate-700'
                                      }`}
                                    >
                                      <span
                                        className="w-3.5 h-3.5 rounded-full border border-black/10 shrink-0 shadow-xs"
                                        style={{ backgroundColor: qc.hex }}
                                      />
                                      <span>{qc.name}</span>
                                    </button>
                                  )
                                })}
                              </div>
                            </div>

                            {/* Telemetry Status Bar & Apply Color Button */}
                            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                              <div className="flex items-center gap-2 text-xs">
                                <span
                                  className={`w-2 h-2 rounded-full ${
                                    colorSyncStatus === 'syncing'
                                      ? 'bg-amber-500 animate-ping'
                                      : colorSyncStatus === 'synced'
                                      ? 'bg-emerald-500'
                                      : 'bg-slate-400'
                                  }`}
                                />
                                <span className="text-slate-500 font-mono text-[11px]">
                                  {colorSyncStatus === 'syncing'
                                    ? 'Publishing MQTT to ESP32...'
                                    : colorSyncStatus === 'synced'
                                    ? 'Synced to ESP32 (EMQX TLS)'
                                    : 'Pending Apply'}
                                </span>
                              </div>

                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => dispatchProjectorColor(projectorColor, projectorColorPower)}
                                disabled={!isAvailable || isColorUpdating}
                                className="rounded-xl h-8 px-3 text-xs font-bold"
                              >
                                {isColorUpdating ? (
                                  <div className="flex items-center gap-1.5">
                                    <RefreshCw className="w-3 h-3 animate-spin" />
                                    <span>Applying...</span>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1.5">
                                    <Check className="w-3 h-3 text-emerald-600" />
                                    <span>Apply Color</span>
                                  </div>
                                )}
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </Card>
                )
              })}
            </div>
          ) : (
            <div className="p-10 rounded-3xl bg-white/70 border border-slate-200/70 text-center space-y-3">
              <Cpu className="w-8 h-8 text-slate-400 mx-auto" />
              <h4 className="text-sm font-bold text-slate-800">No Relay Channels Configured</h4>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                No active relay channels were found for {selectedRoom}.
              </p>
            </div>
          )}
        </div>

        {/* System Architecture Reference Card */}
        <Card className="p-5 sm:p-6 bg-slate-900 text-slate-200 border-slate-800">
          <div className="flex items-center gap-3 mb-3">
            <Terminal className="w-4 h-4 text-cyan-400" />
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-100">
              Backend Architecture & Data Path
            </h4>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 text-center text-xs font-mono">
            <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800">
              <span className="text-[10px] text-slate-400 block">1. Client Layer</span>
              <strong className="text-cyan-400 block mt-1">React Web UI</strong>
              <span className="text-[10px] text-slate-500">REST API Command</span>
            </div>
            <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800">
              <span className="text-[10px] text-slate-400 block">2. Controller</span>
              <strong className="text-indigo-400 block mt-1">Node Express</strong>
              <span className="text-[10px] text-slate-500">POST /command</span>
            </div>
            <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800">
              <span className="text-[10px] text-slate-400 block">3. Cloud Broker</span>
              <strong className="text-amber-400 block mt-1">EMQX MQTT</strong>
              <span className="text-[10px] text-slate-500">TLS Port 8883</span>
            </div>
            <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800">
              <span className="text-[10px] text-slate-400 block">4. Physical IoT</span>
              <strong className="text-emerald-400 block mt-1">ESP32-RM302-01</strong>
              <span className="text-[10px] text-slate-500">GPIO 23/22/21 Relays</span>
            </div>
            <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800">
              <span className="text-[10px] text-slate-400 block">5. Live Feedback</span>
              <strong className="text-purple-400 block mt-1">Socket.IO</strong>
              <span className="text-[10px] text-slate-500">No page reload</span>
            </div>
          </div>
        </Card>
      </div>
    </DashboardLayout>
  )
}
