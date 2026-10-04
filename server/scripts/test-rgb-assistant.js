/**
 * Dedicated Test Suite for Smart Classroom Projector RGB LED Assistant Integration
 *
 * Verifies all 8 requirements:
 * 1. purple (named color / object notation)
 * 2. red (primary color)
 * 3. blue (primary color)
 * 4. hex color (e.g. #FF00FF)
 * 5. unsupported device (e.g. fan RGB rejected safely with 400)
 * 6. unsupported color (e.g. invalid color rejected safely with 400)
 * 7. ambiguous context & RGB OFF behavior (RGB OFF vs Projector Relay OFF)
 * 8. combined projector ON + RGB (sequential safe ordering: POWER ON -> RGB SET)
 */

const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '../.env') })
const mongoose = require('mongoose')
const { Device, DEVICE_TYPES, DEVICE_STATES } = require('../src/models/Device')
const { User, ROLES } = require('../src/models/User')
const { generateToken } = require('../src/utils/jwt.util')
const { getCommandTopic, getStateTopic, getProjectorColorCommandTopic, getProjectorColorStateTopic } = require('../src/utils/mqttTopics')
const { resolveRgbColor, validateDeviceCapability } = require('../src/constants/deviceCapabilities')

const API_BASE = `http://localhost:${process.env.PORT || 5000}`

async function runRgbTests() {
  console.log('='.repeat(70))
  console.log('🎨 SMART CLASSROOM PROJECTOR RGB ASSISTANT TEST SUITE')
  console.log('='.repeat(70))

  const mongoURI = process.env.MONGODB_URI
  if (!mongoURI) {
    console.error('❌ MONGODB_URI missing in environment')
    process.exit(1)
  }

  await mongoose.connect(mongoURI)
  console.log('✅ Connected to MongoDB Atlas')

  const classroom = 'Room 302'

  // 1. Prepare controller node & projector hardware record
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

  const projDevice = await Device.findOneAndUpdate(
    { deviceId: 'ESP32-RM302-PROJ-01' },
    {
      deviceId: 'ESP32-RM302-PROJ-01',
      name: 'Classroom 302 Smart Projector',
      classroom,
      type: DEVICE_TYPES.PROJECTOR,
      nodeId: 'ESP32-RM302-01',
      mqttCommandTopic: getCommandTopic(classroom, 'projector'),
      mqttStatusTopic: getStateTopic(classroom, 'projector'),
      state: DEVICE_STATES.ON,
      colorPower: 'ON',
      color: { r: 168, g: 85, b: 247 }, // purple
      isOnline: true,
      isActive: true,
      gpioPin: 21,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  )

  const fanDevice = await Device.findOneAndUpdate(
    { deviceId: 'ESP32-RM302-FAN-01' },
    {
      deviceId: 'ESP32-RM302-FAN-01',
      name: 'Classroom 302 Ceiling Fans',
      classroom,
      type: DEVICE_TYPES.FAN,
      nodeId: 'ESP32-RM302-01',
      mqttCommandTopic: getCommandTopic(classroom, 'fan'),
      mqttStatusTopic: getStateTopic(classroom, 'fan'),
      state: DEVICE_STATES.ON,
      isOnline: true,
      isActive: true,
      gpioPin: 22,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  )

  console.log(`✓ Projector ready: ${projDevice.name} (${projDevice.deviceId}), state: ${projDevice.state}`)

  // 2. Auth token
  const teacherUser = await User.findOneAndUpdate(
    { email: 'teacher.device.test@smartclassroom.edu' },
    {
      name: 'Prof. Test Teacher',
      email: 'teacher.device.test@smartclassroom.edu',
      password: 'HashPassword123!',
      role: ROLES.TEACHER,
      isActive: true,
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

  // Helper fetch
  async function postJson(endpoint, body) {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    return { status: res.status, ok: res.ok, data }
  }

  // --- TEST 1: PURPLE (Named Color Object / String) ---
  console.log('\n--- 1. Test Color: PURPLE ("make it purple" / { name: "purple" }) ---')
  const resPurple = await postJson('/api/voice/live/rgb', {
    device: 'projector',
    color: { name: 'purple' },
    classroom,
  })
  console.log('Response:', JSON.stringify(resPurple.data))
  if (resPurple.status !== 200 || resPurple.data.status !== 'success') {
    throw new Error(`Test 1 Failed: Expected 200 success, got ${resPurple.status}`)
  }
  const purpleRgb = resPurple.data.data.color
  if (purpleRgb.r !== 168 || purpleRgb.g !== 85 || purpleRgb.b !== 247) {
    throw new Error(`Test 1 Failed: Unexpected RGB values for purple: ${JSON.stringify(purpleRgb)}`)
  }
  console.log(`✓ Resolved Purple -> R:${purpleRgb.r} G:${purpleRgb.g} B:${purpleRgb.b} (${purpleRgb.hex})`)
  console.log('✅ PASS: Test 1 (purple)')

  // --- TEST 2: RED ---
  console.log('\n--- 2. Test Color: RED ---')
  const resRed = await postJson('/api/voice/live/rgb', {
    device: 'projector',
    color: 'red',
    classroom,
  })
  console.log('Response:', JSON.stringify(resRed.data))
  if (resRed.status !== 200 || resRed.data.status !== 'success') {
    throw new Error(`Test 2 Failed: Expected 200 success, got ${resRed.status}`)
  }
  const redRgb = resRed.data.data.color
  if (redRgb.r !== 255 || redRgb.g !== 0 || redRgb.b !== 0) {
    throw new Error(`Test 2 Failed: Unexpected RGB values for red: ${JSON.stringify(redRgb)}`)
  }
  console.log(`✓ Resolved Red -> R:${redRgb.r} G:${redRgb.g} B:${redRgb.b}`)
  console.log('✅ PASS: Test 2 (red)')

  // --- TEST 3: BLUE ---
  console.log('\n--- 3. Test Color: BLUE ---')
  const resBlue = await postJson('/api/voice/live/rgb', {
    device: 'projector',
    color: 'blue',
    classroom,
  })
  console.log('Response:', JSON.stringify(resBlue.data))
  if (resBlue.status !== 200 || resBlue.data.status !== 'success') {
    throw new Error(`Test 3 Failed: Expected 200 success, got ${resBlue.status}`)
  }
  const blueRgb = resBlue.data.data.color
  if (blueRgb.r !== 0 || blueRgb.g !== 0 || blueRgb.b !== 255) {
    throw new Error(`Test 3 Failed: Unexpected RGB values for blue: ${JSON.stringify(blueRgb)}`)
  }
  console.log(`✓ Resolved Blue -> R:${blueRgb.r} G:${blueRgb.g} B:${blueRgb.b}`)
  console.log('✅ PASS: Test 3 (blue)')

  // --- TEST 4: HEX COLOR (#FF00FF) ---
  console.log('\n--- 4. Test Color: HEX COLOR (#FF00FF) ---')
  const resHex = await postJson('/api/voice/live/rgb', {
    device: 'projector',
    color: '#FF00FF',
    classroom,
  })
  console.log('Response:', JSON.stringify(resHex.data))
  if (resHex.status !== 200 || resHex.data.status !== 'success') {
    throw new Error(`Test 4 Failed: Expected 200 success, got ${resHex.status}`)
  }
  const hexRgb = resHex.data.data.color
  if (hexRgb.r !== 255 || hexRgb.g !== 0 || hexRgb.b !== 255 || hexRgb.hex !== '#FF00FF') {
    throw new Error(`Test 4 Failed: Unexpected RGB values for hex #FF00FF: ${JSON.stringify(hexRgb)}`)
  }
  console.log(`✓ Resolved Hex #FF00FF -> R:${hexRgb.r} G:${hexRgb.g} B:${hexRgb.b}`)
  console.log('✅ PASS: Test 4 (hex color)')

  // --- TEST 5: UNSUPPORTED DEVICE REJECTION ---
  console.log('\n--- 5. Test Unsupported Device: Fan with RGB ---')
  const resUnsupDev = await postJson('/api/voice/live/rgb', {
    device: 'fan',
    color: 'purple',
    classroom,
  })
  console.log('Response:', JSON.stringify(resUnsupDev.data))
  if (resUnsupDev.status !== 400 || resUnsupDev.data.code !== 'DEVICE_DOES_NOT_SUPPORT_RGB') {
    throw new Error(`Test 5 Failed: Expected 400 DEVICE_DOES_NOT_SUPPORT_RGB, got ${resUnsupDev.status} / ${resUnsupDev.data?.code}`)
  }
  console.log(`✓ Safely rejected fan RGB: "${resUnsupDev.data.message}"`)
  console.log('✅ PASS: Test 5 (unsupported device safely rejected)')

  // --- TEST 6: UNSUPPORTED COLOR REJECTION ---
  console.log('\n--- 6. Test Unsupported Color: "ultraviolet-sparkle-xyz" ---')
  const resUnsupColor = await postJson('/api/voice/live/rgb', {
    device: 'projector',
    color: 'ultraviolet-sparkle-xyz',
    classroom,
  })
  console.log('Response:', JSON.stringify(resUnsupColor.data))
  if (resUnsupColor.status !== 400 || resUnsupColor.data.code !== 'UNSUPPORTED_COLOR') {
    throw new Error(`Test 6 Failed: Expected 400 UNSUPPORTED_COLOR, got ${resUnsupColor.status} / ${resUnsupColor.data?.code}`)
  }
  console.log(`✓ Safely rejected unsupported color: "${resUnsupColor.data.message}"`)
  console.log('✅ PASS: Test 6 (unsupported color safely rejected)')

  // --- TEST 7: AMBIGUOUS CONTEXT & RGB OFF BEHAVIOR ---
  console.log('\n--- 7. Test Ambiguous Context & RGB OFF Behavior ---')
  // Case A: User meant RGB LED OFF -> call set_classroom_rgb with power: "OFF"
  const resRgbOff = await postJson('/api/voice/live/rgb', {
    device: 'projector',
    power: 'OFF',
    classroom,
  })
  console.log('RGB OFF Response:', JSON.stringify(resRgbOff.data))
  if (resRgbOff.status !== 200 || resRgbOff.data.data?.power !== 'OFF') {
    throw new Error('Test 7A Failed: RGB LED did not switch to power OFF')
  }

  // Projector relay should remain ON!
  const dbProjAfterRgbOff = await Device.findOne({ deviceId: 'ESP32-RM302-PROJ-01' })
  if (dbProjAfterRgbOff.state !== DEVICE_STATES.ON) {
    throw new Error(`Test 7A Failed: Projector relay was turned OFF by RGB OFF command! State: ${dbProjAfterRgbOff.state}`)
  }
  console.log(`✓ Projector master relay preserved as ON: ${dbProjAfterRgbOff.state}, RGB LED turned: ${dbProjAfterRgbOff.colorPower}`)

  // Case B: User meant Projector device OFF -> call control_classroom_devices with action: "OFF"
  const resProjOff = await postJson('/api/voice/live/command', {
    actions: [{ device: 'projector', action: 'OFF' }],
    classroom,
  })
  console.log('Projector OFF Response:', JSON.stringify(resProjOff.data))
  const dbProjAfterProjOff = await Device.findOne({ deviceId: 'ESP32-RM302-PROJ-01' })
  if (dbProjAfterProjOff.state !== DEVICE_STATES.OFF) {
    throw new Error('Test 7B Failed: Projector master relay was not turned OFF')
  }
  console.log(`✓ Projector master relay turned OFF: ${dbProjAfterProjOff.state}`)
  console.log('✅ PASS: Test 7 (ambiguous context & RGB OFF behavior)')

  // --- TEST 8: COMBINED PROJECTOR ON + RGB (SEQUENTIAL ORDERING) ---
  console.log('\n--- 8. Test Combined Command: "Turn on the projector and make the light purple" ---')
  // Pass SET_COLOR first in array to verify backend sorts POWER ON before RGB SET
  const resCombined = await postJson('/api/voice/live/command', {
    actions: [
      { device: 'projector', action: 'SET_COLOR', color: 'purple' },
      { device: 'projector', action: 'ON' },
    ],
    classroom,
  })
  console.log('Combined Response:', JSON.stringify(resCombined.data))
  if (resCombined.status !== 200 || !resCombined.data.data?.actions) {
    throw new Error(`Test 8 Failed: Expected 200, got ${resCombined.status}`)
  }
  const orderedActions = resCombined.data.data.actions
  if (orderedActions[0].action !== 'ON' || orderedActions[1].action !== 'SET_COLOR') {
    throw new Error(`Test 8 Failed: Execution order was not POWER ON first, then RGB SET. Got: ${orderedActions.map(a => a.action).join(' -> ')}`)
  }
  console.log(`✓ Execution order verified: ${orderedActions[0].action} -> ${orderedActions[1].action}`)

  const dbFinalProj = await Device.findOne({ deviceId: 'ESP32-RM302-PROJ-01' })
  console.log(`✓ Final DB Projector State: relay=${dbFinalProj.state}, rgbPower=${dbFinalProj.colorPower}, color=(${dbFinalProj.color.r},${dbFinalProj.color.g},${dbFinalProj.color.b})`)
  if (dbFinalProj.state !== 'ON' || dbFinalProj.colorPower !== 'ON') {
    throw new Error('Test 8 Failed: Projector or RGB state in DB did not match')
  }
  console.log('✅ PASS: Test 8 (projector ON + RGB sequential ordering)')

  console.log('\n' + '='.repeat(70))
  console.log('🎉 ALL PROJECTOR RGB ASSISTANT TESTS PASSED SUCCESSFULLY!')
  console.log('='.repeat(70))

  await mongoose.disconnect()
  process.exit(0)
}

runRgbTests().catch((err) => {
  console.error('\n❌ RGB TEST SUITE ERROR:', err.message)
  mongoose.disconnect()
  process.exit(1)
})
