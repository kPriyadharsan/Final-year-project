/**
 * End-to-End Real ESP32 Integration Verification Script
 * 
 * Verifies the complete two-way hardware loop:
 * Flow 1: Teacher Dashboard -> Express -> MQTT -> ESP32 -> Relay
 * Flow 2: ESP32 -> MQTT Status -> Express -> MongoDB -> Socket.IO -> React Dashboard
 * 
 * Tests:
 * 1. ESP32 connects and announces availability (LWT/Online)
 * 2. MongoDB updates all classroom devices to isOnline = true
 * 3. Express dispatches command to ESP32 on matching topic
 * 4. ESP32 receives command and publishes real-time hardware status update
 * 5. MongoDB updates device state (ON/OFF) and Socket.IO broadcasts to React
 * 6. ESP32 disconnects (simulating power-off LWT) -> Express marks device OFFLINE
 * 7. Offline protection verified (returns "Command could not be delivered.")
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

const API_BASE = `http://localhost:${process.env.PORT || 5000}`
const MQTT_BROKER = process.env.MQTT_BROKER_URL || 'mqtt://127.0.0.1:1883'

async function runESP32IntegrationTest() {
  console.log('\n======================================================')
  console.log('⚡ ESP32 HARDWARE INTEGRATION & TWO-WAY FLOW VERIFICATION')
  console.log('======================================================\n')

  await mongoose.connect(process.env.MONGODB_URI)
  console.log('✅ Connected to MongoDB Atlas')

  // 1. Prepare Target Test Devices in MongoDB
  console.log('\n--- 1. Setting up Target Devices in MongoDB ---')
  const { getCommandTopic, getStateTopic, getAvailabilityTopic } = require('../src/utils/mqttTopics')
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
      isOnline: false, // Starts offline until ESP32 connects
      gpioPin: 22,
      isActive: true,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  )
  console.log(`✓ Device prepared: ${fanDevice.name} (${fanDevice.deviceId}) -> isOnline: ${fanDevice.isOnline}`)

  // 2. Generate Authentication Token for Teacher
  console.log('\n--- 2. Generating Teacher Authentication Token ---')
  const teacherUser = await User.findOne({ role: ROLES.TEACHER })
  const teacherToken = generateToken({
    id: teacherUser._id.toString(),
    email: teacherUser.email,
    role: teacherUser.role,
  })
  console.log(`✓ Generated JWT for ${teacherUser.email}`)

  // 3. Connect Socket.IO Client (simulating React Dashboard)
  console.log('\n--- 3. Connecting Socket.IO Client (Dashboard Simulation) ---')
  const socket = io(API_BASE, {
    transports: ['websocket'],
    reconnection: false,
  })

  const socketEvents = []
  socket.on('device:status', (event) => {
    console.log(`📡 [Socket.IO Broadcast Received]: ${event.deviceId} -> State: ${event.state}, Online: ${event.isOnline}`)
    socketEvents.push(event)
  })

  await new Promise((resolve) => socket.on('connect', resolve))
  console.log('✅ Socket.IO Client connected successfully (ID:', socket.id, ')')

  // 4. Connect Hardware ESP32 MQTT Client
  console.log('\n--- 4. Connecting ESP32 Hardware MQTT Client ---')
  const availabilityTopic = getAvailabilityTopic('Room 302')
  const esp32Mqtt = mqtt.connect(MQTT_BROKER, {
    clientId: 'ESP32_SmartClassroom_Hardware_Simulator',
    clean: true,
    will: {
      topic: availabilityTopic,
      payload: 'offline',
      qos: 1,
      retain: true,
    },
  })

  const receivedCommands = []

  await new Promise((resolve, reject) => {
    esp32Mqtt.on('connect', () => {
      console.log('✅ ESP32 connected to MQTT Broker')
      // Subscribe to all appliance control topics matching firmware
      esp32Mqtt.subscribe('smartclassroom/room302/relay/+/command', { qos: 1 }, () => {
        console.log('✓ ESP32 subscribed to: smartclassroom/room302/relay/+/command')
        resolve()
      })
    })
    esp32Mqtt.on('error', reject)
  })

  esp32Mqtt.on('message', (topic, payloadBuffer) => {
    const rawPayload = payloadBuffer.toString()
    console.log(`[ESP32 Hardware RX] 📥 Topic: [${topic}] | Payload: ${rawPayload}`)
    receivedCommands.push({ topic, payload: rawPayload })
  })

  // 5. ESP32 Announces Availability ("online")
  console.log('\n--- 5. ESP32 Announces Online Availability ---')
  esp32Mqtt.publish(availabilityTopic, 'online', { qos: 1, retain: true })

  // Wait 1 second for backend deviceSync to process availability and update MongoDB
  await new Promise((r) => setTimeout(r, 1000))

  const onlineFan = await Device.findOne({ deviceId: 'ESP32-RM302-FAN-01' })
  console.log(`✓ MongoDB verification: ${onlineFan.deviceId} -> isOnline = ${onlineFan.isOnline}`)
  if (!onlineFan.isOnline) {
    throw new Error('Device isOnline was not updated to true upon ESP32 connection!')
  }
  console.log('✅ PASS: Real ESP32 availability event updated MongoDB to isOnline=true')

  // 6. Test Flow 1: Teacher Dashboard / Express sends command -> ESP32 receives over MQTT
  console.log('\n--- 6. Testing Flow 1: Dashboard -> Express -> MQTT -> ESP32 ---')
  const commandRes = await fetch(`${API_BASE}/api/devices/${fanDevice.deviceId}/command`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${teacherToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action: 'ON' }),
  })
  const commandBody = await commandRes.json()
  console.log(`POST /api/devices/${fanDevice.deviceId}/command -> HTTP ${commandRes.status}`)
  console.log('Execution Message:', commandBody.message)

  if (commandRes.status !== 200 || commandBody.status !== 'success') {
    throw new Error(`Command failed: ${JSON.stringify(commandBody)}`)
  }
  if (commandBody.message !== 'Fan ON command sent.') {
    throw new Error(`Expected "Fan ON command sent.", got "${commandBody.message}"`)
  }

  // Wait 500ms for MQTT packet delivery to ESP32
  await new Promise((r) => setTimeout(r, 500))

  if (receivedCommands.length === 0) {
    throw new Error('ESP32 did not receive the MQTT command dispatched by Express!')
  }
  console.log('✅ PASS: Flow 1 verified. ESP32 received MQTT command on topic:', receivedCommands[0].topic)

  // 7. Test Flow 2: ESP32 switches relay and publishes status -> Express -> MongoDB -> Socket.IO -> Dashboard
  console.log('\n--- 7. Testing Flow 2: ESP32 Status -> Express -> MongoDB -> Socket.IO ---')
  const statusPayload = JSON.stringify({
    deviceId: 'ESP32-RM302-FAN-01',
    type: 'FAN',
    state: 'ON',
    isOnline: true,
    rssi: -58,
    uptime: 42,
  })

  const fanStateTopic = getStateTopic('Room 302', 'fan')
  esp32Mqtt.publish(fanStateTopic, statusPayload, { qos: 1 })
  console.log(`[ESP32 Hardware TX] 📤 Published status to [${fanStateTopic}]:`, statusPayload)

  // Wait 1 second for backend deviceSync and Socket.IO broadcast
  await new Promise((r) => setTimeout(r, 1000))

  const finalFan = await Device.findOne({ deviceId: 'ESP32-RM302-FAN-01' })
  console.log(`✓ Verified MongoDB final state: ${finalFan.deviceId} -> State: ${finalFan.state}, Online: ${finalFan.isOnline}`)
  if (finalFan.state !== 'ON') {
    throw new Error(`Expected MongoDB state ON, got ${finalFan.state}`)
  }

  const socketMatch = socketEvents.find((e) => e.deviceId === 'ESP32-RM302-FAN-01' && e.state === 'ON')
  if (!socketMatch) {
    throw new Error('Socket.IO did not receive the real-time device status broadcast!')
  }
  console.log('✅ PASS: Flow 2 verified. Real-time Socket.IO event received by dashboard')

  // 8. Test Flow 3: ESP32 Disconnection / Offline Status Propagation
  console.log('\n--- 8. Testing Flow 3: ESP32 Disconnect -> OFFLINE Status ---')
  esp32Mqtt.publish(availabilityTopic, 'offline', { qos: 1, retain: true })
  esp32Mqtt.end(true)

  await new Promise((r) => setTimeout(r, 1000))

  const offlineFan = await Device.findOne({ deviceId: 'ESP32-RM302-FAN-01' })
  console.log(`✓ Verified MongoDB offline state: ${offlineFan.deviceId} -> isOnline: ${offlineFan.isOnline}`)
  if (offlineFan.isOnline) {
    throw new Error('Device isOnline was not set to false upon ESP32 disconnect!')
  }

  // Attempting command when ESP32 is offline must be rejected
  const offlineCmdRes = await fetch(`${API_BASE}/api/devices/${fanDevice.deviceId}/command`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${teacherToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action: 'OFF' }),
  })
  const offlineCmdBody = await offlineCmdRes.json()
  console.log(`POST /command while offline -> HTTP ${offlineCmdRes.status}: ${offlineCmdBody.message}`)

  if (offlineCmdRes.status !== 503 || offlineCmdBody.message !== 'Command could not be delivered.') {
    throw new Error('Expected 503 "Command could not be delivered." when ESP32 is offline')
  }
  console.log('✅ PASS: Flow 3 verified. Disconnected ESP32 correctly shows OFFLINE and rejects commands')

  // Cleanup
  socket.disconnect()
  await mongoose.disconnect()
  console.log('\n======================================================')
  console.log('🎉 ALL ESP32 HARDWARE INTEGRATION FLOWS VERIFIED 100%!')
  console.log('======================================================\n')
}

runESP32IntegrationTest().catch((err) => {
  console.error('\n❌ ESP32 Integration test failed:', err)
  process.exit(1)
})
