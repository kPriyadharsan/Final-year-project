/**
 * Idempotent Device Seed Script for Smart Classroom System
 * Seeds standard classroom IoT appliances (Light, Fan, Projector)
 * matching ESP32 firmware GPIOs and MQTT topics.
 *
 * All parameters are environment-configurable with safe development fallbacks.
 *
 * Usage:
 *   node scripts/seed-devices.js (or npm run seed:devices)
 */
const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '../.env') })
const mongoose = require('mongoose')
const { Device, DEVICE_TYPES, DEVICE_CATEGORIES, DEVICE_STATES } = require('../src/models/Device')
const { getCommandTopic, getStateTopic, getAvailabilityTopic } = require('../src/utils/mqttTopics')

async function seedDevices() {
  console.log('='.repeat(70))
  console.log('🌱 Smart Classroom - Hardware Devices Seed Utility')
  console.log('='.repeat(70))

  const mongoURI = process.env.MONGODB_URI
  if (!mongoURI) {
    console.error('❌ CONFIGURATION ERROR: MONGODB_URI is not set in environment.')
    process.exit(1)
  }

  const classroom = process.env.SEED_CLASSROOM || 'Room 302'
  const controllerId = process.env.SEED_CONTROLLER_ID || 'ESP32-RM302-01'

  const seedDevicesList = [
    {
      deviceId: controllerId,
      name: `${classroom} ESP32 Controller Node`,
      type: DEVICE_TYPES.OTHER,
      deviceCategory: DEVICE_CATEGORIES.NODE,
      entityType: DEVICE_CATEGORIES.NODE,
      nodeId: controllerId,
      classroom,
      gpioPin: 2,
      mqttCommandTopic: getAvailabilityTopic(classroom),
      mqttStatusTopic: getAvailabilityTopic(classroom),
      state: DEVICE_STATES.OFF,
      isOnline: false,
      lastSeenAt: null,
      isActive: true,
      description: 'ESP32 central microcontroller node providing heartbeat, LWT, and live availability',
    },
    {
      deviceId: process.env.SEED_LIGHT_ID || 'ESP32-RM302-LIGHT-01',
      name: `${classroom} Main Lights`,
      type: DEVICE_TYPES.LIGHT,
      deviceCategory: DEVICE_CATEGORIES.CHANNEL,
      entityType: DEVICE_CATEGORIES.CHANNEL,
      nodeId: controllerId,
      classroom,
      gpioPin: 23,
      mqttCommandTopic: getCommandTopic(classroom, 'light'),
      mqttStatusTopic: getStateTopic(classroom, 'light'),
      state: DEVICE_STATES.OFF,
      isOnline: false,
      lastSeenAt: null,
      isActive: true,
      description: 'Relay Channel 1: Front and rear ambient LED lighting relays (GPIO 23)',
    },
    {
      deviceId: process.env.SEED_FAN_ID || 'ESP32-RM302-FAN-01',
      name: `${classroom} Ceiling Fans`,
      type: DEVICE_TYPES.FAN,
      deviceCategory: DEVICE_CATEGORIES.CHANNEL,
      entityType: DEVICE_CATEGORIES.CHANNEL,
      nodeId: controllerId,
      classroom,
      gpioPin: 22,
      mqttCommandTopic: getCommandTopic(classroom, 'fan'),
      mqttStatusTopic: getStateTopic(classroom, 'fan'),
      state: DEVICE_STATES.OFF,
      isOnline: false,
      lastSeenAt: null,
      isActive: true,
      description: 'Relay Channel 2: Dual ceiling fan speed and power controller (GPIO 22)',
    },
    {
      deviceId: process.env.SEED_PROJECTOR_ID || 'ESP32-RM302-PROJ-01',
      name: `${classroom} Smart Projector`,
      type: DEVICE_TYPES.PROJECTOR,
      deviceCategory: DEVICE_CATEGORIES.CHANNEL,
      entityType: DEVICE_CATEGORIES.CHANNEL,
      nodeId: controllerId,
      classroom,
      gpioPin: 21,
      mqttCommandTopic: getCommandTopic(classroom, 'projector'),
      mqttStatusTopic: getStateTopic(classroom, 'projector'),
      state: DEVICE_STATES.OFF,
      isOnline: false,
      lastSeenAt: null,
      isActive: true,
      description: 'Relay Channel 3: Motorized ceiling projector and HDMI power relay (GPIO 21)',
    },
  ]

  let connection = null
  try {
    console.log('⏳ Connecting to MongoDB...')
    connection = await mongoose.connect(mongoURI, { serverSelectionTimeoutMS: 8000 })
    console.log(`✅ Connected to database: ${connection.connection.host}/${connection.connection.name}\n`)

    for (const devData of seedDevicesList) {
      const saved = await Device.findOneAndUpdate(
        { deviceId: devData.deviceId },
        { $set: devData },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      )
      console.log(`✓ Device configured: [${saved.type}] ${saved.name} (${saved.deviceId}) on GPIO ${saved.gpioPin}`)
    }

    console.log('\n' + '='.repeat(70))
    console.log('🎉 SUCCESS: All default classroom devices seeded successfully!')
    console.log('='.repeat(70) + '\n')

    await mongoose.connection.close(false)
    return true
  } catch (err) {
    console.error('\n❌ DEVICE SEEDING FAILED:', err.message)
    if (connection) await mongoose.connection.close(false)
    throw err
  }
}

if (require.main === module) {
  seedDevices()
    .then(() => process.exit(0))
    .catch(() => process.exit(1))
}

module.exports = { seedDevices }
