/**
 * Verification Test for IoT Controller Node vs Control Channel Architecture
 *
 * Validates:
 * 1. Database schema: entityType/deviceCategory ('NODE' vs 'CHANNEL') and nodeId
 * 2. REST API GET /api/devices: separates nodes (1) and channels (3)
 * 3. REST API GET /api/devices?category=NODE and ?category=CHANNEL filtering
 * 4. Controller node command protection: CANNOT_COMMAND_NODE
 * 5. Admin dashboard telemetry: totalNodes (1), totalChannels (3), classroom relays (3)
 * 6. System health status: esp32.totalNodes (1) and esp32.totalChannels (3)
 */

const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '../.env') })
const mongoose = require('mongoose')
const { Device, DEVICE_TYPES, DEVICE_CATEGORIES, DEVICE_STATES } = require('../src/models/Device')
const { User, ROLES } = require('../src/models/User')
const { generateToken } = require('../src/utils/jwt.util')
const { executeDeviceCommand } = require('../src/services/deviceCommand.service')

const API_BASE = `http://localhost:${process.env.PORT || 5000}`

async function runTests() {
  console.log('\n======================================================================')
  console.log('🧪 IOT CONTROLLER NODE VS CONTROL CHANNEL ARCHITECTURE VERIFICATION')
  console.log('======================================================================\n')

  let passed = 0
  let total = 0

  function assert(condition, message) {
    total++
    if (condition) {
      console.log(`✅ PASS: ${message}`)
      passed++
    } else {
      console.error(`❌ FAIL: ${message}`)
      throw new Error(`Assertion failed: ${message}`)
    }
  }

  // 1. Connect to MongoDB
  console.log('--- 1. MongoDB Schema & Records Verification ---')
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 })
  assert(mongoose.connection.readyState === 1, 'MongoDB connection established')

  const controllerNode = await Device.findOne({ deviceId: 'ESP32-RM302-01' })
  assert(controllerNode !== null, 'Found ESP32-RM302-01 controller node')
  assert(controllerNode.entityType === 'NODE', `Controller entityType is "NODE" (actual: ${controllerNode.entityType})`)
  assert(controllerNode.deviceCategory === 'NODE', `Controller deviceCategory is "NODE" (actual: ${controllerNode.deviceCategory})`)

  const channels = await Device.find({ classroom: 'Room 302', entityType: 'CHANNEL' })
  assert(channels.length === 3, `Found exactly 3 relay channels for Room 302 (actual: ${channels.length})`)

  for (const ch of channels) {
    assert(ch.nodeId === 'ESP32-RM302-01', `Channel [${ch.deviceId}] points to nodeId "ESP32-RM302-01"`)
    assert(['LIGHT', 'FAN', 'PROJECTOR'].includes(ch.type), `Channel [${ch.deviceId}] type is valid: ${ch.type}`)
  }

  // 2. Prepare auth tokens
  console.log('\n--- 2. Auth Tokens Preparation ---')
  let admin = await User.findOne({ role: ROLES.SUPER_ADMIN })
  if (!admin) {
    throw new Error('Super admin user not found.')
  }
  const adminToken = generateToken({ id: admin._id.toString(), role: admin.role })
  assert(Boolean(adminToken), 'Generated valid Super Admin JWT')

  // 3. Test GET /api/devices separating nodes and channels
  console.log('\n--- 3. REST API GET /api/devices (Separate Nodes and Channels) ---')
  const devRes = await fetch(`${API_BASE}/api/devices?classroom=Room 302`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  assert(devRes.status === 200, `GET /api/devices returned 200`)
  const devData = await devRes.json()
  assert(devData.status === 'success', 'Response status is "success"')
  assert(devData.nodeCount === 1, `nodeCount is 1 (actual: ${devData.nodeCount})`)
  assert(devData.channelCount === 3, `channelCount is 3 (actual: ${devData.channelCount})`)
  assert(devData.nodes?.length === 1, `nodes array length is 1`)
  assert(devData.nodes[0].deviceId === 'ESP32-RM302-01', `nodes[0] is ESP32-RM302-01`)
  assert(devData.channels?.length === 3, `channels array length is 3`)

  // 4. Test category filtering: ?category=NODE and ?category=CHANNEL
  console.log('\n--- 4. REST API GET /api/devices Category Filtering ---')
  const nodeFilterRes = await fetch(`${API_BASE}/api/devices?classroom=Room 302&category=NODE`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  const nodeFilterData = await nodeFilterRes.json()
  assert(nodeFilterData.count === 1, `Category NODE filter returned 1 device (actual: ${nodeFilterData.count})`)
  assert(nodeFilterData.devices[0].deviceId === 'ESP32-RM302-01', `Filtered node is ESP32-RM302-01`)

  const chFilterRes = await fetch(`${API_BASE}/api/devices?classroom=Room 302&category=CHANNEL`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  const chFilterData = await chFilterRes.json()
  assert(chFilterData.count === 3, `Category CHANNEL filter returned 3 channels (actual: ${chFilterData.count})`)

  // 5. Test Controller Node Command Protection
  console.log('\n--- 5. Controller Node Command Protection ---')
  const nodeCmdResult = await executeDeviceCommand({
    deviceId: 'ESP32-RM302-01',
    action: 'ON',
    user: admin,
    source: 'REST_API',
  })
  assert(nodeCmdResult.success === false, 'Direct command on controller node was rejected')
  assert(nodeCmdResult.code === 'CANNOT_COMMAND_NODE', `Error code is CANNOT_COMMAND_NODE (actual: ${nodeCmdResult.code})`)

  // 6. Test Admin Dashboard Telemetry
  console.log('\n--- 6. Super Admin Dashboard Telemetry ---')
  const dashRes = await fetch(`${API_BASE}/api/admin/dashboard`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  assert(dashRes.status === 200, 'GET /api/admin/dashboard returned 200')
  const dashData = await dashRes.json()
  assert(dashData.metrics.totalNodes === 1, `metrics.totalNodes is 1 (actual: ${dashData.metrics.totalNodes})`)
  assert(dashData.metrics.totalChannels === 3, `metrics.totalChannels is 3 (actual: ${dashData.metrics.totalChannels})`)
  assert(dashData.metrics.totalDevices === 1, `metrics.totalDevices (Physical IoT Nodes) is 1 (actual: ${dashData.metrics.totalDevices})`)
  const room302Class = dashData.classrooms?.find((c) => c.name.toLowerCase().includes('302'))
  assert(room302Class !== undefined, 'Found Room 302 in classrooms array')
  assert(room302Class.nodes === 1, `Room 302 nodes count is 1 (actual: ${room302Class.nodes})`)
  assert(room302Class.relays === 3, `Room 302 relays count is 3 (actual: ${room302Class.relays})`)

  // 7. Test System Status
  console.log('\n--- 7. System Health Status Matrix ---')
  const sysRes = await fetch(`${API_BASE}/api/system/status`)
  assert(sysRes.status === 200, 'GET /api/system/status returned 200')
  const sysData = await sysRes.json()
  const esp32Service = sysData.services?.esp32
  assert(esp32Service !== undefined, 'esp32 service found in system status')
  assert(esp32Service.totalNodes === 1, `esp32.totalNodes is 1 (actual: ${esp32Service.totalNodes})`)
  assert(esp32Service.totalChannels === 3, `esp32.totalChannels is 3 (actual: ${esp32Service.totalChannels})`)

  await mongoose.disconnect()

  console.log('\n======================================================================')
  console.log(`🎉 ALL ${passed}/${total} ARCHITECTURE VERIFICATION TESTS PASSED SUCCESSFULLY!`)
  console.log('======================================================================\n')
}

runTests().catch((err) => {
  console.error('\n❌ Test execution failed:', err)
  process.exit(1)
})
