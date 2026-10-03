/**
 * test-device-control-flow.js
 *
 * Verifies the complete end-to-end device command API flow used by DeviceControlPage:
 * - Queries room devices (Node + Light, Fan, Projector)
 * - Tests command execution for Light, Fan, Projector
 * - Tests node offline command rejection
 * - Resets all devices to safe baseline
 */

const mongoose = require('mongoose')
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') })
const { Device } = require('../src/models/Device')
const { User, ROLES } = require('../src/models/User')
const { generateToken } = require('../src/utils/jwt.util')
const { connectDB, closeDB } = require('../src/config/db')

const API_BASE = 'http://localhost:5000'

async function run() {
  console.log('======================================================================')
  console.log('🧪 TESTING DIGITAL DEVICE CONTROL BACKEND API FLOW')
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
    // 1. Generate auth token
    const admin = await User.findOne({ role: ROLES.SUPER_ADMIN })
    assert(admin !== null, 'Super Admin user found in database')
    const token = generateToken({ id: admin._id.toString(), role: admin.role })
    assert(Boolean(token), 'Generated valid Super Admin JWT')

    // 2. Fetch Room 302 devices as done by DeviceControlPage
    console.log('\n--- 1. Fetch Room 302 Devices ---')
    const fetchRes = await fetch(`${API_BASE}/api/devices?classroom=Room%20302`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    assert(fetchRes.status === 200, 'GET /api/devices?classroom=Room 302 returned 200')
    const data = await fetchRes.json()

    assert(data.status === 'success', 'Response status is "success"')
    assert(data.nodeCount === 1, `1 physical controller node found (actual: ${data.nodeCount})`)
    assert(data.channelCount === 3, `3 relay channels found (actual: ${data.channelCount})`)

    const node = data.nodes[0]
    assert(node.deviceId === 'ESP32-RM302-01', `Node deviceId is ESP32-RM302-01 (actual: ${node.deviceId})`)

    const channelTypes = data.channels.map((c) => c.type).sort()
    assert(
      JSON.stringify(channelTypes) === JSON.stringify(['FAN', 'LIGHT', 'PROJECTOR']),
      `Channels contain FAN, LIGHT, PROJECTOR (actual: ${channelTypes.join(', ')})`
    )

    // 3. Test Command Execution for each channel
    console.log('\n--- 2. Command Execution via POST /api/devices/:id/command ---')

    // Make sure node is online
    await Device.updateOne({ deviceId: 'ESP32-RM302-01' }, { $set: { isOnline: true } })

    for (const ch of data.channels) {
      console.log(`\n  Testing command for ${ch.name} (${ch.type} on GPIO ${ch.gpioPin})...`)

      // Test Turn ON
      const onRes = await fetch(`${API_BASE}/api/devices/${ch.deviceId}/command`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'ON' }),
      })
      const onData = await onRes.json()
      if (onRes.status !== 200) {
        console.error('Command failed status:', onRes.status, onData)
      }
      assert(onRes.status === 200, `POST /api/devices/${ch.deviceId}/command (ON) returned 200`)
      assert(onData.status === 'success', `Response status is "success" (message: ${onData.message})`)

      // Verify DB state updated
      const updatedOn = await Device.findOne({ deviceId: ch.deviceId })
      assert(updatedOn.state === 'ON', `${ch.name} state in MongoDB is ON`)

      // Test Turn OFF
      const offRes = await fetch(`${API_BASE}/api/devices/${ch.deviceId}/command`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'OFF' }),
      })
      assert(offRes.status === 200, `POST /api/devices/${ch.deviceId}/command (OFF) returned 200`)
      const offData = await offRes.json()
      assert(offData.status === 'success', `Response status is "success" (message: ${offData.message})`)

      const updatedOff = await Device.findOne({ deviceId: ch.deviceId })
      assert(updatedOff.state === 'OFF', `${ch.name} state in MongoDB is OFF`)
    }

    // 4. Test Controller Node Command Protection
    console.log('\n--- 3. Direct Controller Node Command Protection ---')
    const nodeCmdRes = await fetch(`${API_BASE}/api/devices/ESP32-RM302-01/command`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'ON' }),
    })
    const nodeCmdData = await nodeCmdRes.json()
    assert(
      nodeCmdRes.status === 400 && nodeCmdData.code === 'CANNOT_COMMAND_NODE',
      `Direct command on controller node correctly rejected with CANNOT_COMMAND_NODE`
    )

    // 5. Test Command Rejection when Controller Node is Offline
    console.log('\n--- 4. Command Rejection when Controller Node is Offline ---')
    await Device.updateOne({ deviceId: 'ESP32-RM302-01' }, { $set: { isOnline: false } })

    const offlineCmdRes = await fetch(`${API_BASE}/api/devices/ESP32-RM302-LIGHT-01/command`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'ON' }),
    })
    const offlineCmdData = await offlineCmdRes.json()
    assert(
      offlineCmdRes.status === 503 && offlineCmdData.code === 'DEVICE_OFFLINE',
      `Command correctly rejected when parent controller node is offline (code: ${offlineCmdData.code})`
    )

    // Restore controller node to online
    await Device.updateOne({ deviceId: 'ESP32-RM302-01' }, { $set: { isOnline: true } })
    console.log('  Restored controller node to online baseline.')

    console.log('\n======================================================================')
    console.log(`🎉 ALL ${passed}/${total} DEVICE CONTROL FLOW TESTS PASSED!`)
    console.log('======================================================================\n')
  } catch (err) {
    console.error('Test execution failed:', err)
  } finally {
    await closeDB()
  }
}

run()
