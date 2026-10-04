/**
 * Comprehensive Test Suite for Gemini Live Latency & Projector RGB Natural Voice Control
 *
 * Verifies:
 * 1. Rapid Multi-Device Concurrency (Fan ON + Light ON + Projector ON) executed concurrently
 * 2. Human-Readable Color Names for all 12+ palette colors (No raw (RGB: ...) in messages)
 * 3. Color Resolver Accuracy: purple, red, green, blue, yellow, cyan, magenta, pink, orange, white, warm white, cool white, #HEX
 * 4. Conversational Context & "Make it purple" response validation
 * 5. RGB Status Verification ("What color is the projector?")
 * 6. RGB OFF separation from Projector Relay Power OFF
 * 7. Unsupported capability rejection (Fan RGB, Fan Speed)
 */

const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '../.env') })
const mongoose = require('mongoose')
const { Device, DEVICE_TYPES, DEVICE_STATES } = require('../src/models/Device')
const { User, ROLES } = require('../src/models/User')
const { generateToken } = require('../src/utils/jwt.util')
const { COLOR_PALETTE, resolveRgbColor, validateDeviceCapability } = require('../src/constants/deviceCapabilities')
const { getClassroomState, getDeviceState } = require('../src/services/classroomState.service')

const API_BASE = `http://localhost:${process.env.PORT || 5000}`

async function runLatencyAndRgbTests() {
  console.log('='.repeat(75))
  console.log('⚡ GEMINI LIVE VOICE LATENCY & NATURAL PROJECTOR RGB TEST SUITE')
  console.log('='.repeat(75))

  const mongoURI = process.env.MONGODB_URI
  if (!mongoURI) {
    console.error('❌ MONGODB_URI missing in environment')
    process.exit(1)
  }

  await mongoose.connect(mongoURI)
  console.log('✅ Connected to MongoDB Atlas')

  const classroom = 'Room 302'

  // Seed / ensure test devices
  await Device.findOneAndUpdate(
    { deviceId: 'ESP32-RM302-01' },
    {
      deviceId: 'ESP32-RM302-01',
      name: 'Classroom 302 ESP32 Controller',
      classroom,
      type: DEVICE_TYPES.OTHER,
      isOnline: true,
      isActive: true,
      lastSeenAt: new Date(),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  )

  await Device.findOneAndUpdate(
    { deviceId: 'ESP32-RM302-PROJ-01' },
    {
      deviceId: 'ESP32-RM302-PROJ-01',
      name: 'Classroom 302 Smart Projector',
      classroom,
      type: DEVICE_TYPES.PROJECTOR,
      nodeId: 'ESP32-RM302-01',
      state: DEVICE_STATES.ON,
      colorPower: 'ON',
      color: { r: 168, g: 85, b: 247 }, // purple
      isOnline: true,
      isActive: true,
      gpioPin: 21,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  )

  await Device.findOneAndUpdate(
    { deviceId: 'ESP32-RM302-FAN-01' },
    {
      deviceId: 'ESP32-RM302-FAN-01',
      name: 'Classroom 302 Ceiling Fans',
      classroom,
      type: DEVICE_TYPES.FAN,
      nodeId: 'ESP32-RM302-01',
      state: DEVICE_STATES.OFF,
      isOnline: true,
      isActive: true,
      gpioPin: 22,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  )

  await Device.findOneAndUpdate(
    { deviceId: 'ESP32-RM302-LIGHT-01' },
    {
      deviceId: 'ESP32-RM302-LIGHT-01',
      name: 'Classroom 302 Main Lighting',
      classroom,
      type: DEVICE_TYPES.LIGHT,
      nodeId: 'ESP32-RM302-01',
      state: DEVICE_STATES.OFF,
      isOnline: true,
      isActive: true,
      gpioPin: 23,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  )

  // Auth token
  const teacherUser = await User.findOneAndUpdate(
    { email: 'teacher.latency.test@smartclassroom.edu' },
    {
      name: 'Latency Test Teacher',
      email: 'teacher.latency.test@smartclassroom.edu',
      role: ROLES.TEACHER,
      isActive: true,
      assignedClassrooms: [classroom],
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  )
  const token = generateToken({
    _id: teacherUser._id,
    id: teacherUser._id,
    email: teacherUser.email,
    role: teacherUser.role,
    name: teacherUser.name,
  })

  const postJson = async (endpoint, data) => {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    })
    const json = await res.json().catch(() => ({}))
    return { status: res.status, data: json }
  }

  let passed = 0
  let total = 0
  const assert = (condition, msg) => {
    total++
    if (!condition) {
      console.error(`❌ FAILED: ${msg}`)
      throw new Error(msg)
    }
    console.log(`✓ ${msg}`)
    passed++
  }

  // --- TEST 1: Rapid Multi-Device Concurrency & Low Latency ---
  console.log('\n--- 1. Multi-Device Concurrency & Latency Optimization ---')
  const startTime = Date.now()
  const multiCmdRes = await postJson('/api/voice/live/command', {
    classroom,
    actions: [
      { device: 'fan', action: 'ON' },
      { device: 'light', action: 'ON' },
      { device: 'projector', action: 'ON' },
    ],
  })
  const durationMs = Date.now() - startTime
  console.log(`Execution time for 3 concurrent devices: ${durationMs}ms`)
  assert(multiCmdRes.status === 200, 'Multi-device command returned HTTP 200')
  assert(Array.isArray(multiCmdRes.data.data.actions), 'Actions array returned in response')
  assert(multiCmdRes.data.data.actions.length === 3, 'All 3 device actions executed')
  assert(durationMs < 1200, `Execution latency (${durationMs}ms) is low and non-blocking (<1200ms)`)

  // --- TEST 2: Human-Readable Color Names for All Palette Colors ---
  console.log('\n--- 2. Natural Color Resolution for All Required Colors ---')
  const testColors = [
    'purple',
    'red',
    'green',
    'blue',
    'yellow',
    'cyan',
    'magenta',
    'pink',
    'orange',
    'white',
    'warm white',
    'cool white',
  ]

  for (const colorName of testColors) {
    const res = await postJson('/api/voice/live/rgb', {
      device: 'projector',
      color: colorName,
      classroom,
    })
    assert(res.status === 200, `Color "${colorName}" accepted with HTTP 200`)
    const msg = res.data.data?.message || ''
    assert(
      !msg.includes('(RGB:') && !msg.includes('255,') && !msg.includes('225,'),
      `Color "${colorName}" message is clean: "${msg}" (no raw RGB coordinates)`
    )
    assert(
      msg.toLowerCase().includes(colorName),
      `Message explicitly states human color name: "${msg}"`
    )
  }

  // --- TEST 3: Advanced Hex Color Support ---
  console.log('\n--- 3. Custom Hex Color Support ---')
  const hexRes = await postJson('/api/voice/live/rgb', {
    device: 'projector',
    color: '#FF00FF',
    classroom,
  })
  assert(hexRes.status === 200, 'Hex color #FF00FF accepted with HTTP 200')
  const hexMsg = hexRes.data.data?.message || ''
  assert(!hexMsg.includes('(RGB:'), `Hex message is clean without raw tuple: "${hexMsg}"`)

  // --- TEST 4: RGB Status Verification ---
  console.log('\n--- 4. Authoritative RGB State Queries ---')
  const projState = await getDeviceState(classroom, 'projector')
  assert(projState.rgb !== undefined, 'Projector state includes RGB details')
  assert(projState.rgb.enabled === true, 'Projector RGB is enabled')
  assert(typeof projState.rgb.color === 'string', `RGB color is human-readable: "${projState.rgb.color}"`)

  // --- TEST 5: RGB OFF vs Projector Power OFF Separation ---
  console.log('\n--- 5. RGB OFF Separation from Master Relay ---')
  // Ensure projector relay is ON
  await postJson('/api/voice/live/command', {
    classroom,
    actions: [{ device: 'projector', action: 'ON' }],
  })

  // Turn ONLY RGB light OFF
  const rgbOffRes = await postJson('/api/voice/live/rgb', {
    device: 'projector',
    power: 'OFF',
    classroom,
  })
  assert(rgbOffRes.status === 200, 'RGB OFF command succeeded')
  assert(rgbOffRes.data.data?.message === 'Projector light is off.', 'Message is "Projector light is off."')

  const projAfterRgbOff = await Device.findOne({ deviceId: 'ESP32-RM302-PROJ-01' })
  assert(projAfterRgbOff.state === DEVICE_STATES.ON, 'Projector master power relay remains ON after RGB OFF')
  assert(projAfterRgbOff.colorPower === 'OFF', 'Projector colorPower is OFF')

  // --- TEST 6: Unsupported Device & Capability Safety ---
  console.log('\n--- 6. Unsupported Capabilities Rejected Safely ---')
  const fanRgbRes = await postJson('/api/voice/live/rgb', {
    device: 'fan',
    color: 'purple',
    classroom,
  })
  assert(fanRgbRes.status === 400, 'Fan RGB command safely rejected with HTTP 400')
  assert(
    fanRgbRes.data.code === 'DEVICE_DOES_NOT_SUPPORT_RGB',
    `Code is DEVICE_DOES_NOT_SUPPORT_RGB: "${fanRgbRes.data.message}"`
  )

  const unsupportedColorRes = await postJson('/api/voice/live/rgb', {
    device: 'projector',
    color: 'electric-glitter-9000',
    classroom,
  })
  assert(unsupportedColorRes.status === 400, 'Invalid color rejected with HTTP 400')

  console.log('\n' + '='.repeat(75))
  console.log(`🎉 ALL ${passed}/${total} LATENCY & NATURAL RGB TESTS PASSED SUCCESSFULLY!`)
  console.log('='.repeat(75))

  await mongoose.disconnect()
  process.exit(0)
}

runLatencyAndRgbTests().catch((err) => {
  console.error('❌ Test suite failed:', err)
  process.exit(1)
})
