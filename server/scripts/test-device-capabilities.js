const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '../.env') })
const mongoose = require('mongoose')
const { Device, DEVICE_TYPES } = require('../src/models/Device')
const { User, ROLES } = require('../src/models/User')
const { generateToken } = require('../src/utils/jwt.util')
const { resolveRgbColor, validateDeviceCapability } = require('../src/constants/deviceCapabilities')

const API_BASE = `http://localhost:${process.env.PORT || 5000}`

async function runCapabilityTests() {
  console.log('\n======================================================================')
  console.log('🧪 TESTING DEVICE CAPABILITY MODEL & RGB COLOR INTEGRATION')
  console.log('======================================================================\n')

  await mongoose.connect(process.env.MONGODB_URI)
  console.log('✅ Connected to MongoDB Atlas')

  // Auth setup
  let teacher = await User.findOne({ role: ROLES.TEACHER })
  if (!teacher) {
    teacher = await User.create({
      name: 'Capability Teacher',
      email: 'capability.teacher@smartclassroom.edu',
      password: 'TeacherPassword123!',
      role: ROLES.TEACHER,
    })
  }
  const token = generateToken({
    id: teacher._id.toString(),
    email: teacher.email,
    role: teacher.role,
  })

  // Ensure devices are online
  await Device.updateMany({ classroom: 'Room 302' }, { isOnline: true })

  // 1. Test Color Resolver
  console.log('--- 1. Testing Color Palette Resolver ---')
  const purple = resolveRgbColor('purple')
  console.log('  Resolved "purple":', purple)
  if (purple && purple.r === 168 && purple.g === 85 && purple.b === 247) {
    console.log('✅ PASS: resolveRgbColor("purple") correctly resolved')
  } else {
    throw new Error('resolveRgbColor("purple") failed')
  }

  const cyan = resolveRgbColor('cyan')
  console.log('  Resolved "cyan":', cyan)
  if (cyan && cyan.r === 6 && cyan.g === 182 && cyan.b === 212) {
    console.log('✅ PASS: resolveRgbColor("cyan") correctly resolved')
  } else {
    throw new Error('resolveRgbColor("cyan") failed')
  }

  // 2. Test Capability Validator
  console.log('\n--- 2. Testing Capability Validator ---')
  const projRgb = validateDeviceCapability('projector', 'SET_COLOR', 'rgb')
  console.log('  projector SET_COLOR capability:', projRgb.valid)
  if (projRgb.valid) {
    console.log('✅ PASS: projector supports rgb SET_COLOR')
  } else {
    throw new Error('projector capability check failed')
  }

  const fanRgb = validateDeviceCapability('fan', 'SET_COLOR', 'rgb')
  console.log('  fan SET_COLOR capability:', fanRgb.valid, '| Error:', fanRgb.error)
  if (!fanRgb.valid) {
    console.log('✅ PASS: fan correctly rejects rgb capability')
  } else {
    throw new Error('fan should not support rgb')
  }

  const lightRgb = validateDeviceCapability('light', 'SET_COLOR', 'rgb')
  console.log('  light SET_COLOR capability:', lightRgb.valid, '| Error:', lightRgb.error)
  if (!lightRgb.valid) {
    console.log('✅ PASS: light correctly rejects rgb capability')
  } else {
    throw new Error('light should not support rgb')
  }

  // 3. Test HTTP POST /api/voice/live/command with RGB
  console.log('\n--- 3. Testing POST /api/voice/live/command with Projector RGB (purple) ---')
  const rgbRes = await fetch(`${API_BASE}/api/voice/live/command`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      classroom: 'Room 302',
      actions: [
        {
          device: 'projector',
          capability: 'rgb',
          action: 'SET_COLOR',
          color: 'purple',
        },
      ],
    }),
  })
  const rgbData = await rgbRes.json()
  console.log('  Response:', JSON.stringify(rgbData))
  if (rgbRes.ok && rgbData.status === 'success' && rgbData.data.actions[0].success) {
    console.log('✅ PASS: Projector RGB SET_COLOR purple succeeded via Live API!')
  } else {
    throw new Error(`Projector RGB failed: ${JSON.stringify(rgbData)}`)
  }

  // 4. Test Batch: Fan ON + Projector RGB Cyan
  console.log('\n--- 4. Testing Multi-Action Batch: Fan ON + Projector Cyan ---')
  const batchRes = await fetch(`${API_BASE}/api/voice/live/command`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      classroom: 'Room 302',
      actions: [
        { device: 'fan', action: 'ON' },
        { device: 'projector', capability: 'rgb', action: 'SET_COLOR', color: 'cyan' },
      ],
    }),
  })
  const batchData = await batchRes.json()
  console.log('  Response:', JSON.stringify(batchData))
  if (batchRes.ok && batchData.status === 'success' && batchData.data.actions.length === 2) {
    console.log('✅ PASS: Multi-Action Batch (Power + RGB) executed successfully!')
  } else {
    throw new Error(`Batch command failed: ${JSON.stringify(batchData)}`)
  }

  // 5. Test Capability Rejection: Fan RGB request rejected
  console.log('\n--- 5. Testing Live API Capability Rejection: Fan RGB ---')
  const rejectRes = await fetch(`${API_BASE}/api/voice/live/command`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      classroom: 'Room 302',
      actions: [
        { device: 'fan', capability: 'rgb', action: 'SET_COLOR', color: 'purple' },
      ],
    }),
  })
  const rejectData = await rejectRes.json()
  console.log('  Response:', JSON.stringify(rejectData))
  if (rejectRes.status === 400 && rejectData.code === 'INVALID_ACTION') {
    console.log('✅ PASS: Fan RGB request properly rejected with HTTP 400 INVALID_ACTION')
  } else {
    throw new Error('Fan RGB request should have been rejected')
  }

  await mongoose.disconnect()
  console.log('\n======================================================================')
  console.log('🎉 ALL DEVICE CAPABILITY MODEL TESTS PASSED!')
  console.log('======================================================================\n')
}

runCapabilityTests().catch((err) => {
  console.error('❌ Capability tests failed:', err)
  process.exit(1)
})
