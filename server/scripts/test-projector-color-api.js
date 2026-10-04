require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') })
const mongoose = require('mongoose')
const { connectDB, closeDB } = require('../src/config/db')
const { User, ROLES } = require('../src/models/User')
const { Device, DEVICE_TYPES } = require('../src/models/Device')
const { generateToken } = require('../src/utils/jwt.util')

const API_BASE = 'http://localhost:5000'

async function run() {
  console.log('======================================================================')
  console.log('🧪 TESTING PROJECTOR RGB COLOR API VIA LIVE SERVER (PORT 5000)')
  console.log('======================================================================\n')

  await connectDB()

  let total = 0
  let passed = 0

  function assert(condition, message) {
    total++
    if (condition) {
      passed++
      console.log(`  ✅ [PASS] ${message}`)
    } else {
      console.error(`  ❌ [FAIL] ${message}`)
      throw new Error(`Assertion failed: ${message}`)
    }
  }

  try {
    const admin = await User.findOne({ role: ROLES.SUPER_ADMIN })
    assert(admin !== null, 'Super Admin user found in database')
    const token = generateToken({ id: admin._id.toString(), role: admin.role })
    assert(Boolean(token), 'Generated valid Super Admin JWT')

    // Find projector in DB
    const projector = await Device.findOne({ type: DEVICE_TYPES.PROJECTOR })
    assert(projector !== null, 'Found projector device in database')
    console.log(`  Target Projector: [${projector.deviceId}] in ${projector.classroom}`)

    // Ensure controller node is online
    const node = await Device.findOne({ deviceId: 'ESP32-RM302-01' })
    if (node) {
      node.isOnline = true
      await node.save()
    }

    // Test 1: Send RGB Color Command via POST /api/devices/:id/color
    console.log('\n--- 1. POST /api/devices/:id/color (Purple ON) ---')
    const colorPayload1 = {
      power: 'ON',
      color: { r: 255, g: 0, b: 255 },
    }
    const res1 = await fetch(`${API_BASE}/api/devices/${projector.deviceId}/color`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(colorPayload1),
    })

    assert(res1.status === 200, `POST /api/devices/${projector.deviceId}/color returned 200 (actual: ${res1.status})`)
    const data1 = await res1.json()
    assert(data1.status === 'success', 'Response status is "success"')
    assert(data1.data.device.colorPower === 'ON', 'Device colorPower is ON')
    assert(data1.data.device.color.r === 255 && data1.data.device.color.g === 0 && data1.data.device.color.b === 255, 'Device color is { r: 255, g: 0, b: 255 }')
    assert(data1.data.mqtt.topic === 'smartclassroom/room302/projector/color/command', 'MQTT topic matches smartclassroom/room302/projector/color/command')
    assert(data1.data.mqtt.payload.power === 'ON', 'MQTT payload power is "ON"')
    assert(data1.data.mqtt.payload.color.r === 255 && data1.data.mqtt.payload.color.color !== undefined || data1.data.mqtt.payload.color.b === 255, 'MQTT payload color is { r: 255, g: 0, b: 255 }')

    // Test 2: Check MongoDB state after update
    console.log('\n--- 2. Verify MongoDB Persistence ---')
    const dbProj1 = await Device.findById(projector._id)
    assert(dbProj1.colorPower === 'ON', 'MongoDB colorPower persisted as ON')
    assert(dbProj1.color.r === 255 && dbProj1.color.g === 0 && dbProj1.color.b === 255, 'MongoDB color persisted as { r: 255, g: 0, b: 255 }')

    // Test 3: Send Lighting Power OFF
    console.log('\n--- 3. POST /api/devices/:id/color (Lighting Power OFF) ---')
    const colorPayload2 = {
      power: 'OFF',
      color: { r: 255, g: 0, b: 255 },
    }
    const res2 = await fetch(`${API_BASE}/api/devices/${projector.deviceId}/color`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(colorPayload2),
    })
    assert(res2.status === 200, `POST color returned 200 (actual: ${res2.status})`)
    const data2 = await res2.json()
    assert(data2.data.device.colorPower === 'OFF', 'Device colorPower updated to OFF')

    // Test 4: Support action: 'COLOR' through standard command endpoint
    console.log('\n--- 4. POST /api/devices/:id/command with action: "COLOR" ---')
    const res3 = await fetch(`${API_BASE}/api/devices/${projector.deviceId}/command`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'COLOR',
        power: 'ON',
        color: { r: 0, g: 255, b: 255 },
      }),
    })
    assert(res3.status === 200, `POST /command with action: "COLOR" returned 200`)
    const data3 = await res3.json()
    assert(data3.data.device.colorPower === 'ON', 'Device colorPower is ON via /command')
    assert(data3.data.device.color.g === 255 && data3.data.device.color.b === 255, 'Device color is Cyan via /command')

    // Test 5: Verify existing Relay ON/OFF is NOT broken
    console.log('\n--- 5. Verify Projector Main Relay ON/OFF Remains Fully Functional ---')
    const relayRes = await fetch(`${API_BASE}/api/devices/${projector.deviceId}/command`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'OFF' }),
    })
    assert(relayRes.status === 200, 'Projector relay command returned 200')
    const relayData = await relayRes.json()
    assert(relayData.data.device.state === 'OFF', 'Projector relay state is OFF')
    assert(relayData.data.mqtt.topic === 'smartclassroom/room302/relay/projector/command', 'Relay command topic untouched: smartclassroom/room302/relay/projector/command')

    // Test 6: Controller Node Offline Guard for Color
    console.log('\n--- 6. Offline Node Guard for RGB Control ---')
    if (node) {
      node.isOnline = false
      await node.save()

      const offlineRes = await fetch(`${API_BASE}/api/devices/${projector.deviceId}/color`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ power: 'ON', color: { r: 255, g: 0, b: 0 } }),
      })
      assert(offlineRes.status === 503, `Offline request returned 503 (actual: ${offlineRes.status})`)
      const offlineData = await offlineRes.json()
      assert(offlineData.code === 'DEVICE_OFFLINE', 'Failure code is DEVICE_OFFLINE')
      assert(offlineData.message === 'Command could not be delivered.', 'Message is "Command could not be delivered."')

      // Restore node
      node.isOnline = true
      await node.save()
    }

    console.log(`\n======================================================================`)
    console.log(`🎉 ALL ${passed}/${total} PROJECTOR RGB API TESTS PASSED!`)
    console.log(`======================================================================\n`)
  } finally {
    await closeDB()
  }
}

run().catch((err) => {
  console.error('Test execution failed:', err)
  process.exit(1)
})
