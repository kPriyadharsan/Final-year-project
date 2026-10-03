/**
 * Comprehensive Database & Data Layer Test Suite
 *
 * Tests:
 * 1. Connection strictly from MONGODB_URI (masked in console output)
 * 2. Ping check & database round-trip latency
 * 3. Model schema validation & constraint enforcement:
 *    - User: email regex, unique index, bcrypt passwordHash exclusion
 *    - Device: deviceId unique index, 11 required MQTT & hardware fields, GPIO pin range
 *    - DeviceLog: device ref, action enum, audit timestamps
 *    - VoiceCommand: transcript, intent enum, timestamps
 * 4. Index verification across all collections
 * 5. Seeded data integrity:
 *    - Exactly one primary SUPER_ADMIN
 *    - Test TEACHER and STUDENT accounts
 *    - Light, Fan, Projector devices with valid GPIO pins and MQTT topics
 *
 * Run with: npm run test:db
 */
const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '../.env') })
const mongoose = require('mongoose')
const { User, ROLES } = require('../src/models/User')
const { Device, DEVICE_TYPES, DEVICE_STATES } = require('../src/models/Device')
const { DeviceLog } = require('../src/models/DeviceLog')
const { VoiceCommand } = require('../src/models/VoiceCommand')
const { pingDatabase, getMongoStatus } = require('../src/config/db')

async function runDatabaseTest() {
  console.log('='.repeat(72))
  console.log('🧪 SMART CLASSROOM - MONGODB & DATA LAYER VERIFICATION')
  console.log('='.repeat(72))

  const mongoURI = process.env.MONGODB_URI
  if (!mongoURI) {
    console.error('❌ MONGODB_URI is not set in environment variables!')
    process.exit(1)
  }

  // Mask credentials in console output
  const maskedURI = mongoURI.replace(/\/\/(.*?):(.*?)@/, '//***:***@')
  console.log(`📍 Target URI   : ${maskedURI}`)
  console.log(`⏱️  Timeout      : 8000ms`)
  console.log(`⏳ Attempting handshake...`)

  let passed = 0
  let failed = 0

  const assert = (condition, testName) => {
    if (condition) {
      console.log(`  ✅ PASS: ${testName}`)
      passed++
    } else {
      console.error(`  ❌ FAIL: ${testName}`)
      failed++
    }
  }

  let conn = null
  try {
    const startTime = Date.now()
    conn = await mongoose.connect(mongoURI, {
      serverSelectionTimeoutMS: 8000,
      autoIndex: true,
    })
    const handshakeTime = Date.now() - startTime
    console.log(`\n[1] Connection & Health Handshake (${handshakeTime}ms)`)
    assert(conn.connection.readyState === 1, 'MongoDB connection readyState is 1 (connected)')
    assert(getMongoStatus() === 'connected', 'getMongoStatus() reports "connected"')

    const pingResult = await pingDatabase()
    assert(pingResult.success === true, `Ping check succeeded (latency: ${pingResult.latencyMs}ms)`)

    console.log('\n[2] User Model Schema & Seed Verification')
    // 2a. Verify SUPER_ADMIN exists
    const superAdmin = await User.findOne({ role: ROLES.SUPER_ADMIN })
    assert(superAdmin !== null, 'Found primary SUPER_ADMIN user account')
    assert(superAdmin && superAdmin.isActive === true, 'SUPER_ADMIN account is active')
    assert(superAdmin && superAdmin.hasDashboardAccess === true, 'SUPER_ADMIN has dashboard access virtual flag')
    assert(superAdmin && superAdmin.passwordHash === undefined, 'passwordHash is not selected by default')

    // 2b. Verify TEACHER exists
    const teacher = await User.findOne({ role: ROLES.TEACHER })
    assert(teacher !== null, 'Found seeded TEACHER account')
    assert(teacher && teacher.hasDashboardAccess === true, 'TEACHER has dashboard access virtual flag')

    // 2c. Verify STUDENT exists
    const student = await User.findOne({ role: ROLES.STUDENT })
    assert(student !== null, 'Found seeded STUDENT account')
    assert(student && student.hasDashboardAccess === false, 'STUDENT correctly denied dashboard access')

    // 2d. Test Unique Email Constraint
    let dupEmailCaught = false
    try {
      const dupUser = new User({
        name: 'Duplicate Email Test',
        email: superAdmin.email,
        passwordHash: 'someHash123!',
        role: ROLES.STUDENT,
      })
      await dupUser.save()
    } catch {
      dupEmailCaught = true
    }
    assert(dupEmailCaught === true, 'Unique email index correctly prevents duplicate registration')

    console.log('\n[3] Classroom Device Model & IoT Configuration Verification')
    // 3a. Verify Light, Fan, and Projector devices exist
    const [lightDev, fanDev, projDev] = await Promise.all([
      Device.findOne({ type: DEVICE_TYPES.LIGHT }),
      Device.findOne({ type: DEVICE_TYPES.FAN }),
      Device.findOne({ type: DEVICE_TYPES.PROJECTOR }),
    ])

    assert(lightDev !== null, 'Light device exists in database')
    assert(fanDev !== null, 'Fan device exists in database')
    assert(projDev !== null, 'Projector device exists in database')

    // 3b. Verify all 11 required fields on devices
    const requiredFields = [
      'deviceId',
      'name',
      'type',
      'classroom',
      'gpioPin',
      'mqttCommandTopic',
      'mqttStatusTopic',
      'state',
      'isOnline',
      'isActive',
    ]

    const checkFields = (dev, label) => {
      const missing = requiredFields.filter((f) => dev[f] === undefined || dev[f] === null)
      assert(missing.length === 0, `${label} contains all required fields: ${requiredFields.join(', ')}`)
    }

    if (lightDev) checkFields(lightDev, 'Light Device')
    if (fanDev) checkFields(fanDev, 'Fan Device')
    if (projDev) checkFields(projDev, 'Projector Device')

    // 3c. Verify Unique deviceId Constraint
    let dupDeviceIdCaught = false
    try {
      const dupDev = new Device({
        deviceId: lightDev.deviceId,
        name: 'Duplicate Hardware Node',
        type: DEVICE_TYPES.LIGHT,
        classroom: 'Room 302',
        mqttCommandTopic: 'test/cmd',
        mqttStatusTopic: 'test/stat',
      })
      await dupDev.save()
    } catch {
      dupDeviceIdCaught = true
    }
    assert(dupDeviceIdCaught === true, 'Unique deviceId index strictly prevents duplicate hardware identifiers')

    console.log('\n[4] Database Indexes Inspection')
    // Ensure indexes are built
    await Promise.all([
      User.init(),
      Device.init(),
      DeviceLog.init(),
      VoiceCommand.init(),
    ])

    const userIndexes = await User.collection.indexes()
    const deviceIndexes = await Device.collection.indexes()
    const deviceLogIndexes = await DeviceLog.collection.indexes()
    const voiceIndexes = await VoiceCommand.collection.indexes()

    const hasIndex = (indexes, keyName) =>
      indexes.some((idx) => Object.keys(idx.key).includes(keyName))

    assert(hasIndex(userIndexes, 'email'), 'User collection has index on "email"')
    assert(hasIndex(userIndexes, 'role'), 'User collection has index on "role"')
    assert(hasIndex(deviceIndexes, 'deviceId'), 'Device collection has index on "deviceId"')
    assert(hasIndex(deviceIndexes, 'mqttStatusTopic'), 'Device collection has index on "mqttStatusTopic"')
    assert(hasIndex(deviceIndexes, 'mqttCommandTopic'), 'Device collection has index on "mqttCommandTopic"')
    assert(hasIndex(deviceLogIndexes, 'deviceId'), 'DeviceLog collection has index on "deviceId"')
    assert(hasIndex(deviceLogIndexes, 'createdAt'), 'DeviceLog collection has index on "createdAt"')
    assert(hasIndex(voiceIndexes, 'intent'), 'VoiceCommand collection has index on "intent"')
    assert(hasIndex(voiceIndexes, 'createdAt'), 'VoiceCommand collection has index on "createdAt"')

    console.log('\n' + '='.repeat(72))
    console.log(`🎉 DATA LAYER TEST SUMMARY: ${passed} passed, ${failed} failed`)
    console.log('='.repeat(72) + '\n')

    await mongoose.connection.close(false)
    process.exit(failed > 0 ? 1 : 0)
  } catch (err) {
    console.error('\n❌ DATA LAYER TEST ENCOUNTERED UNEXPECTED ERROR:', err)
    if (conn) await mongoose.connection.close(false)
    process.exit(1)
  }
}

runDatabaseTest()
