const express = require('express')
const router = express.Router()
const { requireAuth, requireRole } = require('../middleware/auth.middleware')
const { User, ROLES } = require('../models/User')
const { Device } = require('../models/Device')
const { getMongoStatus } = require('../config/db')
const { getMQTTStatus } = require('../services/mqtt.service')
const { hashPassword } = require('../utils/password.util')
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

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/

/**
 * @route   GET /api/admin/users
 * @desc    Get registered users with optional role filtering
 * @access  Private (SUPER_ADMIN only)
 */
router.get(
  '/users',
  requireAuth,
  requireRole(ROLES.SUPER_ADMIN),
  async (req, res) => {
    try {
      const filter = {}
      if (req.query.role && Object.values(ROLES).includes(req.query.role.trim().toUpperCase())) {
        filter.role = req.query.role.trim().toUpperCase()
      }

      const users = await User.find(filter)
        .select('-passwordHash')
        .sort({ createdAt: -1 })
        .lean()

      return res.status(200).json({
        status: 'success',
        count: users.length,
        users,
      })
    } catch (err) {
      console.error('Fetch users error:', err)
      return res.status(500).json({
        status: 'error',
        message: 'Failed to retrieve users list.',
      })
    }
  }
)

/**
 * @route   POST /api/admin/users
 * @desc    Provision a new faculty (TEACHER) or STUDENT account
 *          Enforces strict privilege escalation defense (cannot create SUPER_ADMIN via API)
 * @access  Private (SUPER_ADMIN only)
 */
router.post(
  '/users',
  requireAuth,
  requireRole(ROLES.SUPER_ADMIN),
  async (req, res) => {
    try {
      const { name, email, password, role, department, assignedClasses } = req.body

      // 1. Validate required fields
      if (!name || typeof name !== 'string' || name.trim().length < 2) {
        return res.status(400).json({
          status: 'error',
          code: 'INVALID_NAME',
          message: 'User name is required and must be at least 2 characters.',
        })
      }

      if (!email || typeof email !== 'string') {
        return res.status(400).json({
          status: 'error',
          code: 'EMAIL_REQUIRED',
          message: 'Valid email address is required.',
        })
      }

      const normalizedEmail = email.trim().toLowerCase()
      if (!EMAIL_REGEX.test(normalizedEmail)) {
        return res.status(400).json({
          status: 'error',
          code: 'INVALID_EMAIL',
          message: 'Please provide a valid email address format.',
        })
      }

      // 2. Privilege Escalation Defense:
      // Prevent assigning SUPER_ADMIN role via API
      const targetRole = role ? String(role).trim().toUpperCase() : ROLES.TEACHER

      if (targetRole === ROLES.SUPER_ADMIN) {
        return res.status(403).json({
          status: 'error',
          code: 'PRIVILEGE_ESCALATION_BLOCKED',
          message: 'Privilege escalation defense: Creating Super Admin accounts via API is strictly forbidden.',
        })
      }

      if (![ROLES.TEACHER, ROLES.STUDENT].includes(targetRole)) {
        return res.status(400).json({
          status: 'error',
          code: 'INVALID_ROLE',
          message: `Invalid role "${role}". Permitted roles for provisioning are TEACHER and STUDENT.`,
        })
      }

      // 3. Password Validation
      const rawPassword = password || 'ClassroomSecure2026!'
      if (typeof rawPassword !== 'string' || rawPassword.length < 8) {
        return res.status(400).json({
          status: 'error',
          code: 'WEAK_PASSWORD',
          message: 'Password must be at least 8 characters long.',
        })
      }

      // 4. Duplicate Check
      const existingUser = await User.findOne({ email: normalizedEmail })
      if (existingUser) {
        return res.status(409).json({
          status: 'error',
          code: 'DUPLICATE_EMAIL',
          message: `A user with email "${normalizedEmail}" already exists.`,
        })
      }

      // 5. Bcrypt Password Hashing
      const passwordHash = await hashPassword(rawPassword)

      // 6. Create User Document
      const newUser = await User.create({
        name: name.trim(),
        email: normalizedEmail,
        passwordHash,
        role: targetRole,
        department: department ? String(department).trim() : '',
        assignedClasses: Array.isArray(assignedClasses) ? assignedClasses : [],
        isActive: true,
      })

      return res.status(201).json({
        status: 'success',
        message: `${targetRole === ROLES.TEACHER ? 'Faculty' : 'Student'} account created successfully.`,
        user: newUser.toJSON(),
      })
    } catch (err) {
      console.error('Provision user error:', err)
      return res.status(500).json({
        status: 'error',
        message: 'Failed to provision user account.',
      })
    }
  }
)

/**
 * @route   PATCH /api/admin/users/:id/status
 * @desc    Toggle account activation status (prevents self-deactivation)
 * @access  Private (SUPER_ADMIN only)
 */
router.patch(
  '/users/:id/status',
  requireAuth,
  requireRole(ROLES.SUPER_ADMIN),
  async (req, res) => {
    try {
      const { id } = req.params
      const { isActive } = req.body

      if (typeof isActive !== 'boolean') {
        return res.status(400).json({
          status: 'error',
          message: 'Field "isActive" must be a boolean (true/false).',
        })
      }

      // Prevent deactivating own account
      if (req.user._id.toString() === id) {
        return res.status(400).json({
          status: 'error',
          code: 'CANNOT_DEACTIVATE_SELF',
          message: 'Super Admin cannot deactivate their own active session.',
        })
      }

      const user = await User.findById(id)
      if (!user) {
        return res.status(404).json({
          status: 'error',
          message: 'User account not found.',
        })
      }

      user.isActive = isActive
      await user.save()

      return res.status(200).json({
        status: 'success',
        message: `Account status updated to ${isActive ? 'Active' : 'Deactivated'}.`,
        user: user.toJSON(),
      })
    } catch (err) {
      console.error('Update user status error:', err)
      return res.status(500).json({
        status: 'error',
        message: 'Failed to update user account status.',
      })
    }
  }
)

module.exports = router
