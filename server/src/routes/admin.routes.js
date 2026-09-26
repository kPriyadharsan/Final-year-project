const express = require('express')
const router = express.Router()
const { requireAuth, requireRole } = require('../middleware/auth.middleware')
const { ROLES } = require('../models/User')

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

module.exports = router
