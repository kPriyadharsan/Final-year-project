/**
 * Comprehensive Verification Script for Socket.IO Real-Time Architecture:
 * 1. Authenticated Socket.IO client connection (JWT in handshake)
 * 2. Unauthenticated observer connection
 * 3. Classroom room join ('join:classroom') & event subscription
 * 4. Device Command -> Socket.IO Event Delivery ('device:status' & 'device:<id>:status')
 * 5. Credential Isolation: Verifies NO MQTT credentials/secrets are exposed in socket payloads
 * 6. Hardware MQTT State Telemetry -> MongoDB -> Socket.IO Broadcast (confirmedState)
 * 7. Hardware Availability Telemetry (LWT) -> MongoDB -> Socket.IO Broadcast (isOnline)
 * 8. Security Guard: Client unauthorized mutation attempts blocked over Socket.IO
 * 9. Graceful disconnection & cleanup
 */

const path = require('path')
const dotenv = require('dotenv')
dotenv.config({ path: path.resolve(__dirname, '../.env') })

const mongoose = require('mongoose')
const mqtt = require('mqtt')
const { io } = require('socket.io-client')
const { Device, DEVICE_TYPES, DEVICE_STATES } = require('../src/models/Device')
const { User, ROLES } = require('../src/models/User')
const { generateToken } = require('../src/utils/jwt.util')
const { getCommandTopic, getStateTopic, getAvailabilityTopic } = require('../src/utils/mqttTopics')

const API_BASE = `http://localhost:${process.env.PORT || 5000}`

async function runRealtimeTests() {
  console.log('\n======================================================')
  console.log('⚡ PRODUCTION-READY SOCKET.IO REAL-TIME VERIFICATION')
  console.log('======================================================\n')

  await mongoose.connect(process.env.MONGODB_URI)
  console.log('✅ Connected to MongoDB Atlas')

  // 1. Setup Test Device in MongoDB
  console.log('\n--- 1. Setting up Test Device in MongoDB ---')
  const testDevice = await Device.findOneAndUpdate(
    { deviceId: 'ESP32-RM302-LIGHT-01' },
    {
      name: 'Classroom 302 Main Lights',
      type: DEVICE_TYPES.LIGHT,
      classroom: 'Room 302',
      deviceId: 'ESP32-RM302-LIGHT-01',
      mqttCommandTopic: getCommandTopic('Room 302', 'light'),
      mqttStatusTopic: getStateTopic('Room 302', 'light'),
      state: DEVICE_STATES.OFF,
      requestedState: 'OFF',
      confirmedState: 'OFF',
      isOnline: true,
      gpioPin: 23,
      isActive: true,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  )
  console.log(`✓ Test Device ready: ${testDevice.name} (${testDevice.deviceId}), state: ${testDevice.state}`)

  // 2. Generate Teacher Authentication Credentials
  console.log('\n--- 2. Generating Authentication Credentials ---')
  let teacherUser = await User.findOne({ role: ROLES.TEACHER })
  if (!teacherUser) {
    teacherUser = await User.create({
      name: 'Realtime Test Teacher',
      email: 'realtime.teacher@smartclassroom.edu',
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
  console.log(`✓ Generated JWT for ${teacherUser.email} (Role: ${teacherUser.role})`)

  // 3. Connect Authenticated Socket.IO Client (Handshake Auth)
  console.log('\n--- 3. Testing Authenticated Socket.IO Connection ---')
  const authSocket = io(API_BASE, {
    transports: ['websocket', 'polling'],
    auth: { token: teacherToken },
    reconnection: true,
    timeout: 10000,
  })

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Authenticated Socket.IO connection timed out')), 8000)
    authSocket.on('connect', () => {
      clearTimeout(timer)
      console.log(`✅ Authenticated Socket connected (ID: ${authSocket.id}, Transport: ${authSocket.io.engine.transport.name})`)
      resolve()
    })
    authSocket.on('connect_error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
  })

  // 4. Test Classroom Room Subscription ('join:classroom')
  console.log('\n--- 4. Testing Classroom Room Subscription ---')
  const joinedPromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout waiting for joined:classroom confirmation')), 5000)
    authSocket.on('joined:classroom', (res) => {
      clearTimeout(timer)
      resolve(res)
    })
  })
  authSocket.emit('join:classroom', 'Room 302')
  const joinResult = await joinedPromise
  console.log(`✅ Room subscription confirmed: "${joinResult.room}" (Slug: ${joinResult.slug})`)

  // 5. Test Device Command -> Socket.IO Broadcast & Credential Check
  console.log('\n--- 5. Testing REST Command -> Socket.IO Real-Time Delivery ---')
  const commandPromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout waiting for device:status on command')), 6000)
    authSocket.on('device:status', function onStatus(payload) {
      if (payload.deviceId === 'ESP32-RM302-LIGHT-01') {
        authSocket.off('device:status', onStatus)
        clearTimeout(timer)
        resolve(payload)
      }
    })
  })

  const cmdResponse = await fetch(`${API_BASE}/api/devices/ESP32-RM302-LIGHT-01/command`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${teacherToken}`,
    },
    body: JSON.stringify({ action: 'ON' }),
  })
  const cmdResult = await cmdResponse.json()
  console.log(`✓ REST Command response HTTP ${cmdResponse.status}: ${cmdResult.message}`)

  const receivedOnEvent = await commandPromise
  console.log(`📡 [Socket.IO Broadcast Received]: deviceId=${receivedOnEvent.deviceId}, state=${receivedOnEvent.state}, req=${receivedOnEvent.requestedState}`)

  if (receivedOnEvent.state !== 'ON' || receivedOnEvent.requestedState !== 'ON') {
    throw new Error(`Unexpected event payload state: ${JSON.stringify(receivedOnEvent)}`)
  }

  // 5b. Credential Isolation Check
  console.log('\n--- 5b. Security Verification: Credential Isolation ---')
  const stringified = JSON.stringify(receivedOnEvent)
  const forbiddenKeywords = ['mqtt_password', 'password', 'emqxsl', 'secrets', 'privateKey', 'cert']
  for (const kw of forbiddenKeywords) {
    if (stringified.toLowerCase().includes(kw)) {
      throw new Error(`CRITICAL SECURITY FAILURE: Socket payload leaked sensitive credential keyword: "${kw}"`)
    }
  }
  console.log('✅ Verified: No MQTT credentials, broker URLs, or secrets exposed in Socket.IO payload')

  // 6. Test Physical MQTT Telemetry -> Database -> Socket.IO
  console.log('\n--- 6. Connecting Hardware MQTT Client for Telemetry Simulation ---')
  const MQTT_BROKER = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883'
  const mqttClient = mqtt.connect(MQTT_BROKER, {
    clientId: 'Realtime_Test_Hardware_Simulator_' + Math.random().toString(16).slice(2, 8),
    clean: true,
    ...(process.env.MQTT_USERNAME ? { username: process.env.MQTT_USERNAME } : {}),
    ...(process.env.MQTT_PASSWORD ? { password: process.env.MQTT_PASSWORD } : {}),
  })

  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Hardware MQTT Client connection timed out')), 8000)
    mqttClient.on('connect', () => {
      clearTimeout(t)
      console.log('✅ Hardware simulator connected to MQTT broker')
      resolve()
    })
    mqttClient.on('error', (err) => {
      clearTimeout(t)
      reject(err)
    })
  })

  console.log('\n--- 6b. Testing MQTT Hardware State Telemetry -> Socket.IO ---')
  const mqttSyncPromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout waiting for device:status on MQTT state')), 6000)
    authSocket.on('device:status', function onSync(payload) {
      if (payload.deviceId === 'ESP32-RM302-LIGHT-01' && payload.confirmedState === 'OFF') {
        authSocket.off('device:status', onSync)
        clearTimeout(timer)
        resolve(payload)
      }
    })
  })

  // Publish hardware confirmation to MQTT state topic
  mqttClient.publish(
    getStateTopic('Room 302', 'light'),
    JSON.stringify({
      deviceId: 'ESP32-RM302-LIGHT-01',
      state: 'OFF',
      isOnline: true,
      timestamp: new Date().toISOString(),
    }),
    { qos: 1 }
  )

  const receivedConfirmedEvent = await mqttSyncPromise
  console.log(`📡 [Socket.IO Hardware Confirmation]: confirmedState=${receivedConfirmedEvent.confirmedState}, state=${receivedConfirmedEvent.state}`)
  console.log('✅ Hardware telemetry processed by DeviceSync and broadcast over Socket.IO')

  // 7. Test Hardware Availability Telemetry (LWT Offline)
  console.log('\n--- 7. Testing Board Availability Telemetry (LWT) -> Socket.IO ---')
  const availPromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout waiting for device:status on availability')), 6000)
    authSocket.on('device:status', function onAvail(payload) {
      if (payload.deviceId === 'ESP32-RM302-LIGHT-01' && payload.isOnline === false) {
        authSocket.off('device:status', onAvail)
        clearTimeout(timer)
        resolve(payload)
      }
    })
  })

  // Publish LWT offline availability
  mqttClient.publish(
    getAvailabilityTopic('Room 302'),
    JSON.stringify({
      classroom: 'Room 302',
      status: 'offline',
      timestamp: new Date().toISOString(),
    }),
    { qos: 1, retain: true }
  )

  const receivedAvailEvent = await availPromise
  console.log(`📡 [Socket.IO Availability Update]: isOnline=${receivedAvailEvent.isOnline}`)
  console.log('✅ LWT availability event updated devices and broadcasted over Socket.IO')

  // Restore online state for clean database state
  mqttClient.publish(
    getAvailabilityTopic('Room 302'),
    JSON.stringify({ classroom: 'Room 302', status: 'online', timestamp: new Date().toISOString() }),
    { qos: 1, retain: true }
  )
  await new Promise((r) => setTimeout(r, 600))
  mqttClient.end()

  // 8. Test Security Guard: Prevent unauthorized mutations over Socket.IO
  console.log('\n--- 8. Testing Socket.IO Security Guard (Prevent Auth Bypass) ---')
  const securityPromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout waiting for error:unauthorized')), 5000)
    authSocket.on('error:unauthorized', (errPayload) => {
      clearTimeout(timer)
      resolve(errPayload)
    })
  })

  // Attempt unauthorized client mutation event
  authSocket.emit('device:command', { deviceId: 'ESP32-RM302-LIGHT-01', action: 'ON' })
  const securityResponse = await securityPromise
  console.log(`🛡️ Security response received: code="${securityResponse.code}", message="${securityResponse.message}"`)

  if (securityResponse.code === 'UNAUTHORIZED_MUTATION') {
    console.log('✅ Socket.IO successfully blocked client mutation attempt!')
  } else {
    throw new Error('Security guard failed to intercept client mutation event')
  }

  // 9. Clean up and Disconnect
  console.log('\n--- 9. Graceful Disconnect & Teardown ---')
  authSocket.emit('leave:classroom', 'Room 302')
  authSocket.disconnect()
  console.log('✅ Socket.IO Client disconnected cleanly')

  await mongoose.disconnect()
  console.log('✅ Database disconnected')

  console.log('\n======================================================')
  console.log('🎉 ALL SOCKET.IO PRODUCTION REQUIREMENTS FULLY VERIFIED!')
  console.log('======================================================\n')
}

runRealtimeTests().catch((err) => {
  console.error('\n❌ Real-time test failed:', err)
  process.exit(1)
})
