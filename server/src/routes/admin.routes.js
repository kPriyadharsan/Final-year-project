const express = require('express')
const router = express.Router()
const mongoose = require('mongoose')
const { requireAuth, requireRole } = require('../middleware/auth.middleware')
const { User, ROLES } = require('../models/User')
const { Device } = require('../models/Device')
const { DeviceLog } = require('../models/DeviceLog')
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
 * @desc    Real-time aggregated telemetry, device counts, and system status from MongoDB
 * @access  Private (Requires valid JWT with SUPER_ADMIN role)
 */
router.get(
  '/dashboard',
  requireAuth,
  requireRole(ROLES.SUPER_ADMIN),
  async (req, res) => {
    try {
      const nodeFilter = { isActive: true, $or: [{ entityType: 'NODE' }, { deviceCategory: 'NODE' }, { type: 'OTHER' }] }
      const channelFilter = { isActive: true, $or: [{ entityType: 'CHANNEL' }, { deviceCategory: 'CHANNEL' }, { type: { $in: ['LIGHT', 'FAN', 'PROJECTOR'] } }] }

      const [
        teachersCount,
        studentsCount,
        teachersList,
        totalActiveNodes,
        onlineNodesCount,
        totalActiveChannels,
        channelsOnCount,
        classroomAgg,
        recentLogs,
      ] = await Promise.all([
        User.countDocuments({ role: ROLES.TEACHER }),
        User.countDocuments({ role: ROLES.STUDENT }),
        User.find({ role: ROLES.TEACHER })
          .select('-passwordHash')
          .sort({ createdAt: -1 })
          .limit(20)
          .lean(),
        Device.countDocuments(nodeFilter),
        Device.countDocuments({ ...nodeFilter, isOnline: true }),
        Device.countDocuments(channelFilter),
        Device.countDocuments({ ...channelFilter, state: 'ON' }),
        Device.aggregate([
          { $match: { isActive: true } },
          {
            $group: {
              _id: '$classroom',
              totalRecords: { $sum: 1 },
              totalNodes: {
                $sum: { $cond: [{ $or: [{ $eq: ['$entityType', 'NODE'] }, { $eq: ['$type', 'OTHER'] }] }, 1, 0] },
              },
              onlineNodes: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $eq: ['$isOnline', true] },
                        { $or: [{ $eq: ['$entityType', 'NODE'] }, { $eq: ['$type', 'OTHER'] }] },
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },
              totalChannels: {
                $sum: {
                  $cond: [
                    { $or: [{ $eq: ['$entityType', 'CHANNEL'] }, { $in: ['$type', ['LIGHT', 'FAN', 'PROJECTOR']] }] },
                    1,
                    0,
                  ],
                },
              },
              channelsOn: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $eq: ['$state', 'ON'] },
                        { $or: [{ $eq: ['$entityType', 'CHANNEL'] }, { $in: ['$type', ['LIGHT', 'FAN', 'PROJECTOR']] }] },
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },
              deviceTypes: {
                $addToSet: {
                  $cond: [
                    { $in: ['$type', ['LIGHT', 'FAN', 'PROJECTOR']] },
                    '$type',
                    '$$REMOVE',
                  ],
                },
              },
            },
          },
          { $sort: { _id: 1 } },
        ]),
        DeviceLog.find()
          .sort({ createdAt: -1 })
          .limit(10)
          .select('deviceName deviceId classroom action previousState newState mqttStatus userName userRole source createdAt')
          .lean(),
      ])

      const mongoStatus = getMongoStatus()
      const diagnostics = env.getDiagnostics()
      const liveMqtt = getMQTTStatus()

      const classrooms = classroomAgg
        .filter((c) => c._id)
        .map((c) => {
          const isRoomOnline = c.onlineNodes > 0
          const availableInRoom = isRoomOnline ? c.totalChannels : 0
          return {
            id: c._id.toLowerCase().replace(/[^a-z0-9]/g, '-'),
            name: c._id,
            nodes: c.totalNodes,
            onlineNodes: c.onlineNodes,
            relays: c.totalChannels,
            totalChannels: c.totalChannels,
            channelsOn: c.channelsOn || 0,
            availableChannels: availableInRoom,
            onlineChannels: availableInRoom,
            totalDevices: c.totalNodes,
            onlineDevices: c.onlineNodes,
            status: isRoomOnline ? 'Active' : 'Offline',
            deviceTypes: c.deviceTypes || [],
            devicesSummary: isRoomOnline
              ? `${c.channelsOn || 0} ON / ${availableInRoom} Available`
              : '0 Controllable • Node Offline',
          }
        })

      const totalClasses = classrooms.length
      const availableChannelsCount = classrooms.reduce((acc, c) => acc + c.availableChannels, 0)

      // Derived service statuses
      const mqttStatus = liveMqtt.connected ? 'connected' : (liveMqtt.status || 'offline')
      const geminiStatus = diagnostics.geminiConfigured ? 'active' : 'unconfigured'
      const systemStatus = mongoStatus === 'connected' ? 'operational' : 'degraded'

      res.status(200).json({
        status: 'success',
        metrics: {
          totalTeachers: teachersCount,
          totalStudents: studentsCount,
          // Physical IoT Nodes
          totalNodes: totalActiveNodes,
          onlineNodes: onlineNodesCount,
          offlineNodes: Math.max(0, totalActiveNodes - onlineNodesCount),
          // Relay Channels
          totalChannels: totalActiveChannels,
          channelsOn: channelsOnCount,
          channelsOff: Math.max(0, totalActiveChannels - channelsOnCount),
          availableChannels: availableChannelsCount,
          activeChannels: availableChannelsCount,
          // Backward-compatible metrics mapping
          totalDevices: totalActiveNodes,
          connectedDevices: onlineNodesCount,
          onlineDevices: onlineNodesCount,
          offlineDevices: Math.max(0, totalActiveNodes - onlineNodesCount),
          totalAppliances: totalActiveChannels,
          totalClasses,
          activeClassrooms: classrooms.map((c) => c.name),
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
            model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
            keyMasked: diagnostics.geminiMasked,
            speechEngine: 'Bilingual (Tamil / English)',
          },
        },
        classrooms,
        teachers: teachersList,
        recentActivities: recentLogs,
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

      if (!id || !mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          status: 'error',
          code: 'INVALID_USER_ID',
          message: 'Invalid user identifier format.',
        })
      }

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
