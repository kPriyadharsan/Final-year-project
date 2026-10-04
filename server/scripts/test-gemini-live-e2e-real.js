/**
 * End-to-End Real Verification Script for Step 5:
 * Gemini Live WebSocket Tool Calling -> Normalization -> Backend -> MQTT -> ESP32 -> Telemetry
 *
 * Verifies the 5 Natural Language Commands via real Gemini Live:
 * 1. "Turn on the fan" -> fan ON
 * 2. "Turn off the light" -> light OFF
 * 3. "Turn on the fan and light" -> fan ON, light ON
 * 4. "Turn off everything" -> fan OFF, light OFF, projector OFF
 * 5. "Turn on the projector" -> projector ON
 *
 * Verifies real MQTT delivery and ESP32 telemetry state synchronization.
 */

const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '../.env') })
const mongoose = require('mongoose')
const mqtt = require('mqtt')
const { GoogleGenAI, Type } = require('@google/genai')
const WebSocket = require('ws')
global.WebSocket = WebSocket

const { Device, DEVICE_TYPES, DEVICE_STATES } = require('../src/models/Device')
const { User, ROLES } = require('../src/models/User')
const { generateToken } = require('../src/utils/jwt.util')
const { getCommandTopic, getStateTopic, getAvailabilityTopic } = require('../src/utils/mqttTopics')

const API_BASE = `http://localhost:${process.env.PORT || 5000}`
const MQTT_BROKER = process.env.MQTT_BROKER_URL || 'mqtt://127.0.0.1:1883'
const LIVE_MODEL = 'gemini-2.5-flash-native-audio-preview-12-2025'

const CONTROL_CLASSROOM_DEVICES_TOOL = {
  functionDeclarations: [
    {
      name: 'control_classroom_devices',
      description: 'Control one or more smart classroom appliances (light, fan, projector) to turn them ON or OFF.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          actions: {
            type: Type.ARRAY,
            description: 'List of device control actions to execute',
            items: {
              type: Type.OBJECT,
              properties: {
                device: {
                  type: Type.STRING,
                  enum: ['light', 'fan', 'projector'],
                  description: 'The target appliance to control',
                },
                action: {
                  type: Type.STRING,
                  enum: ['ON', 'OFF'],
                  description: 'The target state: ON or OFF',
                },
              },
              required: ['device', 'action'],
            },
          },
        },
        required: ['actions'],
      },
    },
  ],
}

const LIVE_SYSTEM_INSTRUCTION = `You control a smart classroom.

Supported devices:
- light
- fan
- projector

Supported actions:
- ON
- OFF

When the user requests a device action, call control_classroom_devices.

For multiple requested devices, include every requested device in the actions array.

Examples:

User: Turn on the fan.
Tool call:
actions = [
  { device: "fan", action: "ON" }
]

User: Turn on the fan and light.
Tool call:
actions = [
  { device: "fan", action: "ON" },
  { device: "light", action: "ON" }
]

User: Turn everything off.
Tool call:
actions = [
  { device: "fan", action: "OFF" },
  { device: "light", action: "OFF" },
  { device: "projector", action: "OFF" }
]

Never invent unsupported devices.

Keep responses short and natural.`

async function runRealGeminiLiveE2ETest() {
  console.log('='.repeat(75))
  console.log('🎙️ REAL GEMINI LIVE END-TO-END SMART CLASSROOM HARDWARE INTEGRATION')
  console.log('='.repeat(75))

  await mongoose.connect(process.env.MONGODB_URI)
  console.log('✅ Connected to MongoDB Atlas')

  const classroom = 'Room 302'

  // 1. Prepare Target Devices in MongoDB
  console.log('\n--- 1. Setting up Target Devices in MongoDB ---')
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

  await Device.findOneAndUpdate(
    { deviceId: 'ESP32-RM302-FAN-01' },
    {
      name: 'Classroom 302 Ceiling Fans',
      type: DEVICE_TYPES.FAN,
      classroom,
      deviceId: 'ESP32-RM302-FAN-01',
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

  await Device.findOneAndUpdate(
    { deviceId: 'ESP32-RM302-LIGHT-01' },
    {
      name: 'Classroom 302 Main Lights',
      type: DEVICE_TYPES.LIGHT,
      classroom,
      deviceId: 'ESP32-RM302-LIGHT-01',
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

  await Device.findOneAndUpdate(
    { deviceId: 'ESP32-RM302-PROJ-01' },
    {
      name: 'Classroom 302 Smart Projector',
      type: DEVICE_TYPES.PROJECTOR,
      classroom,
      deviceId: 'ESP32-RM302-PROJ-01',
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
  console.log('✓ Devices configured: Fan (OFF), Light (ON), Projector (OFF)')

  // 2. Connect Simulated ESP32 Hardware over MQTT
  console.log('\n--- 2. Connecting ESP32 Hardware MQTT Client ---')
  const availabilityTopic = getAvailabilityTopic(classroom)
  const esp32Mqtt = mqtt.connect(MQTT_BROKER, {
    clientId: 'ESP32_Live_E2E_Hardware_Simulator',
    clean: true,
    ...(process.env.MQTT_USERNAME ? { username: process.env.MQTT_USERNAME } : {}),
    ...(process.env.MQTT_PASSWORD ? { password: process.env.MQTT_PASSWORD } : {}),
    will: {
      topic: availabilityTopic,
      payload: 'offline',
      qos: 1,
      retain: true,
    },
  })

  const receivedMqttCommands = []

  await new Promise((resolve, reject) => {
    esp32Mqtt.on('connect', () => {
      console.log('✅ ESP32 Simulator connected to MQTT Broker')
      // Subscribe to all command topics for Room 302
      esp32Mqtt.subscribe('smartclassroom/room302/relay/+/command', { qos: 1 }, () => {
        console.log('✓ ESP32 Simulator subscribed to: smartclassroom/room302/relay/+/command')
        resolve()
      })
    })
    esp32Mqtt.on('error', reject)
  })

  // ESP32 hardware message handler: receives command and publishes telemetry state back
  esp32Mqtt.on('message', async (topic, payloadBuffer) => {
    try {
      const payloadStr = payloadBuffer.toString()
      const data = JSON.parse(payloadStr)
      console.log(`📡 [ESP32 Hardware RX] Topic: [${topic}] | Action: ${data.command || data.action} on Pin ${data.gpioPin}`)
      receivedMqttCommands.push({ topic, data })

      // Publish telemetry state update to the matching state topic
      const deviceType = topic.split('/')[3] // e.g. 'fan', 'light', 'projector'
      const stateTopic = getStateTopic(classroom, deviceType)
      const targetState = (data.command || data.action) === 'ON' ? 'ON' : 'OFF'

      const telemetryPayload = JSON.stringify({
        deviceId: data.deviceId,
        state: targetState,
        gpioPin: data.gpioPin,
        uptime: 12345,
        source: 'HARDWARE_RELAY_CONFIRMATION',
        timestamp: new Date().toISOString(),
      })

      esp32Mqtt.publish(stateTopic, telemetryPayload, { qos: 1 })
      console.log(`📤 [ESP32 Telemetry TX] Published confirmation state [${targetState}] to ${stateTopic}`)
    } catch (e) {
      console.warn('ESP32 message processing warning:', e.message)
    }
  })

  // Announce ESP32 availability
  esp32Mqtt.publish(availabilityTopic, 'online', { qos: 1, retain: true })

  // 3. Prepare Teacher Auth Token
  const teacherUser = await User.findOne({ role: ROLES.TEACHER })
  const token = generateToken({
    id: teacherUser._id.toString(),
    email: teacherUser.email,
    role: teacherUser.role,
  })

  // Helper to execute the full pipeline for a spoken command
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })

  async function executeLiveVoiceCommand(commandText, stepNum) {
    console.log(`\n------------------------------------------------------------`)
    console.log(`Step ${stepNum}: User speaks: "${commandText}"`)
    console.log(`------------------------------------------------------------`)

    return new Promise(async (resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Timeout waiting for Gemini Live response for "${commandText}"`))
      }, 20000)

      let liveSession = null

      const callbacks = {
        onopen: () => {
          console.log(`[GeminiLive] 🌐 Connected to Live session for "${commandText}"`)
        },
        onmessage: async (msg) => {
          // Look for tool calls in toolCall or serverContent.modelTurn
          let toolCalls = []
          if (msg.toolCall?.functionCalls) {
            toolCalls = msg.toolCall.functionCalls
          } else if (msg.serverContent?.modelTurn?.parts) {
            toolCalls = msg.serverContent.modelTurn.parts
              .filter((p) => p.functionCall)
              .map((p) => p.functionCall)
          }

          for (const call of toolCalls) {
            if (call.name === 'control_classroom_devices') {
              console.log(`🎯 [GeminiLive] Real Tool Call Received: control_classroom_devices`)
              console.log(`Raw Arguments:`, JSON.stringify(call.args))

              // Part 1: Frontend Normalization (handles Format A and Format B)
              const rawActions = call.args?.actions || []
              const normalizedActions = []
              for (const entry of rawActions) {
                let parsed = entry
                if (typeof entry === 'string') {
                  try {
                    parsed = JSON.parse(entry)
                  } catch {
                    continue
                  }
                }
                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                  const dev = String(parsed.device || '').toLowerCase()
                  const act = String(parsed.action || '').toUpperCase()
                  if (['light', 'fan', 'projector'].includes(dev) && ['ON', 'OFF'].includes(act)) {
                    normalizedActions.push({ device: dev, action: act })
                  }
                }
              }

              console.log(`Normalized Actions (${normalizedActions.length}):`, JSON.stringify(normalizedActions))

              // Part 3: Call Protected Backend Endpoint POST /api/voice/live/command
              const resp = await fetch(`${API_BASE}/api/voice/live/command`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                  actions: normalizedActions,
                  classroom,
                }),
              })

              const backendResult = await resp.json()
              console.log(`[Backend Response]:`, JSON.stringify(backendResult))

              // Part 4: Send tool response back to Gemini Live
              const actionResults = backendResult.data?.actions || []
              liveSession.sendToolResponse({
                functionResponses: [
                  {
                    id: call.id || 'live_call_id',
                    name: 'control_classroom_devices',
                    response: {
                      actions: actionResults.map((a) => ({
                        device: a.device,
                        action: a.action,
                        success: a.success,
                      })),
                    },
                  },
                ],
              })

              // Wait 1.5s for MQTT and ESP32 telemetry roundtrip
              await new Promise((r) => setTimeout(r, 1500))

              clearTimeout(timeout)
              try {
                await liveSession.close()
              } catch (_) {}

              resolve({
                commandText,
                toolCall: call,
                normalizedActions,
                backendResult,
              })
              return
            }
          }
        },
        onerror: (err) => {
          console.warn('[GeminiLive] Session error:', err)
        },
        onclose: () => {},
      }

      try {
        liveSession = await ai.live.connect({
          model: LIVE_MODEL,
          config: {
            responseModalities: ['AUDIO'],
            systemInstruction: {
              parts: [{ text: LIVE_SYSTEM_INSTRUCTION }],
            },
            tools: [CONTROL_CLASSROOM_DEVICES_TOOL],
          },
          callbacks,
        })

        // Send user turn over active WebSocket
        console.log(`[GeminiLive] 🗣️ Sending user prompt: "${commandText}"`)
        liveSession.sendClientContent({
          turns: [
            {
              role: 'user',
              parts: [{ text: commandText }],
            },
          ],
          turnComplete: true,
        })
      } catch (err) {
        clearTimeout(timeout)
        reject(err)
      }
    })
  }

  // --- COMMAND 1: "Turn on the fan" ---
  const result1 = await executeLiveVoiceCommand('Turn on the fan', 1)
  const fanCheck1 = await Device.findOne({ deviceId: 'ESP32-RM302-FAN-01' })
  console.log(`✓ Result 1 Database State: fan=${fanCheck1.state}`)
  if (fanCheck1.state !== 'ON') {
    throw new Error('Command 1 failed: fan state was not ON')
  }
  console.log('✅ PASS: Command 1 ("Turn on the fan" -> fan ON)')

  // --- COMMAND 2: "Turn off the light" ---
  const result2 = await executeLiveVoiceCommand('Turn off the light', 2)
  const lightCheck2 = await Device.findOne({ deviceId: 'ESP32-RM302-LIGHT-01' })
  console.log(`✓ Result 2 Database State: light=${lightCheck2.state}`)
  if (lightCheck2.state !== 'OFF') {
    throw new Error('Command 2 failed: light state was not OFF')
  }
  console.log('✅ PASS: Command 2 ("Turn off the light" -> light OFF)')

  // --- COMMAND 3: "Turn on the fan and light" ---
  const result3 = await executeLiveVoiceCommand('Turn on the fan and light', 3)
  const fanCheck3 = await Device.findOne({ deviceId: 'ESP32-RM302-FAN-01' })
  const lightCheck3 = await Device.findOne({ deviceId: 'ESP32-RM302-LIGHT-01' })
  console.log(`✓ Result 3 Database State: fan=${fanCheck3.state}, light=${lightCheck3.state}`)
  if (fanCheck3.state !== 'ON' || lightCheck3.state !== 'ON') {
    throw new Error('Command 3 failed: fan or light was not ON')
  }
  console.log('✅ PASS: Command 3 ("Turn on the fan and light" -> fan ON, light ON)')

  // --- COMMAND 4: "Turn off everything" ---
  const result4 = await executeLiveVoiceCommand('Turn off everything', 4)
  const fanCheck4 = await Device.findOne({ deviceId: 'ESP32-RM302-FAN-01' })
  const lightCheck4 = await Device.findOne({ deviceId: 'ESP32-RM302-LIGHT-01' })
  const projCheck4 = await Device.findOne({ deviceId: 'ESP32-RM302-PROJ-01' })
  console.log(`✓ Result 4 Database State: fan=${fanCheck4.state}, light=${lightCheck4.state}, projector=${projCheck4.state}`)
  if (fanCheck4.state !== 'OFF' || lightCheck4.state !== 'OFF' || projCheck4.state !== 'OFF') {
    throw new Error('Command 4 failed: everything was not OFF')
  }
  console.log('✅ PASS: Command 4 ("Turn off everything" -> fan OFF, light OFF, projector OFF)')

  // --- COMMAND 5: "Turn on the projector" ---
  const result5 = await executeLiveVoiceCommand('Turn on the projector', 5)
  const projCheck5 = await Device.findOne({ deviceId: 'ESP32-RM302-PROJ-01' })
  console.log(`✓ Result 5 Database State: projector=${projCheck5.state}`)
  if (projCheck5.state !== 'ON') {
    throw new Error('Command 5 failed: projector was not ON')
  }
  console.log('✅ PASS: Command 5 ("Turn on the projector" -> projector ON)')

  // Verify MQTT commands received by ESP32 simulator
  console.log('\n--- 4. Real MQTT & ESP32 Reception Verification ---')
  console.log(`Total MQTT Commands Received by ESP32: ${receivedMqttCommands.length}`)
  if (receivedMqttCommands.length === 0) {
    throw new Error('No MQTT commands were received by the ESP32!')
  }
  console.log('✅ PASS: Real MQTT publish and ESP32 hardware reception fully verified!')

  console.log('\n' + '='.repeat(75))
  console.log('🎉 ALL 5 REAL GEMINI LIVE SPOKEN COMMANDS TESTED AND VERIFIED!')
  console.log('='.repeat(75))

  esp32Mqtt.end(true)
  await mongoose.disconnect()
}

runRealGeminiLiveE2ETest().catch((err) => {
  console.error('\n❌ E2E Live Test Failed:', err)
  process.exit(1)
})
