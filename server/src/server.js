// 1. Load and validate environment variables before any server initialization
const env = require('./config/env')

const http = require('http')
const express = require('express')
const cors = require('cors')
const { validateOrigin } = require('./config/cors')
const { connectDB, closeDB } = require('./config/db')
const { connectMQTT, disconnectMQTT } = require('./services/mqtt.service')
const { startEmbeddedBroker, stopEmbeddedBroker } = require('./services/embeddedBroker.service')
const { initSocket, closeSocket } = require('./services/socket.service')
const { initVoiceStream, closeVoiceStream } = require('./services/voiceStream.service')
const { initDeviceSync } = require('./services/deviceSync.service')
const healthRoutes = require('./routes/health.routes')
const authRoutes = require('./routes/auth.routes')
const adminRoutes = require('./routes/admin.routes')
const teacherRoutes = require('./routes/teacher.routes')
const deviceRoutes = require('./routes/device.routes')
const aiRoutes = require('./routes/ai.routes')
const voiceRoutes = require('./routes/voice.routes')
const studentRoutes = require('./routes/student.routes')
const { errorHandler } = require('./middleware/error.middleware')

const app = express()
const PORT = env.PORT
const CLIENT_URL = env.CLIENT_URL

// Connect to MongoDB upon server startup
connectDB()

// Connect MQTT client (production connects directly to cloud broker; dev uses local/embedded broker)
if (env.NODE_ENV === 'production') {
  console.log('[MQTT] ☁️ Production environment: Direct connection to cloud broker (embedded Aedes broker disabled)')
  connectMQTT()
} else {
  startEmbeddedBroker().finally(() => {
    connectMQTT()
  })
}

// CORS Configuration (Strictly enforces production frontend URL, avoids unrestricted origins)
app.use(
  cors({
    origin: validateOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
)

// Middleware
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Routes
app.use('/api', healthRoutes)
app.use('/api/auth', authRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/teacher', teacherRoutes)
app.use('/api/devices', deviceRoutes)
app.use('/api/ai', aiRoutes)
app.use('/api/voice', voiceRoutes)
app.use('/api/student', studentRoutes)

// Root fallback route
app.get('/', (req, res) => {
  res.json({
    project: 'AI Voice-Controlled Smart Classroom API',
    healthCheck: '/api/health',
    dbHealthCheck: '/api/health/db',
    authEndpoints: {
      login: 'POST /api/auth/login',
      me: 'GET /api/auth/me',
    },
    aiEndpoints: {
      test: 'POST /api/ai/test',
      parseCommand: 'POST /api/ai/parse-command',
      status: 'GET /api/ai/status',
    },
    voiceEndpoints: {
      command: 'POST /api/voice/command',
      history: 'GET /api/voice/history',
      liveToken: 'POST /api/voice/live/token',
      liveCommand: 'POST /api/voice/live/command',
    },


    protectedTestEndpoints: {
      adminTest: 'GET /api/admin/test (SUPER_ADMIN only)',
      teacherTest: 'GET /api/teacher/test (TEACHER & SUPER_ADMIN)',
      studentTest: 'GET /api/student/test (STUDENT & SUPER_ADMIN)',
    },
    status: 'Running',
  })
})

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    status: 'error',
    message: `Cannot ${req.method} ${req.originalUrl}`,
  })
})

// Global Error Handler (Sanitizes errors, handles CORS & MongoDB, protects against secrets/stack leakage)
app.use(errorHandler)

// Create Node HTTP server wrapping Express app
const server = http.createServer(app)

// Initialize Socket.IO real-time server
initSocket(server)

// Initialize dedicated Real-Time Voice WebSocket server (/ws/voice)
initVoiceStream(server)

// Initialize device MQTT-to-database-to-Socket.IO sync
initDeviceSync()

// Start server listener
server.listen(PORT, () => {
  console.log('='.repeat(60))
  console.log(`🚀 Smart Classroom Server running on port ${PORT}`)
  console.log(`📡 Health Check URL : http://localhost:${PORT}/api/health`)
  console.log(`🍃 Database Check   : http://localhost:${PORT}/api/health/db`)
  console.log(`🔑 Auth Endpoints   : http://localhost:${PORT}/api/auth/login & /me`)
  console.log(`🛡️ Admin Test Route : http://localhost:${PORT}/api/admin/test`)
  console.log(`📚 Teacher Test Route: http://localhost:${PORT}/api/teacher/test`)
  console.log(`🌐 Allowed Origin   : ${CLIENT_URL}`)
  console.log(`🤖 AI Engine        : Gemini API configured (server-side only)`)
  console.log(`🔌 MQTT Broker      : ${env.maskUrlCredentials(env.MQTT_BROKER_URL)}`)
  console.log(`⚡ Real-Time Engine : Socket.IO initialized`)
  console.log('='.repeat(60))
})

// Graceful termination handling for all 5 subsystems: HTTP, Socket.IO, MQTT, Embedded Broker, MongoDB
let isShuttingDown = false

const handleShutdown = async (signal) => {
  if (isShuttingDown) return
  isShuttingDown = true

  console.log(`\n🛑 Received [${signal}]. Initiating graceful shutdown...`)

  // Fallback watchdog timer to prevent process hanging on stubborn connections
  const forceExitTimer = setTimeout(() => {
    console.error('[Shutdown] ⚠️ Forceful termination triggered after shutdown timeout.')
    process.exit(1)
  }, 10000)
  forceExitTimer.unref()

  try {
    // 1. Stop accepting new HTTP requests
    await new Promise((resolve) => {
      server.close((err) => {
        if (err) console.warn('[Shutdown] HTTP server close note:', err.message)
        console.log('🔒 Express HTTP server closed.')
        resolve()
      })
    })

    // 2. Disconnect Socket.IO clients cleanly
    await closeSocket()

    // 2b. Disconnect VoiceStream WebSocket clients cleanly
    await closeVoiceStream()

    // 3. Disconnect MQTT client cleanly
    await disconnectMQTT()

    // 4. Stop embedded development broker if running
    await stopEmbeddedBroker()

    // 5. Close MongoDB database connections
    await closeDB(signal)

    console.log('✅ Graceful shutdown completed cleanly.')
    process.exit(0)
  } catch (err) {
    console.error('[Shutdown] Error during graceful shutdown:', err)
    process.exit(1)
  }
}

process.on('SIGINT', () => handleShutdown('SIGINT'))
process.on('SIGTERM', () => handleShutdown('SIGTERM'))

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Process] ⚠️ Unhandled Promise Rejection at:', promise, 'reason:', reason)
})

process.on('uncaughtException', (err) => {
  console.error('[Process] ❌ Uncaught Exception:', err.message)
  if (err.stack) console.error(err.stack)
  handleShutdown('UNCAUGHT_EXCEPTION')
})

module.exports = app
