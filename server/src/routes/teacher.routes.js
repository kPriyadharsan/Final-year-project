const express = require('express')
const router = express.Router()
const { requireAuth, requireRole } = require('../middleware/auth.middleware')
const { ROLES } = require('../models/User')

/**
 * @route   GET /api/teacher/test
 * @desc    Protected test endpoint accessible by TEACHER (and SUPER_ADMIN)
 * @access  Private (Requires valid JWT with TEACHER or SUPER_ADMIN role)
 */
router.get(
  '/test',
  requireAuth,
  requireRole(ROLES.TEACHER, ROLES.SUPER_ADMIN),
  (req, res) => {
    res.status(200).json({
      status: 'success',
      message: 'Access granted: Teacher privileges verified.',
      user: {
        id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role,
        department: req.user.department,
        hasDashboardAccess: req.user.hasDashboardAccess,
      },
      timestamp: new Date().toISOString(),
    })
  }
)

module.exports = router
