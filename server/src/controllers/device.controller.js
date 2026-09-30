const mongoose = require('mongoose')
const { Device, DEVICE_TYPES, DEVICE_STATES } = require('../models/Device')

/**
 * @desc    Get all devices (with optional filters)
 * @route   GET /api/devices
 * @access  Private (SUPER_ADMIN, TEACHER)
 */
async function getDevices(req, res) {
  try {
    const { classroom, type, state, isOnline, isActive } = req.query

    const filter = {}

    // Filter by classroom (case-insensitive substring or exact match)
    if (classroom && typeof classroom === 'string' && classroom.trim() !== '') {
      filter.classroom = { $regex: new RegExp(`^${classroom.trim()}$`, 'i') }
    }

    // Filter by device type
    if (type && typeof type === 'string' && type.trim() !== '') {
      const upperType = type.trim().toUpperCase()
      if (Object.values(DEVICE_TYPES).includes(upperType)) {
        filter.type = upperType
      }
    }

    // Filter by operating state
    if (state && typeof state === 'string' && state.trim() !== '') {
      const upperState = state.trim().toUpperCase()
      if (Object.values(DEVICE_STATES).includes(upperState)) {
        filter.state = upperState
      }
    }

    // Filter by isOnline status
    if (typeof isOnline !== 'undefined') {
      if (isOnline === 'true' || isOnline === true) filter.isOnline = true
      if (isOnline === 'false' || isOnline === false) filter.isOnline = false
    }

    // Filter by isActive status (defaults to true if not specified)
    if (typeof isActive !== 'undefined') {
      if (isActive === 'true' || isActive === true) filter.isActive = true
      if (isActive === 'false' || isActive === false) filter.isActive = false
    } else {
      filter.isActive = true
    }

    const devices = await Device.find(filter)
      .sort({ classroom: 1, type: 1, name: 1 })
      .lean()

    res.status(200).json({
      status: 'success',
      count: devices.length,
      devices,
    })
  } catch (err) {
    console.error('Error fetching devices:', err)
    res.status(500).json({
      status: 'error',
      code: 'SERVER_ERROR',
      message: 'Failed to retrieve devices from database.',
    })
  }
}

/**
 * @desc    Get single device by MongoDB _id or deviceId
 * @route   GET /api/devices/:id
 * @access  Private (SUPER_ADMIN, TEACHER)
 */
async function getDeviceById(req, res) {
  try {
    const { id } = req.params

    if (!id || typeof id !== 'string' || id.trim() === '') {
      return res.status(400).json({
        status: 'error',
        code: 'INVALID_ID',
        message: 'Device identifier parameter is required.',
      })
    }

    let device = null

    // 1. Try finding by MongoDB ObjectId if format matches
    if (mongoose.Types.ObjectId.isValid(id)) {
      device = await Device.findById(id).lean()
    }

    // 2. Fallback: Search by unique hardware deviceId
    if (!device) {
      device = await Device.findOne({
        deviceId: id.trim().toUpperCase(),
      }).lean()
    }

    if (!device) {
      return res.status(404).json({
        status: 'error',
        code: 'DEVICE_NOT_FOUND',
        message: `Device with identifier "${id}" was not found.`,
      })
    }

    res.status(200).json({
      status: 'success',
      device,
    })
  } catch (err) {
    console.error('Error fetching device by id:', err)
    res.status(500).json({
      status: 'error',
      code: 'SERVER_ERROR',
      message: 'Failed to retrieve device details.',
    })
  }
}

module.exports = {
  getDevices,
  getDeviceById,
}
