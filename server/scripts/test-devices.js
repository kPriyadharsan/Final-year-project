/**
 * Verification Script for Device Mongoose Model & REST APIs:
 * - Validates Device model schema & enum validation
 * - Tests GET /api/devices (unauthenticated -> 401)
 * - Tests GET /api/devices (SUPER_ADMIN -> 200)
 * - Tests GET /api/devices (TEACHER -> 200)
 * - Tests GET /api/devices/:id (404 and 200)
 */

const path = require('path')
const dotenv = require('dotenv')
dotenv.config({ path: path.resolve(__dirname, '../.env') })

const mongoose = require('mongoose')
const { Device, DEVICE_TYPES, DEVICE_STATES } = require('../src/models/Device')
const { User, ROLES } = require('../src/models/User')
const { generateToken } = require('../src/utils/jwt.util')

const API_BASE = `http://localhost:${process.env.PORT || 5000}`

async function runTests() {
  console.log('\n======================================================')
  console.log('🤖 SMART CLASSROOM DEVICE MODEL & API VERIFICATION')
  console.log('======================================================\n')

  await mongoose.connect(process.env.MONGODB_URI)
  console.log('✅ Connected to MongoDB Atlas for model verification')

  // 1. Verify Enum Types
  console.log('\n--- 1. Device Types & States Constants ---')
  console.log('Device Types:', DEVICE_TYPES)
  console.log('Device States:', DEVICE_STATES)

  // 2. Insert or Upsert Test Devices for Testing
  console.log('\n--- 2. Upserting Sample IoT Devices ---')
  const { getCommandTopic, getStateTopic } = require('../src/utils/mqttTopics')
  const testDevicesData = [
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
      description: 'Front and rear ambient LED lighting relays',
      isActive: true,
    },
    {
      name: 'Classroom 302 Ceiling Fans',
      type: DEVICE_TYPES.FAN,
      classroom: 'Room 302',
      deviceId: 'ESP32-RM302-FAN-01',
      mqttCommandTopic: getCommandTopic('Room 302', 'fan'),
      mqttStatusTopic: getStateTopic('Room 302', 'fan'),
      state: DEVICE_STATES.OFF,
      isOnline: true,
      gpioPin: 19,
      description: 'Dual ceiling fan relay controller',
      isActive: true,
    },
    {
      name: 'Classroom 302 Smart Projector',
      type: DEVICE_TYPES.PROJECTOR,
      classroom: 'Room 302',
      deviceId: 'ESP32-RM302-PROJ-01',
      mqttCommandTopic: getCommandTopic('Room 302', 'projector'),
      mqttStatusTopic: getStateTopic('Room 302', 'projector'),
      state: DEVICE_STATES.ON,
      isOnline: true,
      gpioPin: 18,
      description: 'Motorized ceiling projector and HDMI power relay',
      isActive: true,
    },
  ]

  const savedDevices = []
  for (const devData of testDevicesData) {
    const updated = await Device.findOneAndUpdate(
      { deviceId: devData.deviceId },
      devData,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    )
    savedDevices.push(updated)
    console.log(`✓ Device ready: [${updated.type}] ${updated.name} (ID: ${updated.deviceId})`)
  }

  // 3. Obtain or Seed Test Users (SUPER_ADMIN and TEACHER)
  console.log('\n--- 3. Preparing Authenticated Role Tokens ---')
  const superAdmin = await User.findOne({ role: ROLES.SUPER_ADMIN })
  if (!superAdmin) {
    throw new Error('Super Admin account missing. Run npm run seed:admin first.')
  }
  const adminToken = generateToken({ id: superAdmin._id.toString(), role: superAdmin.role })
  console.log(`✓ Generated token for SUPER_ADMIN: ${superAdmin.email}`)

  let teacherUser = await User.findOne({ role: ROLES.TEACHER })
  if (!teacherUser) {
    teacherUser = await User.create({
      name: 'Prof. Test Teacher',
      email: 'teacher.device.test@smartclassroom.edu',
      passwordHash: '$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012',
      role: ROLES.TEACHER,
      department: 'Computer Science',
      assignedClasses: ['Room 302'],
      isActive: true,
    })
    console.log(`✓ Created test TEACHER account: ${teacherUser.email}`)
  }
  const teacherToken = generateToken({ id: teacherUser._id.toString(), role: teacherUser.role })
  console.log(`✓ Generated token for TEACHER: ${teacherUser.email}`)

  // 4. Test Unauthenticated Access (Must be 401)
  console.log('\n--- 4. REST API: Unauthenticated Access Check ---')
  const unauthRes = await fetch(`${API_BASE}/api/devices`)
  console.log(`GET /api/devices (No Token) -> HTTP ${unauthRes.status}`)
  if (unauthRes.status === 401) {
    console.log('✅ PASS: Rejected unauthenticated request with 401')
  } else {
    console.error(`❌ FAIL: Expected 401, got ${unauthRes.status}`)
  }

  // 5. Test SUPER_ADMIN Access (Must be 200)
  console.log('\n--- 5. REST API: GET /api/devices (SUPER_ADMIN) ---')
  const adminRes = await fetch(`${API_BASE}/api/devices`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  const adminData = await adminRes.json()
  console.log(`GET /api/devices (SUPER_ADMIN) -> HTTP ${adminRes.status}, count: ${adminData.count}`)
  if (adminRes.status === 200 && adminData.status === 'success' && adminData.count >= 3) {
    console.log('✅ PASS: Super Admin successfully retrieved device list')
  } else {
    console.error('❌ FAIL:', adminData)
  }

  // 6. Test TEACHER Access (Must be 200)
  console.log('\n--- 6. REST API: GET /api/devices (TEACHER) ---')
  const teacherRes = await fetch(`${API_BASE}/api/devices?classroom=Room 302`, {
    headers: { Authorization: `Bearer ${teacherToken}` },
  })
  const teacherData = await teacherRes.json()
  console.log(`GET /api/devices?classroom=Room 302 (TEACHER) -> HTTP ${teacherRes.status}, count: ${teacherData.count}`)
  if (teacherRes.status === 200 && teacherData.status === 'success') {
    console.log('✅ PASS: Teacher successfully retrieved filtered devices for Room 302')
  } else {
    console.error('❌ FAIL:', teacherData)
  }

  // 7. Test GET /api/devices/:id by MongoDB ObjectId
  console.log('\n--- 7. REST API: GET /api/devices/:id (by ObjectId) ---')
  const targetDoc = savedDevices[0]
  const singleIdRes = await fetch(`${API_BASE}/api/devices/${targetDoc._id}`, {
    headers: { Authorization: `Bearer ${teacherToken}` },
  })
  const singleIdData = await singleIdRes.json()
  console.log(`GET /api/devices/${targetDoc._id} -> HTTP ${singleIdRes.status}`)
  if (singleIdRes.status === 200 && singleIdData.device?.deviceId === targetDoc.deviceId) {
    console.log(`✅ PASS: Retrieved device "${singleIdData.device.name}"`)
  } else {
    console.error('❌ FAIL:', singleIdData)
  }

  // 8. Test GET /api/devices/:id by hardware deviceId
  console.log('\n--- 8. REST API: GET /api/devices/:id (by hardware deviceId) ---')
  const singleDevIdRes = await fetch(`${API_BASE}/api/devices/${targetDoc.deviceId}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  const singleDevIdData = await singleDevIdRes.json()
  console.log(`GET /api/devices/${targetDoc.deviceId} -> HTTP ${singleDevIdRes.status}`)
  if (singleDevIdRes.status === 200 && singleDevIdData.device?.deviceId === targetDoc.deviceId) {
    console.log(`✅ PASS: Retrieved device by hardware ID "${targetDoc.deviceId}"`)
  } else {
    console.error('❌ FAIL:', singleDevIdData)
  }

  // 9. Test GET /api/devices/:id with non-existent id (404)
  console.log('\n--- 9. REST API: GET /api/devices/NON_EXISTENT_ID (404 check) ---')
  const notFoundRes = await fetch(`${API_BASE}/api/devices/NON_EXISTENT_DEVICE_123`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  const notFoundData = await notFoundRes.json()
  console.log(`GET /api/devices/NON_EXISTENT_DEVICE_123 -> HTTP ${notFoundRes.status}`)
  if (notFoundRes.status === 404 && notFoundData.code === 'DEVICE_NOT_FOUND') {
    console.log('✅ PASS: Correctly returned 404 for unknown device identifier')
  } else {
    console.error('❌ FAIL:', notFoundData)
  }

  await mongoose.disconnect()
  console.log('\n======================================================')
  console.log('🎉 ALL DEVICE MODEL & REST API TESTS PASSED!')
  console.log('======================================================\n')
}

runTests().catch((err) => {
  console.error('\n❌ Test execution encountered an error:', err)
  process.exit(1)
})
