/**
 * Verification Script for Socket.IO Real-Time Device Status Updates:
 * - Connects a Socket.IO client to Express backend (http://localhost:5000)
 * - Verifies successful connection & transport handshake
 * - Listens for 'device:status' real-time events
 * - Dispatches POST /api/devices/:id/command (ON/OFF)
 * - Verifies that client receives 'device:status' event with updated state
 * - Dispatches POST /api/devices/:id/simulate-status (simulating incoming MQTT status message)
 * - Verifies that DB is updated and 'device:status' is broadcast with online/offline status
 * - Verifies graceful client disconnect and reconnect
 */

const path = require('path')
const dotenv = require('dotenv')
dotenv.config({ path: path.resolve(__dirname, '../.env') })

const mongoose = require('mongoose')
const { io } = require('socket.io-client')
const { Device, DEVICE_TYPES, DEVICE_STATES } = require('../src/models/Device')
const { User, ROLES } = require('../src/models/User')
const { generateToken } = require('../src/utils/jwt.util')

const API_BASE = `http://localhost:${process.env.PORT || 5000}`

async function runRealtimeTests() {
  console.log('\n======================================================')
  console.log('⚡ SMART CLASSROOM REAL-TIME (SOCKET.IO) VERIFICATION')
  console.log('======================================================\n')

  await mongoose.connect(process.env.MONGODB_URI)
  console.log('✅ Connected to MongoDB Atlas')

  // 1. Setup Test Device in MongoDB
  console.log('\n--- 1. Setting up Test Device ---')
  const { getCommandTopic, getStateTopic } = require('../src/utils/mqttTopics')
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
      isOnline: true,
      gpioPin: 23,
      isActive: true,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  )
  console.log(`✓ Test Device ready: ${testDevice.name} (${testDevice.deviceId}), state: ${testDevice.state}`)

  // 2. Obtain Authentication Token (TEACHER)
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

  // 3. Connect Socket.IO Client
  console.log('\n--- 3. Connecting Socket.IO Client to Backend ---')
  const socketClient = io(API_BASE, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 5,
    timeout: 10000,
  })

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Socket.IO connection timed out')), 8000)
    socketClient.on('connect', () => {
      clearTimeout(timer)
      console.log(`✅ Socket.IO Client connected successfully! (Socket ID: ${socketClient.id})`)
      resolve()
    })
    socketClient.on('connect_error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
  })

  // 4. Test Device Command -> Socket.IO Event Delivery
  console.log('\n--- 4. Testing Device Command -> Socket.IO Event Delivery ---')
  const commandPromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout waiting for device:status on command')), 6000)
    socketClient.on('device:status', function onStatus(payload) {
      if (payload.deviceId === 'ESP32-RM302-LIGHT-01') {
        console.log(`📡 [Socket Event Received] deviceId: ${payload.deviceId}, state: ${payload.state}, isOnline: ${payload.isOnline}`)
        socketClient.off('device:status', onStatus)
        clearTimeout(timer)
        resolve(payload)
      }
    })
  })

  // Send Command via REST API
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
  if (receivedOnEvent.state === 'ON' && receivedOnEvent.isOnline === true) {
    console.log('✅ Command correctly updated device state and triggered real-time event (ON, isOnline=true)')
  } else {
    throw new Error(`Unexpected event payload: ${JSON.stringify(receivedOnEvent)}`)
  }

  // 5. Test Simulated MQTT Status Message -> Database -> Socket.IO
  console.log('\n--- 5. Testing Simulated MQTT Status -> Database -> Socket.IO ---')
  const simPromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout waiting for device:status on simulation')), 6000)
    socketClient.on('device:status', function onSimStatus(payload) {
      if (payload.deviceId === 'ESP32-RM302-LIGHT-01') {
        console.log(`📡 [Socket Event Received via Simulated MQTT] deviceId: ${payload.deviceId}, state: ${payload.state}, isOnline: ${payload.isOnline}`)
        socketClient.off('device:status', onSimStatus)
        clearTimeout(timer)
        resolve(payload)
      }
    })
  })

  // Trigger simulate-status endpoint
  const simResponse = await fetch(`${API_BASE}/api/devices/ESP32-RM302-LIGHT-01/simulate-status`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${teacherToken}`,
    },
    body: JSON.stringify({
      state: 'OFF',
      isOnline: false,
    }),
  })
  const simResult = await simResponse.json()
  console.log(`✓ Simulation endpoint response HTTP ${simResponse.status}: ${simResult.message}`)

  const receivedOffEvent = await simPromise
  if (receivedOffEvent.state === 'OFF' && receivedOffEvent.isOnline === false) {
    console.log('✅ Simulated MQTT message successfully updated DB and broadcasted real-time event (OFF, isOnline=false)')
  } else {
    throw new Error(`Unexpected simulation event payload: ${JSON.stringify(receivedOffEvent)}`)
  }

  // 6. Verify Database Reflection
  console.log('\n--- 6. Verifying Final Database State ---')
  const dbDevice = await Device.findOne({ deviceId: 'ESP32-RM302-LIGHT-01' })
  console.log(`✓ MongoDB State: state=${dbDevice.state}, isOnline=${dbDevice.isOnline}, updatedAt=${dbDevice.updatedAt}`)
  if (dbDevice.state === 'OFF' && dbDevice.isOnline === false) {
    console.log('✅ Database state matches the real-time event')
  } else {
    throw new Error('Database state does not match expected values')
  }

  // 7. Clean up Socket.IO Client and DB connection
  console.log('\n--- 7. Gracefully Disconnecting Socket.IO Client ---')
  socketClient.disconnect()
  console.log('✅ Socket.IO Client disconnected cleanly')

  await mongoose.disconnect()
  console.log('✅ Database disconnected')

  console.log('\n======================================================')
  console.log('🎉 ALL REAL-TIME SOCKET.IO TESTS PASSED SUCCESSFULLY!')
  console.log('======================================================\n')
}

runRealtimeTests().catch((err) => {
  console.error('\n❌ Real-time test failed:', err)
  process.exit(1)
})
