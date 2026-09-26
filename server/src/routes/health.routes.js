const express = require('express')
const router = express.Router()
const { getMongoStatus, pingDatabase } = require('../config/db')
const env = require('../config/env')

/**
 * @route   GET /api/health
 * @desc    Health check endpoint for API, Database status, and Configuration verification
 * @access  Public
 */
router.get('/health', (req, res) => {
  const mongoStatus = getMongoStatus()
  const diagnostics = env.getDiagnostics()

  res.status(200).json({
    status: 'ok',
    message: 'AI Voice-Controlled Smart Classroom API is operational',
    timestamp: new Date().toISOString(),
    uptime: `${Math.floor(process.uptime())}s`,
    environment: diagnostics.nodeEnv,
    services: {
      database: {
        status: mongoStatus,
        client: 'mongoose',
        configured: diagnostics.mongoConfigured,
      },
      auth: {
        jwtConfigured: diagnostics.jwtConfigured,
      },
      aiEngine: {
        provider: 'Google Gemini',
        keyConfigured: diagnostics.geminiConfigured,
        keyMasked: diagnostics.geminiMasked,
      },
      iot: {
        brokerUrl: diagnostics.mqtt.brokerUrl,
        clientId: diagnostics.mqtt.clientId,
        hasAuth: diagnostics.mqtt.hasAuth,
      },
    },
  })
})

/**
 * @route   GET /api/health/db
 * @desc    Dedicated database connection ping and latency test endpoint
 * @access  Public
 */
router.get('/health/db', async (req, res) => {
  const pingResult = await pingDatabase()

  if (pingResult.success) {
    return res.status(200).json({
      status: 'ok',
      message: 'MongoDB connection is healthy and responsive',
      database: pingResult,
    })
  }

  return res.status(503).json({
    status: 'unavailable',
    message: 'MongoDB is not connected or not responding to pings',
    database: pingResult,
  })
})

module.exports = router
