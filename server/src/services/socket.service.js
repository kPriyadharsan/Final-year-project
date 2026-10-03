const { Server } = require('socket.io')
const env = require('../config/env')

let io = null
let connectedSocketsCount = 0

/**
 * Initializes Socket.IO server attached to the Node HTTP server
 *
 * @param {import('http').Server} httpServer
 * @returns {Server}
 */
function initSocket(httpServer) {
  if (io) {
    return io
  }

  const allowedOrigins = [
    env.CLIENT_URL || 'http://localhost:5173',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
  ]

  io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
          return callback(null, true)
        }
        return callback(null, true)
      },
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 20000,
    pingInterval: 25000,
  })

  io.on('connection', (socket) => {
    connectedSocketsCount += 1
    console.log(`[Socket.IO] 🔌 Client connected: ${socket.id} (Total: ${connectedSocketsCount})`)

    // Optional: client can join classroom-specific room
    socket.on('join:classroom', (classroom) => {
      if (classroom && typeof classroom === 'string') {
        const roomName = `classroom:${classroom.trim().toLowerCase()}`
        socket.join(roomName)
        console.log(`[Socket.IO] Client ${socket.id} joined room: ${roomName}`)
      }
    })

    socket.on('leave:classroom', (classroom) => {
      if (classroom && typeof classroom === 'string') {
        const roomName = `classroom:${classroom.trim().toLowerCase()}`
        socket.leave(roomName)
      }
    })

    socket.on('disconnect', (reason) => {
      connectedSocketsCount = Math.max(0, connectedSocketsCount - 1)
      console.log(`[Socket.IO] ❌ Client disconnected: ${socket.id} (${reason}) (Total: ${connectedSocketsCount})`)
    })
  })

  console.log('[Socket.IO] ✅ Real-time server initialized')
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
 * Broadcasts a device:status real-time event to all connected dashboards
 *
 * @param {Object} device - Device database document or snapshot
 */
function emitDeviceStatus(device) {
  if (!io) {
    return
  }

  const payload = {
    id: device._id ? device._id.toString() : device.id,
    deviceId: device.deviceId,
    name: device.name,
    type: device.type,
    classroom: device.classroom,
    state: device.state,
    isOnline: typeof device.isOnline === 'boolean' ? device.isOnline : true,
    gpioPin: device.gpioPin,
    updatedAt: device.updatedAt ? new Date(device.updatedAt).toISOString() : new Date().toISOString(),
  }

  // Broadcast real-time status update to all connected dashboard clients
  io.emit('device:status', payload)
  console.log(`[Socket.IO] 📡 Emitted "device:status" for [${device.deviceId}] -> ${device.state} (Online: ${payload.isOnline})`)
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

module.exports = {
  initSocket,
  getIO,
  emitDeviceStatus,
  getSocketStats,
}
