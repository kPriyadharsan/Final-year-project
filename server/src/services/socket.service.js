const { Server } = require('socket.io')
const jwt = require('jsonwebtoken')
const env = require('../config/env')
const { validateOrigin } = require('../config/cors')
const { toClassroomSlug } = require('../utils/mqttTopics')

let io = null
let connectedSocketsCount = 0

// Client mutation events that must NEVER be accepted over Socket.IO to prevent auth bypass
const BLOCKED_CLIENT_MUTATION_EVENTS = [
  'device:command',
  'device:toggle',
  'device:set',
  'device:update',
  'device:state',
  'command',
  'voice:command',
]

/**
 * Initializes the Socket.IO server attached to the Node HTTP server
 *
 * @param {import('http').Server} httpServer
 * @returns {Server}
 */
function initSocket(httpServer) {
  if (io) {
    return io
  }

  io = new Server(httpServer, {
    cors: {
      origin: validateOrigin,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 20000,
    pingInterval: 25000,
    connectTimeout: 20000,
  })

  // 1. Handshake Authentication Middleware
  // Protects the socket gateway without bypassing JWT verification or exposing MQTT credentials
  io.use((socket, next) => {
    try {
      const rawToken =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization ||
        socket.handshake.query?.token

      if (rawToken && typeof rawToken === 'string') {
        const token = rawToken.startsWith('Bearer ') ? rawToken.slice(7).trim() : rawToken.trim()
        try {
          const decoded = jwt.verify(token, env.JWT_SECRET)
          socket.user = decoded
          console.log(`[Socket.IO] 🔐 Authenticated client connection (${socket.id}) for user: ${decoded.email || decoded.id} [${decoded.role || 'USER'}]`)
        } catch (jwtErr) {
          console.warn(`[Socket.IO] ⚠️ Handshake token verification warning for (${socket.id}): ${jwtErr.message}`)
          if (env.NODE_ENV === 'production' && socket.handshake.auth?.requireAuth) {
            return next(new Error('Authentication failed: Invalid or expired token'))
          }
          socket.user = null
        }
      } else {
        // Unauthenticated client (read-only observer)
        socket.user = null
      }

      return next()
    } catch (err) {
      console.error(`[Socket.IO] Handshake middleware exception:`, err)
      return next(new Error('Connection rejected by gateway security.'))
    }
  })

  // 2. Client Connection Lifecycle & Security Event Handlers
  io.on('connection', (socket) => {
    connectedSocketsCount += 1
    const clientUser = socket.user ? `${socket.user.email || socket.user.id} (${socket.user.role})` : 'Anonymous / Observer'
    console.log(`[Socket.IO] 🔌 Client connected: ${socket.id} | User: ${clientUser} | Transport: ${socket.conn.transport.name} (Active: ${connectedSocketsCount})`)

    // Monitor transport upgrade
    socket.conn.on('upgrade', (transport) => {
      console.log(`[Socket.IO] 🚀 Client ${socket.id} upgraded transport to: ${transport.name}`)
    })

    // SECURITY GUARD: Prevent authentication & authorization bypass through Socket.IO.
    // Device control MUST strictly use authenticated REST endpoints (POST /api/devices/:id/command).
    BLOCKED_CLIENT_MUTATION_EVENTS.forEach((eventName) => {
      socket.on(eventName, () => {
        console.warn(`[Socket.IO Security] ⚠️ Client ${socket.id} attempted unauthorized mutation via event "${eventName}". Request rejected.`)
        socket.emit('error:unauthorized', {
          status: 'error',
          code: 'UNAUTHORIZED_MUTATION',
          message: 'Hardware state mutations cannot be performed over Socket.IO. Use authenticated REST endpoints.',
          event: eventName,
          timestamp: new Date().toISOString(),
        })
      })
    })

    // Classroom Room Subscription
    socket.on('join:classroom', (classroom) => {
      if (classroom && typeof classroom === 'string') {
        const slug = toClassroomSlug(classroom)
        if (slug) {
          const roomName = `classroom:${slug}`
          socket.join(roomName)
          console.log(`[Socket.IO] 🏫 Client ${socket.id} joined room: "${roomName}" (Requested: "${classroom}")`)
          socket.emit('joined:classroom', {
            classroom,
            slug,
            room: roomName,
            status: 'subscribed',
            timestamp: new Date().toISOString(),
          })
        }
      }
    })

    socket.on('leave:classroom', (classroom) => {
      if (classroom && typeof classroom === 'string') {
        const slug = toClassroomSlug(classroom)
        if (slug) {
          const roomName = `classroom:${slug}`
          socket.leave(roomName)
          console.log(`[Socket.IO] 🏫 Client ${socket.id} left room: "${roomName}"`)
          socket.emit('left:classroom', {
            classroom,
            slug,
            room: roomName,
            status: 'unsubscribed',
            timestamp: new Date().toISOString(),
          })
        }
      }
    })

    // Disconnect Lifecycle
    socket.on('disconnect', (reason) => {
      connectedSocketsCount = Math.max(0, connectedSocketsCount - 1)
      console.log(`[Socket.IO] ❌ Client disconnected: ${socket.id} (${reason}) (Active: ${connectedSocketsCount})`)
    })
  })

  console.log('[Socket.IO] ✅ Real-time server initialized (CORS & Auth hardened)')
  return io
}

/**
 * Returns the active Socket.IO server instance
 *
 * @returns {Server|null}
 */
function getIO() {
  return io
}

/**
 * Broadcasts a device:status real-time event to all connected dashboards,
 * device-specific listeners, and classroom rooms.
 *
 * IMPORTANT SECURITY:
 * Never exposes MQTT credentials (username, password, broker URL, private certs).
 *
 * @param {Object} device - Device database document or snapshot
 */
function emitDeviceStatus(device) {
  if (!io || !device) {
    return
  }

  const payload = {
    id: device._id ? device._id.toString() : device.id,
    deviceId: device.deviceId,
    name: device.name,
    type: device.type,
    classroom: device.classroom,
    state: device.state,
    requestedState: device.requestedState || null,
    confirmedState: device.confirmedState || null,
    lastCommandedAt: device.lastCommandedAt ? new Date(device.lastCommandedAt).toISOString() : null,
    lastConfirmedAt: device.lastConfirmedAt ? new Date(device.lastConfirmedAt).toISOString() : null,
    isOnline: typeof device.isOnline === 'boolean' ? device.isOnline : true,
    lastSeenAt: device.lastSeenAt ? new Date(device.lastSeenAt).toISOString() : null,
    gpioPin: device.gpioPin,
    color: device.color || { r: 255, g: 0, b: 255 },
    colorPower: device.colorPower || 'OFF',
    updatedAt: device.updatedAt ? new Date(device.updatedAt).toISOString() : new Date().toISOString(),
  }

  // 1. Universal Broadcast: All connected teacher/admin dashboards
  io.emit('device:status', payload)

  // Emit device:color event specifically for RGB listeners
  if (device.type === 'PROJECTOR' || device.color) {
    io.emit('device:color', {
      deviceId: device.deviceId,
      id: device._id ? device._id.toString() : device.id,
      classroom: device.classroom,
      power: device.colorPower || 'OFF',
      colorPower: device.colorPower || 'OFF',
      color: device.color || { r: 255, g: 0, b: 255 },
      timestamp: new Date().toISOString(),
    })
  }

  // 2. Device-Specific Event: Targeted listeners for this hardware deviceId
  if (payload.deviceId) {
    io.emit(`device:${payload.deviceId}:status`, payload)
  }

  // 3. Classroom-Specific Room & Event: Targeted listeners for this classroom
  if (device.classroom) {
    const roomSlug = toClassroomSlug(device.classroom)
    if (roomSlug) {
      io.to(`classroom:${roomSlug}`).emit('classroom:device:status', payload)
      io.emit(`classroom:${roomSlug}:status`, payload)
    }
  }

  console.log(
    `[Socket.IO] 📡 Emitted "device:status" for [${device.deviceId}] -> ${device.state} ` +
    `(Req: ${payload.requestedState || 'none'}, Conf: ${payload.confirmedState || 'none'}, Online: ${payload.isOnline}, ColorPower: ${payload.colorPower})`
  )
}

/**
 * Broadcasts a dedicated device:color real-time event
 *
 * @param {Object} device
 */
function emitDeviceColor(device) {
  if (!io || !device) return

  const colorPayload = {
    deviceId: device.deviceId,
    id: device._id ? device._id.toString() : device.id,
    classroom: device.classroom,
    power: device.colorPower || 'OFF',
    colorPower: device.colorPower || 'OFF',
    color: device.color || { r: 255, g: 0, b: 255 },
    timestamp: new Date().toISOString(),
  }

  io.emit('device:color', colorPayload)
  io.emit('projector:color', colorPayload)
  if (device.classroom) {
    const roomSlug = toClassroomSlug(device.classroom)
    if (roomSlug) {
      io.to(`classroom:${roomSlug}`).emit('classroom:device:color', colorPayload)
    }
  }
}

/**
 * Returns current metrics on socket connections
 */
function getSocketStats() {
  return {
    initialized: !!io,
    connectedClients: connectedSocketsCount,
  }
}

/**
 * Gracefully shuts down the Socket.IO server
 */
async function closeSocket() {
  if (!io) {
    return
  }

  console.log('[Socket.IO] 🔒 Closing all active real-time connections...')
  return new Promise((resolve) => {
    io.close(() => {
      console.log('[Socket.IO] 🔒 Socket.IO server closed cleanly.')
      io = null
      connectedSocketsCount = 0
      resolve()
    })
  })
}

module.exports = {
  initSocket,
  getIO,
  emitDeviceStatus,
  emitDeviceColor,
  getSocketStats,
  closeSocket,
}
