/**
 * Comprehensive Test Suite for Gemini Live Tool Calling & Batch Device Control
 *
 * Verifies all 11 requirements:
 * 1. fan ON
 * 2. light OFF
 * 3. projector ON
 * 4. fan + light ON
 * 5. fan + projector OFF
 * 6. everything OFF
 * 7. unsupported device
 * 8. invalid action
 * 9. empty actions
 * 10. malformed request
 * 11. partial execution failure
 */

const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '../.env') })
const mongoose = require('mongoose')
const { Device, DEVICE_TYPES, DEVICE_STATES } = require('../src/models/Device')
const { User, ROLES } = require('../src/models/User')
const { generateToken } = require('../src/utils/jwt.util')
const { getCommandTopic, getStateTopic } = require('../src/utils/mqttTopics')

const API_BASE = `http://localhost:${process.env.PORT || 5000}`

async function runTests() {
  console.log('='.repeat(70))
  console.log('🧪 GEMINI LIVE BATCH DEVICE COMMAND & TOOL VERIFICATION')
  console.log('='.repeat(70))

  const mongoURI = process.env.MONGODB_URI
  if (!mongoURI) {
    console.error('❌ MONGODB_URI missing in environment')
    process.exit(1)
  }

  await mongoose.connect(mongoURI)
  console.log('✅ Connected to MongoDB Atlas')

  // Prepare test devices in Room 302
  const classroom = 'Room 302'

  // Controller node (so devices can be online via node if needed)
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

  const lightDevice = await Device.findOneAndUpdate(
    { deviceId: 'ESP32-RM302-LIGHT-01' },
    {
      deviceId: 'ESP32-RM302-LIGHT-01',
      name: 'Classroom 302 Main Lights',
      classroom,
      type: DEVICE_TYPES.LIGHT,
      nodeId: 'ESP32-RM302-01',
      mqttCommandTopic: getCommandTopic(classroom, 'light'),
      mqttStatusTopic: getStateTopic(classroom, 'light'),
      state: DEVICE_STATES.ON,
      isOnline: true,
      isActive: true,
      gpioPin: 23,
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
      state: DEVICE_STATES.OFF,
      isOnline: true,
      isActive: true,
      gpioPin: 22,
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
      state: DEVICE_STATES.OFF,
      isOnline: true,
      isActive: true,
      gpioPin: 21,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  )

  console.log('✓ Target devices ready for Room 302 (Node, Light, Fan, Projector)')

  // Find or generate teacher user token
  let teacherUser = await User.findOne({ role: ROLES.TEACHER })
  if (!teacherUser) {
    teacherUser = await User.create({
      name: 'Gemini Live Teacher',
      email: 'live.teacher@smartclassroom.edu',
      password: 'LivePassword123!',
      role: ROLES.TEACHER,
      department: 'Computer Science',
    })
  }

  const token = generateToken({
    id: teacherUser._id.toString(),
    email: teacherUser.email,
    role: teacherUser.role,
  })
  console.log(`✓ Authentication ready for ${teacherUser.email}`)

  // Helper to call POST /api/voice/live/command
  async function callLiveCommand(payload) {
    const res = await fetch(`${API_BASE}/api/voice/live/command`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    })

    const data = await res.json()
    return { status: res.status, ok: res.ok, data }
  }

  // --- TEST 1: fan ON ---
  console.log('\n--- 1. Test fan ON ---')
  const res1 = await callLiveCommand({
    actions: [{ device: 'fan', action: 'ON' }],
    classroom,
  })
  console.log('Response:', JSON.stringify(res1.data))
  if (res1.status !== 200 || !res1.data.data?.actions[0]?.success) {
    throw new Error('Test 1 failed: Fan ON was not successful')
  }
  const checkFan1 = await Device.findOne({ deviceId: 'ESP32-RM302-FAN-01' })
  console.log(`✓ Fan state in DB: ${checkFan1.state}`)
  console.log('✅ PASS: Test 1 (fan ON)')

  // --- TEST 2: light OFF ---
  console.log('\n--- 2. Test light OFF ---')
  await Device.updateOne({ deviceId: 'ESP32-RM302-LIGHT-01' }, { state: 'ON' })
  const res2 = await callLiveCommand({
    actions: [{ device: 'light', action: 'OFF' }],
    classroom,
  })
  console.log('Response:', JSON.stringify(res2.data))
  if (res2.status !== 200 || !res2.data.data?.actions[0]?.success) {
    throw new Error('Test 2 failed: Light OFF was not successful')
  }
  const checkLight2 = await Device.findOne({ deviceId: 'ESP32-RM302-LIGHT-01' })
  console.log(`✓ Light state in DB: ${checkLight2.state}`)
  console.log('✅ PASS: Test 2 (light OFF)')

  // --- TEST 3: projector ON ---
  console.log('\n--- 3. Test projector ON ---')
  const res3 = await callLiveCommand({
    actions: [{ device: 'projector', action: 'ON' }],
    classroom,
  })
  console.log('Response:', JSON.stringify(res3.data))
  if (res3.status !== 200 || !res3.data.data?.actions[0]?.success) {
    throw new Error('Test 3 failed: Projector ON was not successful')
  }
  const checkProj3 = await Device.findOne({ deviceId: 'ESP32-RM302-PROJ-01' })
  console.log(`✓ Projector state in DB: ${checkProj3.state}, colorPower: ${checkProj3.colorPower}`)
  console.log('✅ PASS: Test 3 (projector ON)')

  // --- TEST 4: fan + light ON ---
  console.log('\n--- 4. Test fan + light ON ---')
  const res4 = await callLiveCommand({
    actions: [
      { device: 'fan', action: 'ON' },
      { device: 'light', action: 'ON' },
    ],
    classroom,
  })
  console.log('Response:', JSON.stringify(res4.data))
  if (
    res4.status !== 200 ||
    res4.data.data?.actions?.length !== 2 ||
    !res4.data.data.actions.every((a) => a.success)
  ) {
    throw new Error('Test 4 failed: Fan + Light ON was not successful')
  }
  console.log('✅ PASS: Test 4 (fan + light ON)')

  // --- TEST 5: fan + projector OFF ---
  console.log('\n--- 5. Test fan + projector OFF ---')
  const res5 = await callLiveCommand({
    actions: [
      { device: 'fan', action: 'OFF' },
      { device: 'projector', action: 'OFF' },
    ],
    classroom,
  })
  console.log('Response:', JSON.stringify(res5.data))
  if (
    res5.status !== 200 ||
    res5.data.data?.actions?.length !== 2 ||
    !res5.data.data.actions.every((a) => a.success)
  ) {
    throw new Error('Test 5 failed: Fan + Projector OFF was not successful')
  }
  console.log('✅ PASS: Test 5 (fan + projector OFF)')

  // --- TEST 6: everything OFF ---
  console.log('\n--- 6. Test everything OFF (all devices) ---')
  const res6 = await callLiveCommand({
    actions: [
      { device: 'light', action: 'OFF' },
      { device: 'fan', action: 'OFF' },
      { device: 'projector', action: 'OFF' },
    ],
    classroom,
  })
  console.log('Response:', JSON.stringify(res6.data))
  if (
    res6.status !== 200 ||
    res6.data.data?.actions?.length !== 3 ||
    !res6.data.data.actions.every((a) => a.success)
  ) {
    throw new Error('Test 6 failed: Everything OFF was not successful')
  }
  console.log('✅ PASS: Test 6 (everything OFF)')

  // --- TEST 7: unsupported device ---
  console.log('\n--- 7. Test unsupported device rejection ---')
  const res7 = await callLiveCommand({
    actions: [{ device: 'air_conditioner', action: 'ON' }],
    classroom,
  })
  console.log('Response:', JSON.stringify(res7.data))
  if (res7.status !== 400 || res7.data.code !== 'UNSUPPORTED_DEVICE') {
    throw new Error('Test 7 failed: Unsupported device was not rejected with 400')
  }
  console.log('✅ PASS: Test 7 (unsupported device correctly rejected)')

  // --- TEST 8: invalid action ---
  console.log('\n--- 8. Test invalid action rejection ---')
  const res8 = await callLiveCommand({
    actions: [{ device: 'fan', action: 'SPEED_HIGH' }],
    classroom,
  })
  console.log('Response:', JSON.stringify(res8.data))
  if (res8.status !== 400 || res8.data.code !== 'INVALID_ACTION') {
    throw new Error('Test 8 failed: Invalid action was not rejected with 400')
  }
  console.log('✅ PASS: Test 8 (invalid action correctly rejected)')

  // --- TEST 9: empty actions ---
  console.log('\n--- 9. Test empty actions array rejection ---')
  const res9 = await callLiveCommand({
    actions: [],
    classroom,
  })
  console.log('Response:', JSON.stringify(res9.data))
  if (res9.status !== 400 || res9.data.code !== 'INVALID_ACTIONS') {
    throw new Error('Test 9 failed: Empty actions was not rejected with 400')
  }
  console.log('✅ PASS: Test 9 (empty actions correctly rejected)')

  // --- TEST 10: malformed request ---
  console.log('\n--- 10. Test malformed request object rejection ---')
  const res10 = await callLiveCommand({
    actions: [null, 'bad_string'],
    classroom,
  })
  console.log('Response:', JSON.stringify(res10.data))
  if (res10.status !== 400 || res10.data.code !== 'MALFORMED_ACTION') {
    throw new Error('Test 10 failed: Malformed action was not rejected with 400')
  }
  console.log('✅ PASS: Test 10 (malformed request correctly rejected)')

  // --- TEST 11: partial execution failure ---
  console.log('\n--- 11. Test partial execution failure handling ---')
  // Temporarily deactivate projector to simulate failure for projector while fan succeeds
  await Device.updateOne({ deviceId: 'ESP32-RM302-PROJ-01' }, { isActive: false })
  const res11 = await callLiveCommand({
    actions: [
      { device: 'fan', action: 'ON' },
      { device: 'projector', action: 'ON' },
    ],
    classroom,
  })
  console.log('Response:', JSON.stringify(res11.data))
  const fanResult = res11.data.data?.actions?.find((a) => a.device === 'fan')
  const projResult = res11.data.data?.actions?.find((a) => a.device === 'projector')
  console.log(`  Fan success: ${fanResult?.success}`)
  console.log(`  Projector success: ${projResult?.success} (${projResult?.message})`)
  if (!fanResult?.success || projResult?.success) {
    throw new Error('Test 11 failed: Partial failure was not handled accurately')
  }
  // Restore projector active state
  await Device.updateOne({ deviceId: 'ESP32-RM302-PROJ-01' }, { isActive: true })
  console.log('✅ PASS: Test 11 (partial execution failure does not hide successful actions)')

  // --- TEST 12: stringified JSON actions normalization (Format B) ---
  console.log('\n--- 12. Test stringified JSON actions normalization (Format B) ---')
  const res12 = await callLiveCommand({
    actions: [
      JSON.stringify({ device: 'fan', action: 'ON' }),
      JSON.stringify({ device: 'light', action: 'ON' }),
    ],
    classroom,
  })
  console.log('Response:', JSON.stringify(res12.data))
  if (
    res12.status !== 200 ||
    res12.data.data?.actions?.length !== 2 ||
    !res12.data.data.actions.every((a) => a.success)
  ) {
    throw new Error('Test 12 failed: Stringified JSON actions were not normalized')
  }
  console.log('✅ PASS: Test 12 (Format B stringified JSON actions successfully normalized)')

  console.log('\n' + '='.repeat(70))
  console.log('🎉 ALL GEMINI LIVE BATCH COMMAND TESTS PASSED SUCCESSFULLY!')
  console.log('='.repeat(70))

  await mongoose.disconnect()
}

runTests().catch((err) => {
  console.error('\n❌ Test Suite Failed:', err)
  process.exit(1)
})
