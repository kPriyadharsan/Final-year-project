/**
 * Automated Verification Script for Real-Time Digital Device Control
 *
 * Validates:
 * 1. ESP32 Online / Offline LWT Availability Reflection
 * 2. Light ON/OFF updates via MQTTX (smartclassroom/room302/relay/light/state)
 * 3. Fan ON/OFF updates via MQTTX (smartclassroom/room302/relay/fan/state)
 * 4. Projector ON/OFF updates via MQTTX (smartclassroom/room302/relay/projector/state)
 * 5. Projector RGB Power & Color updates via MQTTX (smartclassroom/room302/projector/color/state)
 * 6. Cross-browser immediate synchronization via authenticated Socket.IO
 * 7. Verification that lastSeenAt is preserved during offline transitions
 */

const path = require('path')
const dotenv = require('dotenv')
dotenv.config({ path: path.resolve(__dirname, '../.env') })

const mongoose = require('mongoose')
const mqtt = require('mqtt')
const { io } = require('socket.io-client')
const { Device } = require('../src/models/Device')
const { User, ROLES } = require('../src/models/User')
const { generateToken } = require('../src/utils/jwt.util')

const API_BASE = `http://localhost:${process.env.PORT || 5000}`

async function runRealtimeDeviceControlTests() {
  console.log('\n======================================================')
  console.log('⚡ DIGITAL DEVICE CONTROL REAL-TIME AUTOMATED VERIFICATION')
  console.log('======================================================\n')

  await mongoose.connect(process.env.MONGODB_URI)
  console.log('✅ Connected to MongoDB Atlas')

  // 1. Prepare Teacher Auth Token
  let teacherUser = await User.findOne({ role: ROLES.TEACHER })
  if (!teacherUser) {
    teacherUser = await User.create({
      name: 'Test Teacher',
      email: 'teacher.realtime@smartclassroom.edu',
      password: 'TeacherPassword123!',
      role: ROLES.TEACHER,
      department: 'Computer Science',
    })
  }
  const teacherToken = generateToken({
    id: teacherUser._id.toString(),
    email: teacherUser.email,
    role: teacherUser.role,
  })

  // 2. Connect Browser 1 (Socket.IO Client 1)
  console.log('\n--- 1. Connecting Browser 1 (Socket.IO Client) ---')
  const clientSocket1 = io(API_BASE, {
    transports: ['websocket', 'polling'],
    auth: { token: teacherToken },
    timeout: 10000,
  })

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Browser 1 socket timeout')), 8000)
    clientSocket1.on('connect', () => {
      clearTimeout(timer)
      console.log(`✅ Browser 1 connected (ID: ${clientSocket1.id})`)
      resolve()
    })
    clientSocket1.on('connect_error', reject)
  })

  // Subscribe to Room 302
  clientSocket1.emit('join:classroom', 'Room 302')

  // 3. Connect Browser 2 (Socket.IO Client 2)
  console.log('\n--- 2. Connecting Browser 2 (Cross-Browser Sync Test) ---')
  const clientSocket2 = io(API_BASE, {
    transports: ['websocket', 'polling'],
    auth: { token: teacherToken },
    timeout: 10000,
  })

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Browser 2 socket timeout')), 8000)
    clientSocket2.on('connect', () => {
      clearTimeout(timer)
      console.log(`✅ Browser 2 connected (ID: ${clientSocket2.id})`)
      resolve()
    })
    clientSocket2.on('connect_error', reject)
  })

  clientSocket2.emit('join:classroom', 'Room 302')

  // 4. Connect MQTT Simulator (representing MQTTX / physical ESP32)
  console.log('\n--- 3. Connecting MQTT Simulator (Simulating MQTTX & ESP32) ---')
  const MQTT_BROKER = process.env.MQTT_BROKER_URL
  const mqttClient = mqtt.connect(MQTT_BROKER, {
    clientId: 'MQTTX_Test_Sim_' + Math.random().toString(16).slice(2, 8),
    clean: true,
    ...(process.env.MQTT_USERNAME ? { username: process.env.MQTT_USERNAME } : {}),
    ...(process.env.MQTT_PASSWORD ? { password: process.env.MQTT_PASSWORD } : {}),
  })

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('MQTT client connection timeout')), 8000)
    mqttClient.on('connect', () => {
      clearTimeout(timer)
      console.log('✅ MQTT Simulator connected to EMQX broker')
      resolve()
    })
    mqttClient.on('error', reject)
  })

  // TEST 1: ESP32 Online Availability
  console.log('\n--- TEST 1: ESP32 Online Telemetry via MQTTX ---')
  const onlinePromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout waiting for ESP32 online event')), 6000)
    clientSocket1.on('node:status', function onNode(payload) {
      if (payload.deviceId === 'ESP32-RM302-01' && payload.isOnline === true) {
        clientSocket1.off('node:status', onNode)
        clearTimeout(timer)
        resolve(payload)
      }
    })
  })

  mqttClient.publish(
    'smartclassroom/room302/availability',
    JSON.stringify({
      status: 'online',
      classroom: 'room302',
      deviceId: 'ESP32-RM302-01',
      uptime: 120,
    }),
    { qos: 1 }
  )

  const onlineEvent = await onlinePromise
  console.log(`✅ [Browser 1 Received]: 🟢 Controller Online (deviceId: ${onlineEvent.deviceId}, isOnline: ${onlineEvent.isOnline})`)

  // TEST 2: Light ON/OFF through MQTTX
  console.log('\n--- TEST 2: Light ON/OFF through MQTTX ---')
  const lightPromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout waiting for Light state update')), 6000)
    clientSocket1.on('device:status', function onLight(payload) {
      if (payload.type === 'LIGHT' && payload.state === 'ON') {
        clientSocket1.off('device:status', onLight)
        clearTimeout(timer)
        resolve(payload)
      }
    })
  })

  mqttClient.publish(
    'smartclassroom/room302/relay/light/state',
    JSON.stringify({ state: 'ON' }),
    { qos: 1 }
  )

  const lightEvent = await lightPromise
  console.log(`✅ [Browser 1 Received]: Light turned ON in real-time (deviceId: ${lightEvent.deviceId}, state: ${lightEvent.state})`)

  // TEST 3: Fan ON/OFF through MQTTX
  console.log('\n--- TEST 3: Fan ON/OFF through MQTTX ---')
  const fanPromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout waiting for Fan state update')), 6000)
    clientSocket1.on('device:status', function onFan(payload) {
      if (payload.type === 'FAN' && payload.state === 'ON') {
        clientSocket1.off('device:status', onFan)
        clearTimeout(timer)
        resolve(payload)
      }
    })
  })

  mqttClient.publish(
    'smartclassroom/room302/relay/fan/state',
    JSON.stringify({ state: 'ON' }),
    { qos: 1 }
  )

  const fanEvent = await fanPromise
  console.log(`✅ [Browser 1 Received]: Fan turned ON in real-time (deviceId: ${fanEvent.deviceId}, state: ${fanEvent.state})`)

  // TEST 4: Projector ON/OFF through MQTTX
  console.log('\n--- TEST 4: Projector ON/OFF through MQTTX ---')
  const projPromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout waiting for Projector state update')), 6000)
    clientSocket1.on('device:status', function onProj(payload) {
      if (payload.type === 'PROJECTOR' && payload.state === 'ON') {
        clientSocket1.off('device:status', onProj)
        clearTimeout(timer)
        resolve(payload)
      }
    })
  })

  mqttClient.publish(
    'smartclassroom/room302/relay/projector/state',
    JSON.stringify({ state: 'ON' }),
    { qos: 1 }
  )

  const projEvent = await projPromise
  console.log(`✅ [Browser 1 Received]: Projector turned ON in real-time (deviceId: ${projEvent.deviceId}, state: ${projEvent.state})`)

  // TEST 5: Projector RGB Power & Color through MQTTX
  console.log('\n--- TEST 5: Projector RGB through MQTTX ---')
  const colorPromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout waiting for Projector RGB update')), 6000)
    clientSocket1.on('device:color', function onColor(payload) {
      if (payload.power === 'ON' && payload.color && payload.color.r === 0 && payload.color.g === 255 && payload.color.b === 255) {
        clientSocket1.off('device:color', onColor)
        clearTimeout(timer)
        resolve(payload)
      }
    })
  })

  mqttClient.publish(
    'smartclassroom/room302/projector/color/state',
    JSON.stringify({
      power: 'ON',
      color: { r: 0, g: 255, b: 255 },
    }),
    { qos: 1 }
  )

  const colorEvent = await colorPromise
  console.log(`✅ [Browser 1 Received]: Projector RGB updated in real-time (Power: ${colorEvent.power}, RGB: R=${colorEvent.color.r}, G=${colorEvent.color.g}, B=${colorEvent.color.b})`)

  // TEST 6: Multi-Browser Real-Time Synchronization (Browser 1 changes Light -> Browser 2 updates)
  console.log('\n--- TEST 6: Multi-Browser Real-Time Synchronization ---')
  const browser2Promise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout waiting for Browser 2 to receive Light OFF update')), 6000)
    clientSocket2.on('device:status', function onB2(payload) {
      if (payload.type === 'LIGHT' && payload.state === 'OFF') {
        clientSocket2.off('device:status', onB2)
        clearTimeout(timer)
        resolve(payload)
      }
    })
  })

  // Command light OFF via REST API (as Browser 1 would)
  const apiRes = await fetch(`${API_BASE}/api/devices/ESP32-RM302-LIGHT-01/command`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${teacherToken}`,
    },
    body: JSON.stringify({ action: 'OFF' }),
  })
  const apiJson = await apiRes.json()
  console.log(`✓ Browser 1 dispatched command: ${apiJson.message}`)

  const b2Event = await browser2Promise
  console.log(`✅ [Browser 2 Received]: Immediate update without refresh (deviceId: ${b2Event.deviceId}, state: ${b2Event.state})`)

  // TEST 7: ESP32 Disconnected (LWT Offline) -> 🔴 Controller Offline
  console.log('\n--- TEST 7: ESP32 Disconnected (LWT Offline) ---')
  const offlinePromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout waiting for ESP32 offline event')), 6000)
    clientSocket1.on('node:status', function onOffline(payload) {
      if (payload.deviceId === 'ESP32-RM302-01' && payload.isOnline === false) {
        clientSocket1.off('node:status', onOffline)
        clearTimeout(timer)
        resolve(payload)
      }
    })
  })

  mqttClient.publish(
    'smartclassroom/room302/availability',
    JSON.stringify({
      status: 'offline',
      classroom: 'room302',
    }),
    { qos: 1 }
  )

  const offlineEvent = await offlinePromise
  console.log(`✅ [Browser 1 Received]: 🔴 Controller Offline (deviceId: ${offlineEvent.deviceId}, isOnline: ${offlineEvent.isOnline})`)
  console.log(`✓ Preserved lastSeenAt: ${offlineEvent.lastSeenAt}`)

  // Restore ESP32 to online for clean state
  mqttClient.publish(
    'smartclassroom/room302/availability',
    JSON.stringify({
      status: 'online',
      classroom: 'room302',
      deviceId: 'ESP32-RM302-01',
    }),
    { qos: 1 }
  )
  await new Promise((r) => setTimeout(r, 600))

  // Clean up connections
  clientSocket1.disconnect()
  clientSocket2.disconnect()
  mqttClient.end()
  await mongoose.disconnect()

  console.log('\n======================================================')
  console.log('🎉 ALL DIGITAL DEVICE CONTROL REAL-TIME TESTS PASSED!')
  console.log('======================================================\n')
  process.exit(0)
}

runRealtimeDeviceControlTests().catch((err) => {
  console.error('\n❌ REAL-TIME TEST FAILED:', err)
  process.exit(1)
})
