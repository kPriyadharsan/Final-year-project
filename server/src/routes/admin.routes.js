const express = require('express')
const router = express.Router()
const { requireAuth, requireRole } = require('../middleware/auth.middleware')
const { User, ROLES } = require('../models/User')
const { Device } = require('../models/Device')
const { getMongoStatus } = require('../config/db')
const { getMQTTStatus } = require('../services/mqtt.service')
const env = require('../config/env')

/**
 * @route   GET /api/admin/test
 * @desc    Protected test endpoint restricted strictly to SUPER_ADMIN role
 * @access  Private (Requires valid JWT with SUPER_ADMIN role)
 */
router.get(
  '/test',
  requireAuth,
  requireRole(ROLES.SUPER_ADMIN),
  (req, res) => {
    res.status(200).json({
      status: 'success',
      message: 'Access granted: Super Admin administrative privileges verified.',
      user: {
        id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role,
        hasDashboardAccess: req.user.hasDashboardAccess,
      },
      timestamp: new Date().toISOString(),
    })
  }
)

/**
 * @route   GET /api/admin/dashboard
 * @desc    Aggregated telemetry, counts, and service status for Super Admin console
 * @access  Private (Requires valid JWT with SUPER_ADMIN role)
 */
router.get(
  '/dashboard',
  requireAuth,
  requireRole(ROLES.SUPER_ADMIN),
  async (req, res) => {
    try {
      const [teachersCount, studentsCount, teachersList, connectedDevicesCount, distinctClassrooms] = await Promise.all([
        User.countDocuments({ role: ROLES.TEACHER }),
        User.countDocuments({ role: ROLES.STUDENT }),
        User.find({ role: ROLES.TEACHER })
          .select('-passwordHash')
          .sort({ createdAt: -1 })
          .limit(10)
          .lean(),
        Device.countDocuments({ isOnline: true }),
        Device.distinct('classroom'),
      ])

      const mongoStatus = getMongoStatus()
      const diagnostics = env.getDiagnostics()
      const liveMqtt = getMQTTStatus()

      const totalClasses = distinctClassrooms.length > 0 ? distinctClassrooms.length : 1
      const connectedDevices = connectedDevicesCount

      // Derived service statuses
      const mqttStatus = liveMqtt.connected ? 'connected' : (liveMqtt.status || 'offline')
      const geminiStatus = diagnostics.geminiConfigured ? 'active' : 'unconfigured'
      const systemStatus = mongoStatus === 'connected' ? 'operational' : 'degraded'

      res.status(200).json({
        status: 'success',
        metrics: {
          totalTeachers: teachersCount,
          totalClasses,
          totalStudents: studentsCount,
          connectedDevices,
          systemStatus,
          mqttStatus,
          geminiStatus,
        },
        services: {
          system: {
            status: systemStatus,
            uptime: `${Math.floor(process.uptime())}s`,
            environment: diagnostics.nodeEnv,
          },
          database: {
            status: mongoStatus,
            provider: 'MongoDB Atlas',
          },
          mqtt: liveMqtt,
          gemini: {
            status: geminiStatus,
            model: 'Gemini 2.5 Flash / Pro',
            keyMasked: diagnostics.geminiMasked,
            speechEngine: 'Bilingual (Tamil / English)',
          },
        },
        teachers: teachersList,
        timestamp: new Date().toISOString(),
      })
    } catch (err) {
      console.error('Super Admin dashboard API error:', err)
      res.status(500).json({
        status: 'error',
        message: 'Failed to retrieve Super Admin dashboard telemetry.',
      })
    }
  }
)

module.exports = router
