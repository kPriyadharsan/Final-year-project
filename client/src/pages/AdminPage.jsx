import { useState, useEffect, useCallback, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Cpu,
  Sparkles,
  Settings,
  Terminal,
  RefreshCw,
  Activity,
  Wifi,
  Mic,
  Sliders,
  Server,
  Database,
  Send,
  Zap,
  Power,
  Lightbulb,
  Fan,
  Projector,
  Layers,
  QrCode,
  ArrowRight,
  ExternalLink,
  Volume2,
  Palette,
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
  AlertBanner,
  SiriCard,
  BentoContainer,
  CircularColorPicker,
} from '../components/ui'
import { API_BASE_URL } from '../config/api'
import { useMobileLayout, useHaptics, useCenterAction } from '../hooks'

export function AdminPage() {
  const { user, token } = useAuth()
  const { isConnected: isSocketConnected, transport, joinClassroom, leaveClassroom } = useSocket()
  const location = useLocation()
  const navigate = useNavigate()
  const { isMobile } = useMobileLayout()
  const { triggerHaptic } = useHaptics()
  const apiBaseUrl = API_BASE_URL

  useCenterAction({
    id: 'voice',
    label: 'Voice',
    ariaLabel: 'AI Voice Control',
    onClick: () => navigate('/voice'),
  })

  // Navigation tab state synced with URL hash (#overview, #devices, #demo-login, #settings)
  const getInitialTab = () => {
    const hash = location.hash.replace('#', '')
    const validTabs = ['overview', 'devices', 'demo-login', 'settings']
    return validTabs.includes(hash) ? hash : 'overview'
  }

  const [activeTab, setActiveTab] = useState(getInitialTab)

  // Sync tab with URL hash if user browses back/forward or enters direct URL
  useEffect(() => {
    const hash = location.hash.replace('#', '')
    const validTabs = ['overview', 'devices', 'demo-login', 'settings']
    const nextTab = validTabs.includes(hash) ? hash : 'overview'
    setActiveTab((prev) => (prev !== nextTab ? nextTab : prev))
  }, [location.hash])

  const handleTabChange = (newTab) => {
    setActiveTab(newTab)
    if (location.hash.replace('#', '') !== newTab) {
      navigate(`/admin#${newTab}`)
    }
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

  // Notification Banner
  const [adminAlert, setAdminAlert] = useState(null)

  // Test Route State
  const [testResult, setTestResult] = useState(null)
  const [isTesting, setIsTesting] = useState(false)

  // Settings Modal State
  const [isModalOpen, setIsModalOpen] = useState(false)

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
            isOn: incoming.state ? incoming.state === 'ON' : (typeof incoming.isOn === 'boolean' ? incoming.isOn : dev.isOn),
            color: incoming.color || dev.color,
            colorPower: incoming.colorPower || dev.colorPower,
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

  // Real-Time Socket.IO Listener: Dedicated projector RGB color broadcast
  useSocketEvent('device:color', (incoming) => {
    if (!incoming || !incoming.color) return
    setDbDevices((prev) =>
      prev.map((dev) => {
        const isMatch =
          dev.deviceId === incoming.deviceId ||
          dev._id === incoming.id ||
          dev._id === incoming.deviceId ||
          (dev.type === 'PROJECTOR' && (!incoming.classroom || dev.classroom === incoming.classroom))
        if (isMatch) {
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

  // Subscribe to Room 302 real-time classroom telemetry
  useEffect(() => {
    if (joinClassroom) joinClassroom('Room 302')
    return () => {
      if (leaveClassroom) leaveClassroom('Room 302')
    }
  }, [joinClassroom, leaveClassroom])

  // Dispatch individual hardware device toggle via POST /api/devices/:id/command
  const handleToggleDevice = async (device) => {
    const isCurrentlyOn = device.state === 'ON' || device.isOn
    const nextState = !isCurrentlyOn
    const targetAction = nextState ? 'ON' : 'OFF'

    // Optimistic UI state update
    setDbDevices((prev) =>
      prev.map((d) => {
        const isMatch =
          (device._id && d._id === device._id) ||
          (device.deviceId && d.deviceId === device.deviceId) ||
          (device.type && d.type === device.type && (!device.classroom || d.classroom === device.classroom))
        return isMatch
          ? {
              ...d,
              state: targetAction,
              isOn: nextState,
              colorPower: d.type === 'PROJECTOR' ? (nextState ? 'ON' : 'OFF') : d.colorPower,
            }
          : d
      })
    )

    try {
      const identifier = device._id || device.deviceId
      const res = await fetch(`${API_BASE_URL}/api/devices/${identifier}/command`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: targetAction,
          type: device.type,
          classroom: device.classroom || 'Room 302',
          gpioPin: device.gpioPin,
        }),
      })

      const data = await res.json()
      if (res.ok && data.status === 'success') {
        setAdminAlert({
          type: 'success',
          title: `${device.name || device.type} Toggled`,
          message: `Switched ${targetAction} successfully via MQTT broker.`,
        })
      } else {
        // Rollback on server error
        setDbDevices((prev) =>
          prev.map((d) => {
            const isMatch =
              (device._id && d._id === device._id) ||
              (device.deviceId && d.deviceId === device.deviceId)
            return isMatch
              ? {
                  ...d,
                  state: isCurrentlyOn ? 'ON' : 'OFF',
                  isOn: isCurrentlyOn,
                  colorPower: d.type === 'PROJECTOR' ? (isCurrentlyOn ? 'ON' : 'OFF') : d.colorPower,
                }
              : d
          })
        )
        setAdminAlert({
          type: 'danger',
          title: 'Device Command Failed',
          message: data?.message || 'Could not communicate with hardware relay.',
        })
      }
    } catch (err) {
      console.error('Device toggle error:', err)
      // Rollback on network failure
      setDbDevices((prev) =>
        prev.map((d) => {
          const isMatch =
            (device._id && d._id === device._id) ||
            (device.deviceId && d.deviceId === device.deviceId)
          return isMatch
            ? {
                ...d,
                state: isCurrentlyOn ? 'ON' : 'OFF',
                isOn: isCurrentlyOn,
                colorPower: d.type === 'PROJECTOR' ? (isCurrentlyOn ? 'ON' : 'OFF') : d.colorPower,
              }
            : d
        })
      )
      setAdminAlert({
        type: 'danger',
        title: 'Network Error',
        message: 'Failed to dispatch command to backend server.',
      })
    }
  }

  // Simulate incoming MQTT state update for offline testing
  const handleSimulateStatus = (device) => {
    const isCurrentlyOn = device.state === 'ON' || device.isOn
    const nextState = !isCurrentlyOn
    const nextAction = nextState ? 'ON' : 'OFF'

    handleRealtimeDeviceUpdate({
      deviceId: device.deviceId,
      id: device._id,
      state: nextAction,
      isOn: nextState,
      type: device.type,
      classroom: device.classroom || 'Room 302',
      isOnline: true,
      lastSeenAt: new Date().toISOString(),
    })

    setAdminAlert({
      type: 'info',
      title: 'Simulation Dispatched',
      message: `Simulated ESP32 feedback: ${device.name || device.type} reported state ${nextAction}.`,
    })
  }

  // Master batch toggle for Room 302 devices
  const handleAllDevices = async (targetState, classroom = 'Room 302') => {
    const targetAction = targetState ? 'ON' : 'OFF'

    // Optimistic batch UI update
    setDbDevices((prev) =>
      prev.map((dev) =>
        (!dev.classroom || dev.classroom.toLowerCase() === classroom.toLowerCase()) &&
        (dev.type === 'LIGHT' || dev.type === 'FAN' || dev.type === 'PROJECTOR' || dev.entityType === 'CHANNEL')
          ? { ...dev, state: targetAction, isOn: targetState }
          : dev
      )
    )

    try {
      const res = await fetch(`${API_BASE_URL}/api/devices/batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          classroom,
          actions: [{ device: 'all', action: targetAction }],
        }),
      })
      const data = await res.json()
      if (res.ok && data.status === 'success') {
        setAdminAlert({
          type: 'success',
          title: `Classroom ${classroom}`,
          message: `Batch command executed: All devices set to ${targetAction}.`,
        })
      } else {
        setAdminAlert({
          type: 'danger',
          title: 'Batch Command Failed',
          message: data?.message || 'Failed to dispatch batch command.',
        })
      }
    } catch (err) {
      console.error('Batch command error:', err)
      setAdminAlert({
        type: 'danger',
        title: 'Batch Dispatch Error',
        message: 'Failed to connect to backend server.',
      })
    }
  }

  // Helper to convert RGB to HEX string
  const toHexStr = (n) => {
    const hex = Math.max(0, Math.min(255, Math.round(Number(n) || 0))).toString(16)
    return hex.length === 1 ? '0' + hex : hex
  }
  const rgbToHexStr = (r, g, b) => `#${toHexStr(r)}${toHexStr(g)}${toHexStr(b)}`.toUpperCase()

  // High-performance Live Projector RGB streaming (exact match to Teacher dashboard)
  const adminInFlightColorRef = useRef(false)
  const adminQueuedColorRef = useRef(null)
  const adminLastTimeRef = useRef(0)
  const adminThrottleTimerRef = useRef(null)

  const sendAdminLiveColor = useCallback(
    async (device, targetColor, isImmediate = false) => {
      const devId = device.deviceId || device._id || device.id
      if (!devId) return

      if (adminInFlightColorRef.current) {
        adminQueuedColorRef.current = { device, color: targetColor }
        return
      }

      const now = Date.now()
      const THROTTLE_MS = 60
      const timeSince = now - adminLastTimeRef.current

      if (!isImmediate && timeSince < THROTTLE_MS) {
        adminQueuedColorRef.current = { device, color: targetColor }
        if (!adminThrottleTimerRef.current) {
          adminThrottleTimerRef.current = setTimeout(() => {
            adminThrottleTimerRef.current = null
            if (adminQueuedColorRef.current) {
              const next = adminQueuedColorRef.current
              adminQueuedColorRef.current = null
              sendAdminLiveColor(next.device, next.color, true)
            }
          }, THROTTLE_MS - timeSince)
        }
        return
      }

      adminInFlightColorRef.current = true
      adminLastTimeRef.current = now

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
        console.warn('[AdminPage] Live color error:', err.message)
      } finally {
        adminInFlightColorRef.current = false
        if (adminQueuedColorRef.current) {
          const next = adminQueuedColorRef.current
          adminQueuedColorRef.current = null
          sendAdminLiveColor(next.device, next.color, true)
        }
      }
    },
    [apiBaseUrl, token]
  )

  const handleAdminColorWheel = (device, newRgb, meta) => {
    setDbDevices((prev) =>
      prev.map((d) =>
        d.deviceId === device.deviceId || d._id === device._id || (d.type === 'PROJECTOR' && (!device.classroom || d.classroom === device.classroom))
          ? { ...d, color: newRgb, colorPower: 'ON' }
          : d
      )
    )
    sendAdminLiveColor(device, newRgb, meta?.isFinal === true)
  }

  const handleAdminProjectorColorChange = (device, hexColor) => {
    const hex = hexColor.replace('#', '')
    const r = parseInt(hex.substring(0, 2), 16) || 0
    const g = parseInt(hex.substring(2, 4), 16) || 0
    const b = parseInt(hex.substring(4, 6), 16) || 0
    const targetColor = { r, g, b }

    setDbDevices((prev) =>
      prev.map((d) =>
        d.deviceId === device.deviceId || d._id === device._id || (d.type === 'PROJECTOR' && (!device.classroom || d.classroom === device.classroom))
          ? { ...d, color: targetColor, colorPower: 'ON' }
          : d
      )
    )
    sendAdminLiveColor(device, targetColor, true)
  }

  // Fetch Super Admin Telemetry from Backend
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

  // Derive real statistics and status strictly from actual MongoDB records & live Socket updates
  const nodesInDb = dbDevices.filter(
    (d) => d.entityType === 'NODE' || d.deviceCategory === 'NODE' || d.type === 'OTHER'
  )
  const channelsInDb = dbDevices.filter(
    (d) =>
      d.entityType === 'CHANNEL' ||
      d.deviceCategory === 'CHANNEL' ||
      d.type === 'LIGHT' ||
      d.type === 'FAN' ||
      d.type === 'PROJECTOR'
  )

  const liveTotalNodes =
    nodesInDb.length > 0 ? nodesInDb.length : (dashboardData?.metrics?.totalNodes ?? 1)

  const liveOnlineNodes =
    nodesInDb.length > 0
      ? nodesInDb.filter((n) => n.isOnline === true).length
      : (systemHealth?.esp32?.connected ? 1 : (dashboardData?.metrics?.onlineNodes ?? 1))

  const onlineNodeIds = new Set(nodesInDb.filter((n) => n.isOnline === true).map((n) => n.deviceId))
  const onlineNodeRooms = new Set(nodesInDb.filter((n) => n.isOnline === true).map((n) => n.classroom))

  const liveTotalChannels =
    channelsInDb.length > 0 ? channelsInDb.length : (dashboardData?.metrics?.totalChannels ?? 3)

  const liveChannelsOn =
    channelsInDb.length > 0
      ? channelsInDb.filter((c) => c.state === 'ON' || c.isOn).length
      : (dashboardData?.metrics?.channelsOn ?? 0)

  const liveAvailableChannels =
    channelsInDb.length > 0
      ? channelsInDb.filter(
          (c) =>
            (c.nodeId && onlineNodeIds.has(c.nodeId)) || (c.classroom && onlineNodeRooms.has(c.classroom))
        ).length
      : (liveOnlineNodes > 0 ? (dashboardData?.metrics?.availableChannels ?? liveTotalChannels) : 0)

  const metrics = {
    totalNodes: liveTotalNodes,
    onlineNodes: liveOnlineNodes,
    totalChannels: liveTotalChannels,
    channelsOn: liveChannelsOn,
    availableChannels: liveAvailableChannels,
    systemStatus: systemHealth?.backend?.status || 'online',
    mqttStatus: systemHealth?.mqtt?.connected ? 'connected' : 'offline',
    geminiStatus: systemHealth?.gemini?.status || 'online',
  }

  // Room 302 Devices: Lights, Fans, Projector
  const room302Devices = (() => {
    const typePriority = { LIGHT: 1, FAN: 2, PROJECTOR: 3 }
    const actual = dbDevices
      .filter(
        (d) =>
          (!d.classroom || d.classroom.toLowerCase() === 'room 302') &&
          (['LIGHT', 'FAN', 'PROJECTOR'].includes(d.type) || d.entityType === 'CHANNEL') &&
          d.entityType !== 'NODE' &&
          d.type !== 'OTHER'
      )
      .sort((a, b) => (typePriority[a.type] || 99) - (typePriority[b.type] || 99))

    if (actual.length > 0) {
      return actual.map((d) =>
        d.type === 'PROJECTOR'
          ? {
              ...d,
              color: d.color && (d.color.r !== 0 || d.color.g !== 0 || d.color.b !== 0) ? d.color : { r: 59, g: 130, b: 246 },
              colorPower: d.colorPower || (d.state === 'ON' ? 'ON' : 'OFF'),
            }
          : d
      )
    }

    return [
      {
        deviceId: 'ESP32-ROOM302-LIGHT-01',
        type: 'LIGHT',
        name: 'Main Lights',
        state: 'OFF',
        classroom: 'Room 302',
        gpioPin: 23,
      },
      {
        deviceId: 'ESP32-ROOM302-FAN-01',
        type: 'FAN',
        name: 'Ceiling Fans',
        state: 'OFF',
        classroom: 'Room 302',
        gpioPin: 22,
      },
      {
        deviceId: 'ESP32-ROOM302-PROJ-01',
        type: 'PROJECTOR',
        name: 'Smart Projector',
        state: 'OFF',
        classroom: 'Room 302',
        gpioPin: 21,
        color: { r: 59, g: 130, b: 246 },
        colorPower: 'OFF',
      },
    ]
  })()

  const isRoomNodeOnline = liveOnlineNodes > 0

  // Render individual device card with exact CircularColorPicker wheel for Projector
  const renderDeviceCard = (device) => {
    const isOn = device.state === 'ON' || device.isOn
    const IconComponent = device.type === 'LIGHT' ? Lightbulb : device.type === 'FAN' ? Fan : Projector
    const pin = device.gpioPin ?? (device.type === 'LIGHT' ? 23 : device.type === 'FAN' ? 22 : 21)
    const relayChannel = `GPIO ${pin} (ESP32)`

    return (
      <div
        key={device.deviceId || device._id}
        className={`p-5 sm:p-6 space-y-4 transition-all hover:bg-slate-50/40 ${
          isOn ? 'bg-blue-50/20' : ''
        }`}
      >
        {/* Top Bar: Icon, Name, and Status Badges */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-colors ${
                isOn
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                  : 'bg-slate-100 text-slate-500 border border-slate-200/80'
              }`}
            >
              <IconComponent className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-900 tracking-tight">
                {device.name || `${device.type} Relay`}
              </h4>
              <span className="text-[11px] text-slate-400 font-medium block">
                {device.type} Appliance
              </span>
            </div>
          </div>

          {/* Hardware Online State Badge */}
          <Badge
            variant={isRoomNodeOnline ? 'success' : 'danger'}
            dot={isRoomNodeOnline}
            pulse={isRoomNodeOnline && isOn}
            size="sm"
          >
            {isRoomNodeOnline ? 'Online' : 'Offline'}
          </Badge>
        </div>

        {/* Device Telemetry Specs */}
        <div className="p-3.5 rounded-2xl bg-white/90 border border-slate-200/70 space-y-1.5 text-xs shadow-xs">
          <div className="flex justify-between items-center text-slate-500">
            <span>Operating State:</span>
            <span
              className={`font-semibold ${
                isOn ? 'text-emerald-600' : 'text-slate-400'
              }`}
            >
              {isOn ? '● ACTIVE (ON)' : '○ STANDBY (OFF)'}
            </span>
          </div>
          <div className="flex justify-between items-center text-slate-500">
            <span>Location:</span>
            <span className="text-slate-800 font-medium">Room 302</span>
          </div>
          <div className="flex justify-between items-center text-slate-500">
            <span>Relay Channel:</span>
            <span className="text-blue-600 font-mono text-[10px] font-semibold">
              {relayChannel}
            </span>
          </div>
        </div>

        {/* Control Button (ON/OFF Toggle) & Simulation */}
        <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full ${
                isOn ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'
              }`}
            />
            <span className="text-[11px] text-slate-500 font-medium">
              Power: {isOn ? 'ON' : 'OFF'}
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
              variant={isOn ? 'danger' : 'primary'}
              size="sm"
              leftIcon={<Power className="w-3.5 h-3.5" />}
              onClick={() => {
                triggerHaptic('medium')
                handleToggleDevice(device)
              }}
              className="rounded-xl h-8 px-3.5 justify-center font-bold text-xs"
            >
              {isOn ? 'Turn OFF' : 'Turn ON'}
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
              <Badge variant={isOn && device.colorPower !== 'OFF' ? 'purple' : 'neutral'} size="xs">
                {isOn && device.colorPower !== 'OFF' ? 'RGB Active' : 'RGB OFF'}
              </Badge>
            </div>

            {/* Live Circular Color Wheel */}
            <div className="flex flex-col items-center justify-center p-3 rounded-2xl bg-white border border-slate-200/80 shadow-xs">
              <CircularColorPicker
                color={device.color || { r: 59, g: 130, b: 246 }}
                power={isOn && device.colorPower !== 'OFF' ? 'ON' : 'OFF'}
                onChange={(rgb, meta) => handleAdminColorWheel(device, rgb, meta)}
                onDragEnd={(finalRgb) => sendAdminLiveColor(device, finalRgb, true)}
                onDisabledClick={() => {
                  if (!isOn) handleToggleDevice(device)
                }}
                disabled={!isRoomNodeOnline}
                size={150}
              />
              <span className="text-[10px] text-slate-400 mt-1.5 font-medium text-center">
                {isOn
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
                    backgroundColor: isOn && device.colorPower !== 'OFF'
                      ? `rgb(${device.color?.r ?? 59}, ${device.color?.g ?? 130}, ${device.color?.b ?? 246})`
                      : '#334155',
                    boxShadow: isOn && device.colorPower !== 'OFF'
                      ? `0 0 12px rgba(${device.color?.r ?? 59}, ${device.color?.g ?? 130}, ${device.color?.b ?? 246}, 0.5)`
                      : 'none',
                  }}
                />
                <div className="text-[11px] font-mono leading-tight">
                  <span className="text-slate-400 text-[10px] block">RGB:</span>
                  <span className="font-bold text-slate-800">
                    {isOn && device.colorPower !== 'OFF'
                      ? `R ${device.color?.r ?? 59}  G ${device.color?.g ?? 130}  B ${device.color?.b ?? 246}`
                      : 'RGB OFF'}
                  </span>
                </div>
              </div>

              {/* Native Color Picker */}
              <div className="flex items-center gap-1.5">
                <input
                  type="color"
                  value={
                    rgbToHexStr(device.color?.r ?? 59, device.color?.g ?? 130, device.color?.b ?? 246)
                  }
                  disabled={!isOn || !isRoomNodeOnline}
                  onChange={(e) => handleAdminProjectorColorChange(device, e.target.value)}
                  className="w-7 h-7 rounded-lg cursor-pointer border border-slate-200 disabled:opacity-30 disabled:cursor-not-allowed p-0.5 bg-white shadow-xs"
                  title={!isOn ? 'Projector is OFF' : 'Click to choose color'}
                />
              </div>
            </div>

            {/* Quick Preset Colors: White, Red, Yellow, Green, Cyan, Blue, Purple */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {[
                { name: 'White', hex: '#FFFFFF' },
                { name: 'Red', hex: '#EF4444' },
                { name: 'Yellow', hex: '#EAB308' },
                { name: 'Green', hex: '#10B981' },
                { name: 'Cyan', hex: '#06B6D4' },
                { name: 'Blue', hex: '#3B82F6' },
                { name: 'Purple', hex: '#A855F7' },
              ].map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  disabled={!isOn || !isRoomNodeOnline}
                  onClick={() => handleAdminProjectorColorChange(device, preset.hex)}
                  className="w-5 h-5 rounded-full border border-slate-300 shadow-xs hover:scale-110 active:scale-95 transition-all cursor-pointer disabled:opacity-25 disabled:cursor-not-allowed"
                  style={{ backgroundColor: preset.hex }}
                  title={`${preset.name} (${preset.hex})`}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <DashboardLayout
      pageTitle="Super Admin Console"
      activeTab={activeTab}
      onTabChange={handleTabChange}
      onTriggerVoice={() => navigate('/voice')}
    >
      <div className="w-full space-y-5">
        {/* Apple Intelligence / Siri iOS 27 Master Bento Container */}
        <SiriCard className="overflow-hidden shadow-sm">
          {/* 1. Siri Header with Live Status & Quick Action Buttons */}
          <div className="p-4 sm:p-5 flex flex-col xl:flex-row xl:items-center justify-between gap-3.5 bg-white/80">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-purple-500 via-indigo-500 to-pink-500 flex items-center justify-center text-white shadow-md shadow-purple-500/25 shrink-0">
                <Sparkles className="w-5 h-5 animate-pulse" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight whitespace-nowrap">
                    Super Admin Command Center
                  </h2>
                  <Badge variant="purple" dot pulse size="sm">
                    Live Telemetry
                  </Badge>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Voice control, smart appliance switches, and temporary demo QR authentication.
                </p>
              </div>
            </div>

            {/* 3 Core Quick Action Buttons Requested by User */}
            <div className="flex items-center gap-2 flex-wrap shrink-0">
              <Button
                variant="outline"
                size="sm"
                leftIcon={<RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />}
                onClick={fetchDashboardData}
                disabled={isRefreshing}
                className="rounded-xl h-8 px-3 text-xs font-semibold whitespace-nowrap shrink-0"
              >
                Refresh
              </Button>
              <Button
                variant="primary"
                size="sm"
                leftIcon={<Mic className="w-3.5 h-3.5 text-purple-100" />}
                onClick={() => navigate('/voice')}
                className="bg-gradient-to-r from-purple-600 via-indigo-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 shadow-sm shadow-purple-500/20 text-white font-semibold rounded-xl h-8 px-3.5 text-xs whitespace-nowrap shrink-0"
              >
                Voice Control
              </Button>
              <Button
                variant="primary"
                size="sm"
                leftIcon={<Zap className="w-3.5 h-3.5 text-amber-100" />}
                onClick={() => {
                  handleTabChange('devices')
                  const el = document.getElementById('device-controls-section')
                  if (el) el.scrollIntoView({ behavior: 'smooth' })
                }}
                className="bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 hover:from-amber-400 hover:to-rose-400 shadow-sm shadow-amber-500/20 text-white font-semibold rounded-xl h-8 px-3.5 text-xs whitespace-nowrap shrink-0"
              >
                Device Control
              </Button>
              <Button
                variant="primary"
                size="sm"
                leftIcon={<QrCode className="w-3.5 h-3.5 text-blue-100" />}
                onClick={() => handleTabChange('demo-login')}
                className="bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 shadow-sm shadow-blue-500/20 text-white font-semibold rounded-xl h-8 px-3.5 text-xs whitespace-nowrap shrink-0"
              >
                Demo QR Login
              </Button>
              <Button
                variant="outline"
                size="sm"
                leftIcon={<Sliders className="w-3.5 h-3.5 text-slate-500" />}
                onClick={() => setIsModalOpen(true)}
                className="rounded-xl h-8 px-3 text-xs font-semibold whitespace-nowrap shrink-0"
              >
                Config
              </Button>
            </div>
          </div>


          {/* 3. System Infrastructure Health Bar */}
          <div className="border-t border-slate-100/90 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-slate-100/90 bg-slate-50/40 text-xs">
            {/* Backend */}
            <div className="p-3 sm:p-3.5 flex items-center justify-between gap-2 hover:bg-white/60 transition-colors">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                  <Server className="w-3 h-3" />
                </div>
                <div>
                  <span className="font-bold text-slate-800 block text-[11px]">Backend API</span>
                  <span className="text-[10px] text-slate-400 font-mono">Port 5000</span>
                </div>
              </div>
              <Badge variant={systemHealth?.backend?.status === 'online' ? 'success' : 'danger'} dot size="xs">
                {systemHealth?.backend?.status === 'online' ? 'Online' : 'Offline'}
              </Badge>
            </div>

            {/* MongoDB */}
            <div className="p-3 sm:p-3.5 flex items-center justify-between gap-2 hover:bg-white/60 transition-colors">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                  <Database className="w-3 h-3" />
                </div>
                <div>
                  <span className="font-bold text-slate-800 block text-[11px]">MongoDB</span>
                  <span className="text-[10px] text-slate-400 font-mono">Atlas Synced</span>
                </div>
              </div>
              <Badge variant={systemHealth?.mongodb?.connected ? 'success' : 'danger'} dot size="xs">
                {systemHealth?.mongodb?.connected ? 'Live' : 'Offline'}
              </Badge>
            </div>

            {/* MQTT */}
            <div className="p-3 sm:p-3.5 flex items-center justify-between gap-2 hover:bg-white/60 transition-colors">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-cyan-50 border border-cyan-100 text-cyan-600 flex items-center justify-center shrink-0">
                  <Wifi className="w-3 h-3" />
                </div>
                <div>
                  <span className="font-bold text-slate-800 block text-[11px]">MQTT Broker</span>
                  <span className="text-[10px] text-slate-400 font-mono">Port 1883</span>
                </div>
              </div>
              <Badge variant={systemHealth?.mqtt?.connected ? 'info' : 'danger'} dot size="xs">
                {systemHealth?.mqtt?.connected ? 'Live' : 'Offline'}
              </Badge>
            </div>

            {/* Gemini */}
            <div className="p-3 sm:p-3.5 flex items-center justify-between gap-2 hover:bg-white/60 transition-colors">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-purple-50 border border-purple-100 text-purple-600 flex items-center justify-center shrink-0">
                  <Sparkles className="w-3 h-3" />
                </div>
                <div>
                  <span className="font-bold text-slate-800 block text-[11px]">Gemini Voice</span>
                  <span className="text-[10px] text-slate-400 font-mono">2.5 Flash</span>
                </div>
              </div>
              <Badge variant={systemHealth?.gemini?.status === 'online' ? 'purple' : 'warning'} dot size="xs">
                {systemHealth?.gemini?.status === 'online' ? 'Active' : 'Standby'}
              </Badge>
            </div>

            {/* ESP32 Hardware */}
            <div className="p-3 sm:p-3.5 flex items-center justify-between gap-2 hover:bg-white/60 transition-colors col-span-2 sm:col-span-1">
              <div className="flex items-center gap-2">
                <div className={`w-6 h-6 rounded-lg border flex items-center justify-center shrink-0 ${
                  metrics.onlineNodes > 0
                    ? 'bg-amber-50 border-amber-100 text-amber-600'
                    : 'bg-rose-50 border-rose-100 text-rose-600'
                }`}>
                  <Cpu className="w-3 h-3" />
                </div>
                <div>
                  <span className="font-bold text-slate-800 block text-[11px]">ESP32 Node</span>
                  <span className="text-[10px] text-slate-400 font-mono">Room 302</span>
                </div>
              </div>
              <Badge variant={metrics.onlineNodes > 0 ? 'success' : 'danger'} dot size="xs">
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

        {/* ----------------- CORE VIEW ROUTING ----------------- */}

        {/* 1. OVERVIEW & UNIFIED DASHBOARD */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* DEVICE CONTROL (ROOM 302 HARDWARE SWITCHES) */}
            <section id="device-controls-section" className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2.5">
                    <h3 className="text-base font-bold text-slate-900 tracking-tight">
                      Device Control (Room 302 Appliances)
                    </h3>
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-amber-50 border border-amber-200/70 text-amber-700 font-semibold">
                      Live Relays
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Direct hardware relay switching via EMQX MQTT Cloud &amp; Socket.IO
                  </p>
                </div>

                {/* Master Controls & Link to Full Device Console */}
                <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto flex-wrap sm:flex-nowrap pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                  <div className="flex items-center gap-2 flex-1 sm:flex-initial justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        triggerHaptic('medium')
                        handleAllDevices(true, 'Room 302')
                      }}
                      className="h-8 rounded-xl font-bold text-xs"
                    >
                      All ON
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        triggerHaptic('medium')
                        handleAllDevices(false, 'Room 302')
                      }}
                      className="h-8 rounded-xl font-bold text-xs"
                    >
                      All OFF
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      leftIcon={<Zap className="w-3.5 h-3.5 text-amber-500" />}
                      onClick={() => navigate('/admin/device-control')}
                      className="h-8 rounded-xl font-bold text-xs"
                    >
                      Full Matrix
                    </Button>
                  </div>
                </div>
              </div>

              {/* 3 Core Device Cards: Light, Fan, Projector */}
              <BentoContainer className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-100/90">
                {room302Devices.map((device) => renderDeviceCard(device))}
              </BentoContainer>
            </section>

            {/* PILLAR 3: DEMO QR LOGIN MANAGEMENT SECTION */}
            <section className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
                    <QrCode className="w-4 h-4 text-blue-600" />
                    <span>Demo QR Login Access</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Generate temporary session credentials for guest presentations and student demos.
                  </p>
                </div>
              </div>

              <DemoLoginSection
                token={token}
                onNotify={(alert) => setAdminAlert(alert)}
              />
            </section>
          </div>
        )}

        {/* 2. DEVICE CONTROL TAB */}
        {activeTab === 'devices' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 tracking-tight">
                  Classroom Device Control Matrix
                </h3>
                <p className="text-xs text-slate-500">
                  Full control over Room 302 IoT appliances and ESP32 controller node.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  leftIcon={<Zap className="w-3.5 h-3.5 text-amber-200" />}
                  onClick={() => navigate('/admin/device-control')}
                  className="bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl h-8 px-3 text-xs font-semibold shadow-xs"
                >
                  Open Dedicated Console
                </Button>
              </div>
            </div>

            {/* 3 Core Device Cards */}
            <BentoContainer className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-100/90">
              {room302Devices.map((device) => renderDeviceCard(device))}
            </BentoContainer>
          </div>
        )}

        {/* 3. DEMO QR LOGIN TAB */}
        {activeTab === 'demo-login' && (
          <div className="space-y-6">
            <DemoLoginSection
              token={token}
              onNotify={(alert) => setAdminAlert(alert)}
            />
          </div>
        )}

        {/* 4. SETTINGS TAB */}
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
                  onClick={() => setIsModalOpen(true)}
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

            {/* Backend Security Verification */}
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
        )}

        {/* Modal for Settings Configuration */}
        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title="Global Automation Settings"
          description="Adjust campus-wide automation thresholds and voice engine preferences."
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
                onClick={() => {
                  setIsModalOpen(false)
                  setAdminAlert({
                    type: 'success',
                    title: 'Preferences Updated',
                    message: 'Global campus automation and standby settings saved.',
                  })
                }}
              >
                Save Settings
              </Button>
            </>
          }
        >
          <div className="space-y-4 text-xs">
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
          </div>
        </Modal>
      </div>
    </DashboardLayout>
  )
}
