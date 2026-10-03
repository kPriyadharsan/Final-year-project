/**
 * Verification Script for ESP32 Live Online/Offline Availability Foundation:
 * 1. MongoDB connectivity & schema verification (isOnline, lastSeenAt)
 * 2. MQTT connectivity & topic subscription verification (smartclassroom/+/availability)
 * 3. Socket.IO connection & event subscription ('device:status')
 * 4. ESP32 Valid ONLINE availability message -> MongoDB update & Socket.IO event
 * 5. ESP32 Heartbeat availability (repeated ONLINE) -> timestamp refreshed
 * 6. ESP32 Valid OFFLINE / LWT availability message -> isOnline=false, lastSeenAt preserved
 * 7. Error Handling: Malformed / Invalid JSON -> handled without crash
 * 8. Error Handling: Non-existent deviceId -> clear warning, no crash
 * 9. REST API verification -> GET /api/devices returns isOnline & lastSeenAt
 *
 * Usage:
 *   node scripts/test-availability.js
 */

const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '../.env') })
const mongoose = require('mongoose')
const mqtt = require('mqtt')
const { io } = require('socket.io-client')
const { Device } = require('../src/models/Device')
const { User, ROLES } = require('../src/models/User')
const { generateToken } = require('../src/utils/jwt.util')
const { getAvailabilityTopic } = require('../src/utils/mqttTopics')

const API_BASE = `http://localhost:${process.env.PORT || 5000}`
const TEST_DEVICE_ID = 'ESP32-RM302-01'
const AVAILABILITY_TOPIC = 'smartclassroom/room302/availability'

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function runAvailabilityTests() {
  console.log('\n' + '='.repeat(70))
  console.log('📡 LIVE ESP32 ONLINE / OFFLINE AVAILABILITY VERIFICATION')
  console.log('='.repeat(70) + '\n')

  let passedTests = 0
  let totalTests = 0

  function assert(condition, message) {
    totalTests++
    if (condition) {
      console.log(`✅ PASS: ${message}`)
      passedTests++
    } else {
      console.error(`❌ FAIL: ${message}`)
      throw new Error(`Assertion failed: ${message}`)
    }
  }

  // --------------------------------------------------------------------------
  // TEST 1: MongoDB Connection & Schema Verification
  // --------------------------------------------------------------------------
  console.log('--- TEST 1: MongoDB Connection & Schema Verification ---')
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 })
  assert(mongoose.connection.readyState === 1, 'MongoDB connection established successfully')

  const schemaPaths = Device.schema.paths
  assert(schemaPaths.isOnline !== undefined, 'Device schema contains "isOnline" (Boolean)')
  assert(schemaPaths.lastSeenAt !== undefined, 'Device schema contains "lastSeenAt" (Date)')

  // Ensure test device exists
  let targetDevice = await Device.findOne({ deviceId: TEST_DEVICE_ID })
  if (!targetDevice) {
    targetDevice = await Device.create({
      deviceId: TEST_DEVICE_ID,
      name: 'Room 302 ESP32 Controller Node',
      type: 'OTHER',
      classroom: 'Room 302',
      gpioPin: 2,
      mqttCommandTopic: AVAILABILITY_TOPIC,
      mqttStatusTopic: AVAILABILITY_TOPIC,
      state: 'OFF',
      isOnline: false,
      lastSeenAt: null,
      isActive: true,
    })
    console.log(`✓ Created test device [${TEST_DEVICE_ID}]`)
  } else {
    // Reset to offline for test starting baseline
    targetDevice.isOnline = false
    targetDevice.lastSeenAt = null
    await targetDevice.save()
    console.log(`✓ Baseline reset for device [${TEST_DEVICE_ID}] (isOnline=false, lastSeenAt=null)`)
  }

  // --------------------------------------------------------------------------
  // TEST 2: Backend Health & MQTT Subscription Check
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 2: Backend Health & MQTT Availability Subscription Check ---')
  const healthRes = await fetch(`${API_BASE}/api/health`)
  assert(healthRes.status === 200, `Backend /api/health returned HTTP 200 (Status: ${healthRes.status})`)

  const healthData = await healthRes.json()
  assert(healthData.services?.mqtt?.connected === true, 'Backend MQTT client is connected to broker')
  const subscriptions = healthData.services?.mqtt?.subscriptions || []
  assert(
    subscriptions.includes('smartclassroom/+/availability'),
    `MQTT client subscribed to availability pattern "smartclassroom/+/availability"`
  )

  // --------------------------------------------------------------------------
  // TEST 3: Authenticated Socket.IO Client Connection
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 3: Authenticated Socket.IO Client Setup ---')
  let teacherUser = await User.findOne({ role: ROLES.TEACHER })
  if (!teacherUser) {
    teacherUser = await User.findOne({ role: ROLES.SUPER_ADMIN })
  }
  const teacherToken = generateToken({
    id: teacherUser._id.toString(),
    email: teacherUser.email,
    role: teacherUser.role,
  })

  const socketClient = io(API_BASE, {
    transports: ['websocket', 'polling'],
    auth: { token: teacherToken },
    reconnection: true,
  })

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Socket.IO connection timed out after 8s')), 8000)
    socketClient.on('connect', () => {
      clearTimeout(timer)
      console.log(`✓ Socket.IO test client connected (ID: ${socketClient.id})`)
      resolve()
    })
    socketClient.on('connect_error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
  })
  assert(socketClient.connected, 'Socket.IO client successfully connected with JWT handshake')

  // --------------------------------------------------------------------------
  // TEST 4: Hardware MQTT Client Connection
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 4: Hardware MQTT Publisher Client Setup ---')
  const mqttClient = mqtt.connect(process.env.MQTT_BROKER_URL, {
    clientId: 'Avail_Test_Sim_' + Math.random().toString(16).slice(2, 8),
    username: process.env.MQTT_USERNAME || '',
    password: process.env.MQTT_PASSWORD || '',
    clean: true,
  })

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('MQTT client connection timed out after 8s')), 8000)
    mqttClient.on('connect', () => {
      clearTimeout(timer)
      console.log('✓ Hardware MQTT simulator connected to broker')
      resolve()
    })
    mqttClient.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
  })
  assert(mqttClient.connected, 'Hardware MQTT publisher connected to cloud broker')

  // --------------------------------------------------------------------------
  // TEST 5: Valid ONLINE Message Handling & Socket.IO Emission
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 5: ESP32 ONLINE Message Processing ---')
  const onlineSocketPromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout waiting for device:status (ONLINE)')), 8000)
    socketClient.on('device:status', function onOnline(payload) {
      if (payload.deviceId === TEST_DEVICE_ID && payload.isOnline === true) {
        socketClient.off('device:status', onOnline)
        clearTimeout(timer)
        resolve(payload)
      }
    })
  })

  const onlinePayload = {
    deviceId: TEST_DEVICE_ID,
    status: 'online',
  }
  console.log(`Publishing to [${AVAILABILITY_TOPIC}]:`, onlinePayload)
  mqttClient.publish(AVAILABILITY_TOPIC, JSON.stringify(onlinePayload), { qos: 1 })

  const onlineEvent = await onlineSocketPromise
  assert(onlineEvent.deviceId === TEST_DEVICE_ID, `Socket.IO received deviceId "${onlineEvent.deviceId}"`)
  assert(onlineEvent.isOnline === true, 'Socket.IO payload has isOnline=true')
  assert(onlineEvent.lastSeenAt !== null && typeof onlineEvent.lastSeenAt === 'string', `Socket.IO payload has lastSeenAt: "${onlineEvent.lastSeenAt}"`)

  // Check MongoDB
  await sleep(300)
  const dbDeviceAfterOnline = await Device.findOne({ deviceId: TEST_DEVICE_ID })
  assert(dbDeviceAfterOnline.isOnline === true, 'MongoDB document updated with isOnline=true')
  assert(dbDeviceAfterOnline.lastSeenAt instanceof Date, 'MongoDB document updated with valid lastSeenAt Date')
  const firstSeenTimestamp = dbDeviceAfterOnline.lastSeenAt.getTime()

  // --------------------------------------------------------------------------
  // TEST 6: Heartbeat Compatibility (Repeated ONLINE Updates lastSeenAt)
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 6: Heartbeat Compatibility (Repeated ONLINE) ---')
  await sleep(1200) // Ensure tick difference
  const heartbeatSocketPromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout waiting for heartbeat device:status')), 8000)
    socketClient.on('device:status', function onHeartbeat(payload) {
      if (payload.deviceId === TEST_DEVICE_ID && payload.isOnline === true) {
        socketClient.off('device:status', onHeartbeat)
        clearTimeout(timer)
        resolve(payload)
      }
    })
  })

  mqttClient.publish(AVAILABILITY_TOPIC, JSON.stringify({ deviceId: TEST_DEVICE_ID, status: 'online' }), { qos: 1 })
  const heartbeatEvent = await heartbeatSocketPromise
  await sleep(300)

  const dbDeviceAfterHeartbeat = await Device.findOne({ deviceId: TEST_DEVICE_ID })
  const secondSeenTimestamp = dbDeviceAfterHeartbeat.lastSeenAt.getTime()
  assert(secondSeenTimestamp > firstSeenTimestamp, `Heartbeat updated lastSeenAt timestamp (${secondSeenTimestamp} > ${firstSeenTimestamp})`)
  assert(heartbeatEvent.isOnline === true, 'Heartbeat emitted device:status with isOnline=true')

  // --------------------------------------------------------------------------
  // TEST 7: Valid OFFLINE Message Handling (LWT Simulation)
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 7: ESP32 OFFLINE / LWT Message Processing ---')
  const offlineSocketPromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout waiting for device:status (OFFLINE)')), 8000)
    socketClient.on('device:status', function onOffline(payload) {
      if (payload.deviceId === TEST_DEVICE_ID && payload.isOnline === false) {
        socketClient.off('device:status', onOffline)
        clearTimeout(timer)
        resolve(payload)
      }
    })
  })

  const offlinePayload = {
    deviceId: TEST_DEVICE_ID,
    status: 'offline',
  }
  console.log(`Publishing to [${AVAILABILITY_TOPIC}]:`, offlinePayload)
  mqttClient.publish(AVAILABILITY_TOPIC, JSON.stringify(offlinePayload), { qos: 1, retain: true })

  const offlineEvent = await offlineSocketPromise
  assert(offlineEvent.deviceId === TEST_DEVICE_ID, 'Socket.IO received offline event for device')
  assert(offlineEvent.isOnline === false, 'Socket.IO payload has isOnline=false')
  assert(offlineEvent.lastSeenAt !== null, 'Socket.IO payload kept lastSeenAt (not nullified)')

  // Check MongoDB
  await sleep(300)
  const dbDeviceAfterOffline = await Device.findOne({ deviceId: TEST_DEVICE_ID })
  assert(dbDeviceAfterOffline.isOnline === false, 'MongoDB document updated with isOnline=false')
  assert(
    dbDeviceAfterOffline.lastSeenAt.getTime() === secondSeenTimestamp,
    'MongoDB document preserved last known heartbeat/online timestamp'
  )

  // --------------------------------------------------------------------------
  // TEST 8: Error Handling: Invalid JSON Payload
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 8: Error Handling: Malformed / Invalid JSON ---')
  mqttClient.publish(AVAILABILITY_TOPIC, 'INVALID_JSON_{{NOT_CLOSED', { qos: 1 })
  await sleep(600)
  // Verify backend didn't crash by doing a health ping
  const healthCheckAfterInvalid = await fetch(`${API_BASE}/api/health`)
  assert(healthCheckAfterInvalid.status === 200, 'Backend remained online and healthy after invalid JSON payload')

  // --------------------------------------------------------------------------
  // TEST 9: Error Handling: Non-Existent deviceId
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 9: Error Handling: Non-Existent deviceId ---')
  mqttClient.publish(
    AVAILABILITY_TOPIC,
    JSON.stringify({ deviceId: 'NON_EXISTENT_DEVICE_XYZ_999', status: 'offline' }),
    { qos: 1 }
  )
  await sleep(600)
  const healthCheckAfterUnknown = await fetch(`${API_BASE}/api/health`)
  assert(healthCheckAfterUnknown.status === 200, 'Backend remained online and healthy after non-existent deviceId')
  const unknownDoc = await Device.findOne({ deviceId: 'NON_EXISTENT_DEVICE_XYZ_999' })
  assert(!unknownDoc, 'No spurious document was created in MongoDB for non-existent deviceId')

  // --------------------------------------------------------------------------
  // TEST 10: REST API Reflection Check
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 10: REST API Reflection (GET /api/devices/:id) ---')
  const deviceApiRes = await fetch(`${API_BASE}/api/devices/${TEST_DEVICE_ID}`, {
    headers: { Authorization: `Bearer ${teacherToken}` },
  })
  assert(deviceApiRes.status === 200, `GET /api/devices/${TEST_DEVICE_ID} returned HTTP 200`)
  const deviceApiData = await deviceApiRes.json()
  console.log('deviceApiData in TEST 10:', JSON.stringify(deviceApiData, null, 2))
  assert(deviceApiData.device?.deviceId === TEST_DEVICE_ID, 'API returned correct device')
  assert(deviceApiData.device?.isOnline === false, 'API returned isOnline=false')
  assert(deviceApiData.device?.lastSeenAt !== null, 'API returned valid lastSeenAt timestamp')

  // --------------------------------------------------------------------------
  // CLEANUP & SUMMARY
  // --------------------------------------------------------------------------
  console.log('\n--- Teardown & Cleanup ---')
  mqttClient.end()
  socketClient.disconnect()
  await mongoose.disconnect()
  console.log('✓ Disconnected MQTT, Socket.IO, and MongoDB')

  console.log('\n' + '='.repeat(70))
  console.log(`🎉 ALL AVAILABILITY REQUIREMENTS VERIFIED! (${passedTests}/${totalTests} tests passed)`)
  console.log('='.repeat(70) + '\n')
}

runAvailabilityTests().catch((err) => {
  console.error('\n❌ Availability test failed:', err)
  process.exit(1)
})
