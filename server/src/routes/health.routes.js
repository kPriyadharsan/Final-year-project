const mongoose = require('mongoose')
const express = require('express')
const router = express.Router()
const { getMongoStatus, pingDatabase } = require('../config/db')
const { getMQTTStatus } = require('../services/mqtt.service')
const { Device } = require('../models/Device')
const env = require('../config/env')

/**
 * Formats uptime seconds into human-readable format (e.g. "1h 12m 30s")
 *
 * @param {number} totalSeconds
 * @returns {string}
 */
function formatUptime(totalSeconds) {
  const s = Math.floor(totalSeconds)
  const days = Math.floor(s / 86400)
  const hours = Math.floor((s % 86400) / 3600)
  const minutes = Math.floor((s % 3600) / 60)
  const seconds = s % 60

  const parts = []
  if (days > 0) parts.push(`${days}d`)
  if (hours > 0) parts.push(`${hours}h`)
  if (minutes > 0) parts.push(`${minutes}m`)
  parts.push(`${seconds}s`)

  return parts.join(' ')
}

/**
 * @route   GET /api/health
 * @desc    Health check endpoint for API, Database status, and Configuration verification
 * @access  Public
 */
router.get('/health', (req, res) => {
  const mongoStatus = getMongoStatus()
  const diagnostics = env.getDiagnostics()
  const mqttStatus = getMQTTStatus()

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
      mqtt: mqttStatus,
    },
  })
})

/**
 * @route   GET /api/system/status
 * @desc    System health & status matrix for Backend, MongoDB, MQTT, Gemini, and ESP32
 * @access  Public
 */
router.get('/system/status', async (req, res) => {
  try {
    const mongoStatus = getMongoStatus()
    const mqttStatus = getMQTTStatus()
    const diagnostics = env.getDiagnostics()

    let esp32Online = false
    let onlineDevices = 0
    let totalDevices = 0

    if (mongoose.connection.readyState === 1) {
      try {
        const devices = await Device.find({ classroom: 'Room 302', isActive: true })
          .select('deviceId name isOnline type state')
          .lean()

        totalDevices = devices.length
        onlineDevices = devices.filter((d) => d.isOnline === true).length
        esp32Online = onlineDevices > 0
      } catch (dbErr) {
        console.warn('[SystemStatus] Could not query devices for ESP32 status:', dbErr.message)
      }
    }

    const memoryUsage = process.memoryUsage()
    const memoryMb = (memoryUsage.heapUsed / 1024 / 1024).toFixed(1)

    const systemStatus = {
      backend: {
        name: 'Backend API',
        status: 'online',
        uptime: Math.floor(process.uptime()),
        uptimeFormatted: formatUptime(process.uptime()),
        memoryUsedMb: memoryMb,
        environment: diagnostics.nodeEnv,
        port: process.env.PORT || 5000,
      },
      mongodb: {
        name: 'MongoDB',
        status: mongoStatus === 'connected' ? 'online' : 'offline',
        state: mongoStatus,
        connected: mongoStatus === 'connected',
        details: mongoStatus === 'connected' ? 'Atlas / Database Active' : 'Database Disconnected',
      },
      mqtt: {
        name: 'MQTT Broker',
        status: mqttStatus.connected ? 'online' : 'offline',
        connected: mqttStatus.connected,
        brokerUrl: mqttStatus.brokerUrl,
        clientStatus: mqttStatus.status,
        subscriptionsCount: mqttStatus.subscriptions.length,
      },
      gemini: {
        name: 'Gemini AI',
        status: diagnostics.geminiConfigured ? 'online' : 'degraded',
        configured: diagnostics.geminiConfigured,
        model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
        keyMasked: diagnostics.geminiMasked,
        fallbackReady: true,
      },
      esp32: {
        name: 'ESP32 Hardware',
        status: esp32Online ? 'online' : 'offline',
        connected: esp32Online,
        onlineDevices,
        totalDevices,
        classroom: 'Room 302',
      },
    }

    res.status(200).json({
      status: 'success',
      timestamp: new Date().toISOString(),
      services: systemStatus,
    })
  } catch (err) {
    console.error('Error generating system status:', err)
    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve system status matrix.',
    })
  }
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
