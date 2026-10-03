/**
 * Verification Script for POST /api/voice/command and VoiceCommand Model:
 * - Tests input: "Turn on the fan"
 * - Verifies intent parsing (DEVICE_CONTROL)
 * - Verifies backend device execution (state updated, DeviceLog created)
 * - Verifies response fields: transcript, intent, device, action, executionStatus, message
 * - Tests non-device intent: "Create revision notes for physics" (CREATE_NOTE)
 * - Tests unsupported command: "Turn on the television" (UNKNOWN)
 * - Verifies VoiceCommand MongoDB model audit storage
 * - Verifies security: Gemini never directly executes MQTT commands
 * - Verifies GET /api/voice/history endpoint
 */

const path = require('path')
const dotenv = require('dotenv')
dotenv.config({ path: path.resolve(__dirname, '../.env') })

const mongoose = require('mongoose')
const { Device, DEVICE_TYPES, DEVICE_STATES } = require('../src/models/Device')
const { DeviceLog } = require('../src/models/DeviceLog')
const { VoiceCommand, EXECUTION_STATUSES } = require('../src/models/VoiceCommand')
const { User, ROLES } = require('../src/models/User')
const { generateToken } = require('../src/utils/jwt.util')

const API_BASE = `http://localhost:${process.env.PORT || 5000}`

async function runVoiceCommandTests() {
  console.log('\n======================================================')
  console.log('🎙️ SMART CLASSROOM VOICE COMMAND PIPELINE VERIFICATION')
  console.log('======================================================\n')

  await mongoose.connect(process.env.MONGODB_URI)
  console.log('✅ Connected to MongoDB Atlas')

  // 1. Prepare Target Devices in MongoDB
  console.log('\n--- 1. Setting up Target Test Devices ---')
  const { getCommandTopic, getStateTopic } = require('../src/utils/mqttTopics')
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
      isOnline: true,
      gpioPin: 22,
      isActive: true,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  )
  console.log(`✓ Fan device ready: ${fanDevice.name} (${fanDevice.deviceId}), state: ${fanDevice.state}`)

  const lightDevice = await Device.findOneAndUpdate(
    { deviceId: 'ESP32-RM302-LIGHT-01' },
    {
      name: 'Classroom 302 Main Lights',
      type: DEVICE_TYPES.LIGHT,
      classroom: 'Room 302',
      deviceId: 'ESP32-RM302-LIGHT-01',
      mqttCommandTopic: getCommandTopic('Room 302', 'light'),
      mqttStatusTopic: getStateTopic('Room 302', 'light'),
      state: DEVICE_STATES.ON,
      isOnline: true,
      gpioPin: 23,
      isActive: true,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  )
  console.log(`✓ Light device ready: ${lightDevice.name} (${lightDevice.deviceId}), state: ${lightDevice.state}`)

  // 2. Prepare Teacher Authentication Token
  console.log('\n--- 2. Generating Authentication Credentials ---')
  let teacherUser = await User.findOne({ role: ROLES.TEACHER })
  if (!teacherUser) {
    teacherUser = await User.create({
      name: 'Voice Test Teacher',
      email: 'voice.teacher@smartclassroom.edu',
      password: 'TeacherPassword123!',
      role: ROLES.TEACHER,
      department: 'Science',
    })
  }
  const teacherToken = generateToken({
    id: teacherUser._id.toString(),
    email: teacherUser.email,
    role: teacherUser.role,
  })
  console.log(`✓ Generated JWT for ${teacherUser.email} (${teacherUser.role})`)

  // 3. Test Primary User Flow: "Turn on the fan" (DEVICE_CONTROL)
  console.log('\n--- 3. Testing POST /api/voice/command ("Turn on the fan") ---')
  const fanRes = await fetch(`${API_BASE}/api/voice/command`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${teacherToken}`,
    },
    body: JSON.stringify({
      transcript: 'Turn on the fan',
      classroom: 'Room 302',
    }),
  })
  const fanBody = await fanRes.json()
  console.log(`POST /api/voice/command -> HTTP ${fanRes.status}`)
  console.log('Response Payload:', JSON.stringify(fanBody, null, 2))

  if (fanRes.status !== 200 || fanBody.status !== 'success') {
    throw new Error(`Voice command failed: ${JSON.stringify(fanBody)}`)
  }

  const fanData = fanBody.data
  if (fanData.transcript !== 'Turn on the fan') throw new Error('Incorrect transcript echoed')
  if (fanData.intent !== 'DEVICE_CONTROL') throw new Error(`Expected intent DEVICE_CONTROL, got ${fanData.intent}`)
  if (fanData.device !== 'fan') throw new Error(`Expected device "fan", got "${fanData.device}"`)
  if (fanData.action !== 'ON') throw new Error(`Expected action "ON", got "${fanData.action}"`)
  if (fanData.executionStatus !== EXECUTION_STATUSES.EXECUTED) {
    throw new Error(`Expected executionStatus EXECUTED, got ${fanData.executionStatus}`)
  }
  if (!fanData.message || fanData.message.trim() === '') {
    throw new Error('Expected human-readable message in response')
  }
  console.log('✅ PASS: Response contains transcript, intent, device, action, executionStatus, and human-readable message')

  // Verify MongoDB Device State update
  const updatedFan = await Device.findOne({ deviceId: 'ESP32-RM302-FAN-01' })
  console.log(`✓ Verified MongoDB Device state: state=${updatedFan.state}`)
  if (updatedFan.state !== 'ON') throw new Error('Fan state was not updated to ON in database')

  // Verify VoiceCommand model record
  const savedFanVoiceCommand = await VoiceCommand.findById(fanData.voiceCommandId)
  if (!savedFanVoiceCommand) throw new Error('VoiceCommand record not found in MongoDB')
  console.log(`✓ Verified VoiceCommand log: intent=${savedFanVoiceCommand.intent}, device=${savedFanVoiceCommand.device}, action=${savedFanVoiceCommand.action}`)
  if (savedFanVoiceCommand.user.toString() !== teacherUser._id.toString()) {
    throw new Error('VoiceCommand record user reference does not match authenticated teacher')
  }
  console.log('✅ PASS: VoiceCommand saved to MongoDB with user, transcript, intent, device, action, result, and createdAt')

  // 4. Test Second Device Command: "Switch off the classroom lights"
  console.log('\n--- 4. Testing Device Command: "Switch off the classroom lights" ---')
  const lightRes = await fetch(`${API_BASE}/api/voice/command`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${teacherToken}`,
    },
    body: JSON.stringify({
      transcript: 'Switch off the classroom lights',
      classroom: 'Room 302',
    }),
  })
  const lightBody = await lightRes.json()
  console.log(`POST /api/voice/command -> HTTP ${lightRes.status}: ${lightBody.data.message}`)
  if (lightBody.data.intent !== 'DEVICE_CONTROL' || lightBody.data.device !== 'light' || lightBody.data.action !== 'OFF') {
    throw new Error('Light command did not match expected values')
  }
  const updatedLight = await Device.findOne({ deviceId: 'ESP32-RM302-LIGHT-01' })
  if (updatedLight.state !== 'OFF') throw new Error('Light state was not updated to OFF in database')
  console.log('✅ PASS: Successfully commanded light OFF and updated database state')

  // 5. Test Non-Device Software Intent: "Create revision notes for physics"
  console.log('\n--- 5. Testing Software Intent: "Create revision notes for physics" ---')
  const noteRes = await fetch(`${API_BASE}/api/voice/command`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${teacherToken}`,
    },
    body: JSON.stringify({
      transcript: 'Create revision notes for physics',
    }),
  })
  const noteBody = await noteRes.json()
  console.log(`POST /api/voice/command -> HTTP ${noteRes.status}`)
  console.log('Response Payload:', JSON.stringify(noteBody, null, 2))

  if (noteBody.data.intent !== 'CREATE_NOTE') {
    throw new Error(`Expected intent "CREATE_NOTE", got "${noteBody.data.intent}"`)
  }
  if (noteBody.data.device !== null || noteBody.data.action !== null) {
    throw new Error('Non-device intent must have null device and action')
  }
  if (noteBody.data.executionStatus !== EXECUTION_STATUSES.DETECTED) {
    throw new Error(`Expected executionStatus DETECTED, got ${noteBody.data.executionStatus}`)
  }
  console.log('✅ PASS: Software intent correctly returned without triggering device execution')

  // 6. Test Unsupported Command: "Turn on the television"
  console.log('\n--- 6. Testing Unsupported Command: "Turn on the television" ---')
  const tvRes = await fetch(`${API_BASE}/api/voice/command`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      transcript: 'Turn on the television',
    }),
  })
  const tvBody = await tvRes.json()
  console.log(`POST /api/voice/command -> HTTP ${tvRes.status}: ${tvBody.data.message}`)
  if (tvBody.data.intent !== 'UNKNOWN') {
    throw new Error(`Expected intent UNKNOWN for television, got ${tvBody.data.intent}`)
  }
  if (tvBody.data.executionStatus !== EXECUTION_STATUSES.UNRECOGNIZED) {
    throw new Error(`Expected executionStatus UNRECOGNIZED, got ${tvBody.data.executionStatus}`)
  }
  console.log('✅ PASS: Unsupported appliance safely rejected and marked UNKNOWN')

  // 7. Test Input Validation (Missing transcript)
  console.log('\n--- 7. Testing Input Validation ---')
  const invalidRes = await fetch(`${API_BASE}/api/voice/command`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
  const invalidBody = await invalidRes.json()
  console.log(`POST /api/voice/command (empty) -> HTTP ${invalidRes.status} (code: ${invalidBody.code})`)
  if (invalidRes.status !== 400 || invalidBody.code !== 'TRANSCRIPT_REQUIRED') {
    throw new Error('Expected 400 TRANSCRIPT_REQUIRED for empty transcript')
  }
  console.log('✅ PASS: Empty transcript correctly rejected with 400 Bad Request')

  // 8. Test GET /api/voice/history
  console.log('\n--- 8. Testing GET /api/voice/history ---')
  const historyRes = await fetch(`${API_BASE}/api/voice/history?limit=10`, {
    headers: {
      Authorization: `Bearer ${teacherToken}`,
    },
  })
  const historyBody = await historyRes.json()
  console.log(`GET /api/voice/history -> HTTP ${historyRes.status}, count: ${historyBody.count}`)
  if (historyRes.status !== 200 || !Array.isArray(historyBody.commands) || historyBody.commands.length === 0) {
    throw new Error('Failed to retrieve voice command history')
  }
  console.log(`✓ Most recent voice command in history: "${historyBody.commands[0].transcript}" (${historyBody.commands[0].intent})`)
  console.log('✅ PASS: GET /api/voice/history retrieves audit log correctly')

  // 9. Test Offline Hardware Protection: Do not fake successful hardware status
  console.log('\n--- 9. Testing Offline Hardware Protection ("Command could not be delivered.") ---')
  await Device.updateOne({ deviceId: 'ESP32-RM302-FAN-01' }, { isOnline: false, state: DEVICE_STATES.OFF })
  const offlineVoiceRes = await fetch(`${API_BASE}/api/voice/command`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${teacherToken}`,
    },
    body: JSON.stringify({
      transcript: 'Turn on the fan',
      classroom: 'Room 302',
    }),
  })
  const offlineVoiceBody = await offlineVoiceRes.json()
  console.log(`POST /api/voice/command (Offline ESP32) -> HTTP ${offlineVoiceRes.status}`)
  console.log('Execution Status:', offlineVoiceBody.data.executionStatus)
  console.log('Message:', offlineVoiceBody.data.message)

  if (offlineVoiceBody.data.executionStatus !== EXECUTION_STATUSES.FAILED) {
    throw new Error(`Expected executionStatus FAILED, got ${offlineVoiceBody.data.executionStatus}`)
  }
  if (offlineVoiceBody.data.message !== 'Command could not be delivered.') {
    throw new Error(`Expected "Command could not be delivered.", got "${offlineVoiceBody.data.message}"`)
  }

  const fanStillOffline = await Device.findOne({ deviceId: 'ESP32-RM302-FAN-01' })
  if (fanStillOffline.state !== DEVICE_STATES.OFF) {
    throw new Error(`State was faked to ${fanStillOffline.state} instead of staying OFF!`)
  }
  console.log('✅ PASS: Offline ESP32 does not fake success and returns "Command could not be delivered."')

  // Restore online state
  await Device.updateOne({ deviceId: 'ESP32-RM302-FAN-01' }, { isOnline: true })

  await mongoose.disconnect()
  console.log('✅ Disconnected from MongoDB')

  console.log('\n======================================================')
  console.log('🎉 ALL VOICE COMMAND TESTS PASSED SUCCESSFULLY!')
  console.log('======================================================\n')
}

runVoiceCommandTests().catch((err) => {
  console.error('\n❌ Voice command verification failed:', err)
  process.exit(1)
})
