// 1. Load and validate environment variables before any server initialization
const env = require('./config/env')

const http = require('http')
const express = require('express')
const cors = require('cors')
const { connectDB, closeDB } = require('./config/db')
const { connectMQTT, disconnectMQTT } = require('./services/mqtt.service')
const { initSocket } = require('./services/socket.service')
const { initDeviceSync } = require('./services/deviceSync.service')
const healthRoutes = require('./routes/health.routes')
const authRoutes = require('./routes/auth.routes')
const adminRoutes = require('./routes/admin.routes')
const teacherRoutes = require('./routes/teacher.routes')
const deviceRoutes = require('./routes/device.routes')
const aiRoutes = require('./routes/ai.routes')
const voiceRoutes = require('./routes/voice.routes')

const app = express()
const PORT = env.PORT
const CLIENT_URL = env.CLIENT_URL

// Connect to MongoDB upon server startup
connectDB()

// Connect to MQTT Broker upon server startup (non-fatal if broker is offline)
connectMQTT()

// CORS Configuration
const allowedOrigins = [
  CLIENT_URL,
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow non-browser requests (Postman, curl, IoT scripts) or matched origins
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true)
      }
      return callback(null, true)
    },
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
    },
    protectedTestEndpoints: {
      adminTest: 'GET /api/admin/test (SUPER_ADMIN only)',
      teacherTest: 'GET /api/teacher/test (TEACHER & SUPER_ADMIN)',
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

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err)
  res.status(500).json({
    status: 'error',
    message: err.message || 'Internal Server Error',
  })
})

// Create Node HTTP server wrapping Express app
const server = http.createServer(app)

// Initialize Socket.IO real-time server
initSocket(server)

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
  console.log(`🔌 MQTT Broker      : ${env.MQTT_BROKER_URL}`)
  console.log(`⚡ Real-Time Engine : Socket.IO initialized`)
  console.log('='.repeat(60))
})

// Graceful termination handling
const handleShutdown = async (signal) => {
  console.log(`\n🛑 Received [${signal}]. Initiating graceful shutdown...`)
  await disconnectMQTT()
  server.close(async () => {
    console.log('🔒 Express HTTP server closed.')
    await closeDB(signal)
    process.exit(0)
  })
}

process.on('SIGINT', () => handleShutdown('SIGINT'))
process.on('SIGTERM', () => handleShutdown('SIGTERM'))

module.exports = app
