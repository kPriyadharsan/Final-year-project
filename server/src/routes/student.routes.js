const express = require('express')
const router = express.Router()
const { requireAuth, requireRole } = require('../middleware/auth.middleware')
const { ROLES } = require('../models/User')
const { Device } = require('../models/Device')

/**
 * @route   GET /api/student/test
 * @desc    Protected test endpoint accessible by STUDENT (and SUPER_ADMIN)
 * @access  Private (Requires valid JWT with STUDENT or SUPER_ADMIN role)
 */
router.get(
  '/test',
  requireAuth,
  requireRole(ROLES.STUDENT, ROLES.SUPER_ADMIN),
  (req, res) => {
    res.status(200).json({
      status: 'success',
      message: 'Access granted: Student privileges verified.',
      user: {
        id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role,
        department: req.user.department,
        assignedClasses: req.user.assignedClasses,
      },
      timestamp: new Date().toISOString(),
    })
  }
)

/**
 * @route   GET /api/student/classes
 * @desc    List active classrooms and available class schedules for enrolled student
 * @access  Private (STUDENT, SUPER_ADMIN)
 */
router.get(
  '/classes',
  requireAuth,
  requireRole(ROLES.STUDENT, ROLES.SUPER_ADMIN),
  async (req, res) => {
    try {
      const distinctClassrooms = await Device.distinct('classroom', { isActive: true })

      return res.status(200).json({
        status: 'success',
        student: {
          id: req.user._id,
          name: req.user.name,
          enrolledClasses: req.user.assignedClasses || [],
        },
        availableClassrooms: distinctClassrooms,
        timestamp: new Date().toISOString(),
      })
    } catch (err) {
      console.error('Student classes error:', err)
      return res.status(500).json({
        status: 'error',
        message: 'Failed to retrieve student classroom information.',
      })
    }
  }
)

module.exports = router
