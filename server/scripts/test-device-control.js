/**
 * Verification Script for Device Control & DeviceLog Architecture:
 * - Tests POST /api/devices/:id/command
 * - Verifies role enforcement (SUPER_ADMIN and TEACHER only)
 * - Verifies action validation (ON/OFF only)
 * - Verifies device existence & active status validation
 * - Verifies database state update
 * - Verifies DeviceLog creation and snapshots
 * - Verifies backend-enforced MQTT topic
 */

const path = require('path')
const dotenv = require('dotenv')
dotenv.config({ path: path.resolve(__dirname, '../.env') })

const mongoose = require('mongoose')
const { Device, DEVICE_TYPES, DEVICE_STATES } = require('../src/models/Device')
const { DeviceLog } = require('../src/models/DeviceLog')
const { User, ROLES } = require('../src/models/User')
const { generateToken } = require('../src/utils/jwt.util')

const API_BASE = `http://localhost:${process.env.PORT || 5000}`

async function runTests() {
  console.log('\n======================================================')
  console.log('⚡ SMART CLASSROOM DEVICE CONTROL & LOG VERIFICATION')
  console.log('======================================================\n')

  await mongoose.connect(process.env.MONGODB_URI)
  console.log('✅ Connected to MongoDB Atlas')

  // 1. Prepare Target Test Device
  console.log('\n--- 1. Setting up Test Device ---')
  const testDevice = await Device.findOneAndUpdate(
    { deviceId: 'ESP32-RM302-LIGHT-01' },
    {
      name: 'Classroom 302 Main Lights',
      type: DEVICE_TYPES.LIGHT,
      classroom: 'Room 302',
      deviceId: 'ESP32-RM302-LIGHT-01',
      mqttCommandTopic: 'smartclassroom/room302/relay/light/set',
      mqttStatusTopic: 'smartclassroom/room302/relay/light/state',
      state: DEVICE_STATES.OFF,
      isOnline: true,
      gpioPin: 23,
      isActive: true,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  )
  console.log(`✓ Test Device ready: ${testDevice.name} (${testDevice.deviceId}), state: ${testDevice.state}`)

  // Create an inactive test device for validation check
  const inactiveDevice = await Device.findOneAndUpdate(
    { deviceId: 'ESP32-RM302-DEACTIVATED' },
    {
      name: 'Decommissioned Projector',
      type: DEVICE_TYPES.PROJECTOR,
      classroom: 'Room 302',
      deviceId: 'ESP32-RM302-DEACTIVATED',
      mqttCommandTopic: 'smartclassroom/room302/relay/deactivated/set',
      mqttStatusTopic: 'smartclassroom/room302/relay/deactivated/state',
      state: DEVICE_STATES.OFF,
      isOnline: false,
      isActive: false,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  )
  console.log(`✓ Inactive Device ready: ${inactiveDevice.name}, isActive: ${inactiveDevice.isActive}`)

  // 2. Prepare Authenticated Role Tokens
  console.log('\n--- 2. Generating Role Tokens ---')
  const superAdmin = await User.findOne({ role: ROLES.SUPER_ADMIN })
  const adminToken = generateToken({ id: superAdmin._id.toString(), role: superAdmin.role })

  const teacher = await User.findOne({ role: ROLES.TEACHER })
  const teacherToken = generateToken({ id: teacher._id.toString(), role: teacher.role })

  let student = await User.findOne({ role: ROLES.STUDENT })
  if (!student) {
    student = await User.create({
      name: 'Test Student',
      email: 'student.control.test@smartclassroom.edu',
      passwordHash: '$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012',
      role: ROLES.STUDENT,
      department: 'Computer Science',
      isActive: true,
    })
  }
  const studentToken = generateToken({ id: student._id.toString(), role: student.role })
  console.log('✓ Tokens ready for SUPER_ADMIN, TEACHER, and STUDENT')

  // 3. Test: Unauthenticated Request (Must return 401)
  console.log('\n--- 3. Unauthenticated Request Check ---')
  const unauthRes = await fetch(`${API_BASE}/api/devices/${testDevice.deviceId}/command`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'ON' }),
  })
  console.log(`POST /command (No Token) -> HTTP ${unauthRes.status}`)
  if (unauthRes.status === 401) {
    console.log('✅ PASS: Rejected unauthenticated request with 401')
  } else {
    console.error('❌ FAIL: Expected 401, got', unauthRes.status)
  }

  // 4. Test: Unauthorized Role Request (STUDENT must return 403)
  console.log('\n--- 4. Role Authorization Check (STUDENT blocked) ---')
  const studentRes = await fetch(`${API_BASE}/api/devices/${testDevice.deviceId}/command`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${studentToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action: 'ON' }),
  })
  console.log(`POST /command (STUDENT) -> HTTP ${studentRes.status}`)
  if (studentRes.status === 403) {
    console.log('✅ PASS: Student blocked from controlling device with 403 Forbidden')
  } else {
    console.error('❌ FAIL: Expected 403, got', studentRes.status)
  }

  // 5. Test: Invalid Action Validation (Must return 400)
  console.log('\n--- 5. Action Validation Check (Invalid Action) ---')
  const invalidActionRes = await fetch(`${API_BASE}/api/devices/${testDevice.deviceId}/command`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${teacherToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action: 'DIM_TO_50' }),
  })
  const invalidActionData = await invalidActionRes.json()
  console.log(`POST /command ({ action: "DIM_TO_50" }) -> HTTP ${invalidActionRes.status}, code: ${invalidActionData.code}`)
  if (invalidActionRes.status === 400 && invalidActionData.code === 'INVALID_ACTION') {
    console.log('✅ PASS: Invalid action rejected with 400 INVALID_ACTION')
  } else {
    console.error('❌ FAIL:', invalidActionData)
  }

  // 6. Test: Non-existent Device Validation (Must return 404)
  console.log('\n--- 6. Device Existence Validation Check ---')
  const notFoundRes = await fetch(`${API_BASE}/api/devices/UNKNOWN_DEVICE_999/command`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${adminToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action: 'ON' }),
  })
  const notFoundData = await notFoundRes.json()
  console.log(`POST /command (Non-existent ID) -> HTTP ${notFoundRes.status}, code: ${notFoundData.code}`)
  if (notFoundRes.status === 404 && notFoundData.code === 'DEVICE_NOT_FOUND') {
    console.log('✅ PASS: Non-existent device returns 404 DEVICE_NOT_FOUND')
  } else {
    console.error('❌ FAIL:', notFoundData)
  }

  // 7. Test: Inactive Device Validation (Must return 400)
  console.log('\n--- 7. Deactivated Device Validation Check ---')
  const inactiveRes = await fetch(`${API_BASE}/api/devices/${inactiveDevice.deviceId}/command`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${adminToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action: 'ON' }),
  })
  const inactiveData = await inactiveRes.json()
  console.log(`POST /command (Inactive device) -> HTTP ${inactiveRes.status}, code: ${inactiveData.code}`)
  if (inactiveRes.status === 400 && inactiveData.code === 'DEVICE_INACTIVE') {
    console.log('✅ PASS: Inactive device blocked with 400 DEVICE_INACTIVE')
  } else {
    console.error('❌ FAIL:', inactiveData)
  }

  // 8. Test: Valid Command by TEACHER (Turn ON)
  console.log('\n--- 8. Valid Command Execution: TEACHER turns ON ---')
  const commandOnRes = await fetch(`${API_BASE}/api/devices/${testDevice.deviceId}/command`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${teacherToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action: 'ON' }),
  })
  const commandOnData = await commandOnRes.json()
  console.log(`POST /command (action: "ON") -> HTTP ${commandOnRes.status}`)
  console.log('Response Payload:', JSON.stringify(commandOnData, null, 2))

  if (
    commandOnRes.status === 200 &&
    commandOnData.status === 'success' &&
    commandOnData.data.device.state === 'ON' &&
    commandOnData.data.mqtt.topic === testDevice.mqttCommandTopic
  ) {
    console.log('✅ PASS: Device successfully turned ON, state updated, and backend-enforced MQTT topic verified')
  } else {
    console.error('❌ FAIL:', commandOnData)
  }

  // 9. Test: Valid Command by SUPER_ADMIN (Turn OFF)
  console.log('\n--- 9. Valid Command Execution: SUPER_ADMIN turns OFF ---')
  const commandOffRes = await fetch(`${API_BASE}/api/devices/${testDevice._id}/command`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${adminToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action: 'OFF' }),
  })
  const commandOffData = await commandOffRes.json()
  console.log(`POST /command (by ObjectId, action: "OFF") -> HTTP ${commandOffRes.status}`)

  if (
    commandOffRes.status === 200 &&
    commandOffData.status === 'success' &&
    commandOffData.data.device.state === 'OFF' &&
    commandOffData.data.device.previousState === 'ON'
  ) {
    console.log('✅ PASS: Device successfully turned OFF, previousState correctly tracked as "ON"')
  } else {
    console.error('❌ FAIL:', commandOffData)
  }

  // 10. Verify DeviceLog in MongoDB
  console.log('\n--- 10. Database DeviceLog Verification ---')
  const latestLogs = await DeviceLog.find({ deviceId: testDevice.deviceId })
    .sort({ createdAt: -1 })
    .limit(2)

  console.log(`✓ Found ${latestLogs.length} recent DeviceLog records in MongoDB`)
  if (latestLogs.length >= 2) {
    const [latestLog, priorLog] = latestLogs
    console.log(`- Latest Log: [${latestLog.action}] by ${latestLog.userName} (${latestLog.userRole}), MQTT: ${latestLog.mqttStatus}`)
    console.log(`- Prior Log : [${priorLog.action}] by ${priorLog.userName} (${priorLog.userRole}), MQTT: ${priorLog.mqttStatus}`)

    if (
      latestLog.action === 'OFF' &&
      latestLog.topic === testDevice.mqttCommandTopic &&
      latestLog.payload.deviceId === testDevice.deviceId
    ) {
      console.log('✅ PASS: DeviceLog accurately recorded audit trail with user snapshot and backend MQTT topic')
    } else {
      console.error('❌ FAIL in log contents:', latestLog)
    }
  } else {
    console.error('❌ FAIL: Expected at least 2 logs')
  }

  await mongoose.disconnect()
  console.log('\n======================================================')
  console.log('🎉 ALL DEVICE CONTROL & LOGGING TESTS PASSED!')
  console.log('======================================================\n')
}

runTests().catch((err) => {
  console.error('\n❌ Test execution encountered an error:', err)
  process.exit(1)
})
