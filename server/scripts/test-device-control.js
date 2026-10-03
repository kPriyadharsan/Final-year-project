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

  // 1. Prepare Target Test Devices (Light, Fan, Projector)
  console.log('\n--- 1. Setting up Test Devices ---')
  const { getCommandTopic, getStateTopic } = require('../src/utils/mqttTopics')
  const deviceCommandService = require('../src/services/deviceCommand.service')
  const mqttService = require('../src/services/mqtt.service')

  const lightDevice = await Device.findOneAndUpdate(
    { deviceId: 'ESP32-RM302-LIGHT-01' },
    {
      name: 'Classroom 302 Main Lights',
      type: DEVICE_TYPES.LIGHT,
      classroom: 'Room 302',
      deviceId: 'ESP32-RM302-LIGHT-01',
      mqttCommandTopic: getCommandTopic('Room 302', 'light'),
      mqttStatusTopic: getStateTopic('Room 302', 'light'),
      state: DEVICE_STATES.OFF,
      requestedState: DEVICE_STATES.OFF,
      isOnline: true,
      gpioPin: 23,
      isActive: true,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  )

  const fanDevice = await Device.findOneAndUpdate(
    { deviceId: 'ESP32-RM302-FAN-01' },
    {
      name: 'Classroom 302 Ceiling Fans',
      type: DEVICE_TYPES.FAN,
      classroom: 'Room 302',
      deviceId: 'ESP32-RM302-FAN-01',
      mqttCommandTopic: getCommandTopic('Room 302', 'fan'),
      mqttStatusTopic: getStateTopic('Room 302', 'fan'),
      state: DEVICE_STATES.OFF,
      requestedState: DEVICE_STATES.OFF,
      isOnline: true,
      gpioPin: 22,
      isActive: true,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  )

  const projDevice = await Device.findOneAndUpdate(
    { deviceId: 'ESP32-RM302-PROJ-01' },
    {
      name: 'Classroom 302 Smart Projector',
      type: DEVICE_TYPES.PROJECTOR,
      classroom: 'Room 302',
      deviceId: 'ESP32-RM302-PROJ-01',
      mqttCommandTopic: getCommandTopic('Room 302', 'projector'),
      mqttStatusTopic: getStateTopic('Room 302', 'projector'),
      state: DEVICE_STATES.OFF,
      requestedState: DEVICE_STATES.OFF,
      isOnline: true,
      gpioPin: 21,
      isActive: true,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  )

  // Inactive test device for validation check
  const inactiveDevice = await Device.findOneAndUpdate(
    { deviceId: 'ESP32-RM302-DEACTIVATED' },
    {
      name: 'Decommissioned Projector',
      type: DEVICE_TYPES.PROJECTOR,
      classroom: 'Room 302',
      deviceId: 'ESP32-RM302-DEACTIVATED',
      mqttCommandTopic: getCommandTopic('Room 302', 'projector'),
      mqttStatusTopic: getStateTopic('Room 302', 'projector'),
      state: DEVICE_STATES.OFF,
      isOnline: false,
      isActive: false,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  )
  console.log(`✓ Test Devices ready: Light (${lightDevice.deviceId}), Fan (${fanDevice.deviceId}), Projector (${projDevice.deviceId})`)

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
  const unauthRes = await fetch(`${API_BASE}/api/devices/${lightDevice.deviceId}/command`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'ON' }),
  })
  console.log(`POST /command (No Token) -> HTTP ${unauthRes.status}`)
  if (unauthRes.status === 401) {
    console.log('✅ PASS: Rejected unauthenticated request with 401')
  } else {
    throw new Error(`Expected 401, got ${unauthRes.status}`)
  }

  // 4. Test: Unauthorized Role Request (STUDENT must return 403)
  console.log('\n--- 4. Role Authorization Check (STUDENT blocked) ---')
  const studentRes = await fetch(`${API_BASE}/api/devices/${lightDevice.deviceId}/command`, {
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
    throw new Error(`Expected 403, got ${studentRes.status}`)
  }

  // 5. Test: Invalid Command Validation (Missing and Invalid Actions)
  console.log('\n--- 5. Action Validation Check (Invalid & Empty Actions) ---')
  const emptyActionRes = await fetch(`${API_BASE}/api/devices/${lightDevice.deviceId}/command`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${teacherToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  })
  const emptyActionData = await emptyActionRes.json()
  console.log(`POST /command ({}) -> HTTP ${emptyActionRes.status}, code: ${emptyActionData.code}`)
  if (emptyActionRes.status === 400 && emptyActionData.code === 'ACTION_REQUIRED') {
    console.log('✅ PASS: Missing action rejected with 400 ACTION_REQUIRED')
  } else {
    throw new Error(`Expected 400 ACTION_REQUIRED, got ${emptyActionRes.status}`)
  }

  const invalidActionRes = await fetch(`${API_BASE}/api/devices/${lightDevice.deviceId}/command`, {
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
    throw new Error(`Expected 400 INVALID_ACTION, got ${invalidActionRes.status}`)
  }

  // 6. Test: Device Existence Validation Check (Must return 404)
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
    throw new Error(`Expected 404 DEVICE_NOT_FOUND, got ${notFoundRes.status}`)
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
    throw new Error(`Expected 400 DEVICE_INACTIVE, got ${inactiveRes.status}`)
  }

  // 8. Test: Light ON
  console.log('\n--- 8. Command Test: Light ON ---')
  const lightOnRes = await fetch(`${API_BASE}/api/devices/${lightDevice.deviceId}/command`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${teacherToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action: 'ON' }),
  })
  const lightOnData = await lightOnRes.json()
  console.log(`POST /command (Light ON) -> HTTP ${lightOnRes.status}: ${lightOnData.message}`)
  if (
    lightOnRes.status === 200 &&
    lightOnData.status === 'success' &&
    lightOnData.data.device.state === 'ON' &&
    lightOnData.data.device.requestedState === 'ON' &&
    lightOnData.data.mqtt.topic === lightDevice.mqttCommandTopic
  ) {
    console.log('✅ PASS: Light successfully commanded ON, requestedState="ON"')
  } else {
    throw new Error(`Light ON failed: ${JSON.stringify(lightOnData)}`)
  }

  // 9. Test: Light OFF
  console.log('\n--- 9. Command Test: Light OFF ---')
  const lightOffRes = await fetch(`${API_BASE}/api/devices/${lightDevice._id}/command`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${adminToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action: 'OFF' }),
  })
  const lightOffData = await lightOffRes.json()
  console.log(`POST /command (Light OFF) -> HTTP ${lightOffRes.status}: ${lightOffData.message}`)
  if (
    lightOffRes.status === 200 &&
    lightOffData.status === 'success' &&
    lightOffData.data.device.state === 'OFF' &&
    lightOffData.data.device.previousState === 'ON'
  ) {
    console.log('✅ PASS: Light successfully commanded OFF, previousState correctly tracked as "ON"')
  } else {
    throw new Error(`Light OFF failed: ${JSON.stringify(lightOffData)}`)
  }

  // 10. Test: Fan ON
  console.log('\n--- 10. Command Test: Fan ON ---')
  const fanOnRes = await fetch(`${API_BASE}/api/devices/${fanDevice.deviceId}/command`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${teacherToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action: 'ON' }),
  })
  const fanOnData = await fanOnRes.json()
  console.log(`POST /command (Fan ON) -> HTTP ${fanOnRes.status}: ${fanOnData.message}`)
  if (
    fanOnRes.status === 200 &&
    fanOnData.data.device.state === 'ON' &&
    fanOnData.message === 'Fan ON command sent.'
  ) {
    console.log('✅ PASS: Fan successfully commanded ON ("Fan ON command sent.")')
  } else {
    throw new Error(`Fan ON failed: ${JSON.stringify(fanOnData)}`)
  }

  // 11. Test: Fan OFF
  console.log('\n--- 11. Command Test: Fan OFF ---')
  const fanOffRes = await fetch(`${API_BASE}/api/devices/${fanDevice.deviceId}/command`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${teacherToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action: 'OFF' }),
  })
  const fanOffData = await fanOffRes.json()
  console.log(`POST /command (Fan OFF) -> HTTP ${fanOffRes.status}: ${fanOffData.message}`)
  if (
    fanOffRes.status === 200 &&
    fanOffData.data.device.state === 'OFF' &&
    fanOffData.message === 'Fan OFF command sent.'
  ) {
    console.log('✅ PASS: Fan successfully commanded OFF ("Fan OFF command sent.")')
  } else {
    throw new Error(`Fan OFF failed: ${JSON.stringify(fanOffData)}`)
  }

  // 12. Test: Projector ON
  console.log('\n--- 12. Command Test: Projector ON ---')
  const projOnRes = await fetch(`${API_BASE}/api/devices/${projDevice.deviceId}/command`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${teacherToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action: 'ON' }),
  })
  const projOnData = await projOnRes.json()
  console.log(`POST /command (Projector ON) -> HTTP ${projOnRes.status}: ${projOnData.message}`)
  if (
    projOnRes.status === 200 &&
    projOnData.data.device.state === 'ON' &&
    projOnData.message === 'Projector ON command sent.'
  ) {
    console.log('✅ PASS: Projector successfully commanded ON ("Projector ON command sent.")')
  } else {
    throw new Error(`Projector ON failed: ${JSON.stringify(projOnData)}`)
  }

  // 13. Test: Projector OFF
  console.log('\n--- 13. Command Test: Projector OFF ---')
  const projOffRes = await fetch(`${API_BASE}/api/devices/${projDevice.deviceId}/command`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${adminToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action: 'OFF' }),
  })
  const projOffData = await projOffRes.json()
  console.log(`POST /command (Projector OFF) -> HTTP ${projOffRes.status}: ${projOffData.message}`)
  if (
    projOffRes.status === 200 &&
    projOffData.data.device.state === 'OFF' &&
    projOffData.message === 'Projector OFF command sent.'
  ) {
    console.log('✅ PASS: Projector successfully commanded OFF ("Projector OFF command sent.")')
  } else {
    throw new Error(`Projector OFF failed: ${JSON.stringify(projOffData)}`)
  }

  // 14. Database DeviceLog Verification
  console.log('\n--- 14. Database DeviceLog Verification ---')
  const latestLogs = await DeviceLog.find({ deviceId: lightDevice.deviceId })
    .sort({ createdAt: -1 })
    .limit(2)

  console.log(`✓ Found ${latestLogs.length} recent DeviceLog records for Light in MongoDB`)
  if (latestLogs.length >= 2) {
    const [latestLog, priorLog] = latestLogs
    console.log(`- Latest Log: [${latestLog.action}] by ${latestLog.userName} (${latestLog.userRole}), MQTT: ${latestLog.mqttStatus}`)
    console.log(`- Prior Log : [${priorLog.action}] by ${priorLog.userName} (${priorLog.userRole}), MQTT: ${priorLog.mqttStatus}`)

    if (
      latestLog.action === 'OFF' &&
      latestLog.topic === lightDevice.mqttCommandTopic &&
      latestLog.payload.deviceId === lightDevice.deviceId
    ) {
      console.log('✅ PASS: DeviceLog accurately recorded audit trail with user snapshot and backend MQTT topic')
    } else {
      throw new Error(`Invalid log content: ${JSON.stringify(latestLog)}`)
    }
  } else {
    throw new Error('Expected at least 2 logs')
  }

  // 15. Test Offline Hardware Protection: Do not fake successful hardware status
  console.log('\n--- 15. Testing Offline Hardware Protection ("Command could not be delivered.") ---')
  await Device.updateOne({ deviceId: lightDevice.deviceId }, { isOnline: false, state: DEVICE_STATES.OFF })
  const offlineBtnRes = await fetch(`${API_BASE}/api/devices/${lightDevice.deviceId}/command`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${teacherToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action: 'ON' }),
  })
  const offlineBtnData = await offlineBtnRes.json()
  console.log(`POST /command (Offline ESP32) -> HTTP ${offlineBtnRes.status}, code: ${offlineBtnData.code}`)
  console.log('Message:', offlineBtnData.message)

  if (offlineBtnRes.status !== 503) {
    throw new Error(`Expected HTTP 503 for offline hardware delivery failure, got ${offlineBtnRes.status}`)
  }
  if (offlineBtnData.message !== 'Command could not be delivered.') {
    throw new Error(`Expected "Command could not be delivered.", got "${offlineBtnData.message}"`)
  }

  const lightStillOffline = await Device.findOne({ deviceId: lightDevice.deviceId })
  if (lightStillOffline.state !== DEVICE_STATES.OFF) {
    throw new Error(`State was faked to ${lightStillOffline.state} instead of staying OFF!`)
  }
  console.log('✅ PASS: Offline ESP32 does not fake hardware status, rejects with 503, and leaves state OFF')

  // Restore online state
  await Device.updateOne({ deviceId: lightDevice.deviceId }, { isOnline: true })

  // 16. Test MQTT Disconnected Validation
  console.log('\n--- 16. Testing MQTT Disconnected Validation ---')
  // Call executeDeviceCommand directly simulating disconnected MQTT broker status
  const originalGetMQTTStatus = mqttService.getMQTTStatus
  mqttService.getMQTTStatus = () => ({ connected: false, status: 'disconnected' })

  const mqttDisconnResult = await deviceCommandService.executeDeviceCommand({
    deviceId: lightDevice.deviceId,
    action: 'ON',
    user: teacher,
    source: 'REST_API',
  })

  // Restore getMQTTStatus
  mqttService.getMQTTStatus = originalGetMQTTStatus

  console.log(`executeDeviceCommand (MQTT Disconnected) -> code: ${mqttDisconnResult.code}, delivered: ${mqttDisconnResult.delivered}`)
  console.log('Message:', mqttDisconnResult.message)

  if (
    mqttDisconnResult.success === false &&
    mqttDisconnResult.delivered === false &&
    mqttDisconnResult.code === 'MQTT_DISCONNECTED' &&
    mqttDisconnResult.message === 'Command could not be delivered.'
  ) {
    console.log('✅ PASS: Disconnected MQTT broker correctly identified with code="MQTT_DISCONNECTED" and rejected with "Command could not be delivered."')
  } else {
    throw new Error(`MQTT Disconnected test failed: ${JSON.stringify(mqttDisconnResult)}`)
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
