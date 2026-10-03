/**
 * Idempotent Device Seed Script for Smart Classroom System
 * Seeds standard classroom IoT appliances (Light, Fan, Projector)
 * matching ESP32 firmware GPIOs and MQTT topics.
 *
 * Usage:
 *   npm run seed:devices
 */
const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '../.env') })
const mongoose = require('mongoose')
const { Device, DEVICE_TYPES, DEVICE_STATES } = require('../src/models/Device')

const SEED_DEVICES = [
  {
    name: 'Classroom 302 Main Lights',
    type: DEVICE_TYPES.LIGHT,
    classroom: 'Room 302',
    deviceId: 'ESP32-RM302-LIGHT-01',
    mqttCommandTopic: 'classroom/device/light/set',
    mqttStatusTopic: 'classroom/device/light/status',
    state: DEVICE_STATES.OFF,
    isOnline: true,
    gpioPin: 23,
    description: 'Relay Channel 1: Front and rear ambient LED lighting relays (GPIO 23)',
    isActive: true,
  },
  {
    name: 'Classroom 302 Ceiling Fans',
    type: DEVICE_TYPES.FAN,
    classroom: 'Room 302',
    deviceId: 'ESP32-RM302-FAN-01',
    mqttCommandTopic: 'classroom/device/fan/set',
    mqttStatusTopic: 'classroom/device/fan/status',
    state: DEVICE_STATES.OFF,
    isOnline: true,
    gpioPin: 22,
    description: 'Relay Channel 2: Dual ceiling fan speed and power controller (GPIO 22)',
    isActive: true,
  },
  {
    name: 'Classroom 302 Smart Projector',
    type: DEVICE_TYPES.PROJECTOR,
    classroom: 'Room 302',
    deviceId: 'ESP32-RM302-PROJ-01',
    mqttCommandTopic: 'classroom/device/projector/set',
    mqttStatusTopic: 'classroom/device/projector/status',
    state: DEVICE_STATES.OFF,
    isOnline: true,
    gpioPin: 21,
    description: 'Relay Channel 3: Motorized ceiling projector and HDMI power relay (GPIO 21)',
    isActive: true,
  },
]

async function seedDevices() {
  console.log('='.repeat(68))
  console.log('🌱 Smart Classroom - Hardware Devices Seed Utility')
  console.log('='.repeat(68))

  const mongoURI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/smart_classroom'

  try {
    console.log('⏳ Connecting to MongoDB...')
    await mongoose.connect(mongoURI, { serverSelectionTimeoutMS: 5000 })
    console.log('✅ Connected to MongoDB')

    for (const devData of SEED_DEVICES) {
      const saved = await Device.findOneAndUpdate(
        { deviceId: devData.deviceId },
        { $set: devData },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      )
      console.log(`✓ Device configured: [${saved.type}] ${saved.name} (${saved.deviceId}) on GPIO ${saved.gpioPin}`)
    }

    console.log('\n' + '='.repeat(68))
    console.log('🎉 SUCCESS: All default classroom devices seeded successfully!')
    console.log('='.repeat(68) + '\n')

    await mongoose.connection.close(false)
    process.exit(0)
  } catch (err) {
    console.error('\n❌ DEVICE SEEDING FAILED:', err.message)
    await mongoose.connection.close(false)
    process.exit(1)
  }
}

seedDevices()
