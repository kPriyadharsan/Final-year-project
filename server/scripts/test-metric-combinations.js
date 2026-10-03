/**
 * test-metric-combinations.js
 *
 * Verifies all combinations requested:
 * 1. Node offline (IoT Nodes: 0 Online, Channels: 0 controllable, ESP32: Offline)
 * 2. Node online, 0 channels ON (IoT Nodes: 1 Online, Channels: 0 ON / 3 Available)
 * 3. 1 channel ON (IoT Nodes: 1 Online, Channels: 1 ON / 3 Available)
 * 4. 2 channels ON (IoT Nodes: 1 Online, Channels: 2 ON / 3 Available)
 * 5. 3 channels ON (IoT Nodes: 1 Online, Channels: 3 ON / 3 Available)
 * 6. Multi-classroom scalability (Room 302 + Room 303 -> 2 physical nodes, not 8)
 */

const mongoose = require('mongoose')
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') })
const { Device } = require('../src/models/Device')
const { connectDB, closeDB } = require('../src/config/db')

async function runTests() {
  console.log('====================================================')
  console.log('🧪 TESTING DASHBOARD COUNTING & ONLINE/OFFLINE LOGIC')
  console.log('====================================================\n')

  await connectDB()

  let totalTests = 0
  let passedTests = 0

  function assert(condition, message) {
    totalTests++
    if (condition) {
      passedTests++
      console.log(`  ✅ [PASS] ${message}`)
    } else {
      console.error(`  ❌ [FAIL] ${message}`)
    }
  }

  try {
    const NODE_ID = 'ESP32-RM302-01'
    const LIGHT_ID = 'ESP32-RM302-LIGHT-01'
    const FAN_ID = 'ESP32-RM302-FAN-01'
    const PROJ_ID = 'ESP32-RM302-PROJ-01'

    // Helper: Compute dashboard metrics directly using backend query logic
    async function computeDashboardMetrics() {
      const nodeFilter = { isActive: true, $or: [{ entityType: 'NODE' }, { deviceCategory: 'NODE' }, { type: 'OTHER' }] }
      const channelFilter = { isActive: true, $or: [{ entityType: 'CHANNEL' }, { deviceCategory: 'CHANNEL' }, { type: { $in: ['LIGHT', 'FAN', 'PROJECTOR'] } }] }

      const [totalNodes, onlineNodes, totalChannels, channelsOn, classroomAgg] = await Promise.all([
        Device.countDocuments(nodeFilter),
        Device.countDocuments({ ...nodeFilter, isOnline: true }),
        Device.countDocuments(channelFilter),
        Device.countDocuments({ ...channelFilter, state: 'ON' }),
        Device.aggregate([
          { $match: { isActive: true } },
          {
            $group: {
              _id: '$classroom',
              totalNodes: {
                $sum: { $cond: [{ $or: [{ $eq: ['$entityType', 'NODE'] }, { $eq: ['$type', 'OTHER'] }] }, 1, 0] },
              },
              onlineNodes: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $eq: ['$isOnline', true] },
                        { $or: [{ $eq: ['$entityType', 'NODE'] }, { $eq: ['$type', 'OTHER'] }] },
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },
              totalChannels: {
                $sum: {
                  $cond: [
                    { $or: [{ $eq: ['$entityType', 'CHANNEL'] }, { $in: ['$type', ['LIGHT', 'FAN', 'PROJECTOR']] }] },
                    1,
                    0,
                  ],
                },
              },
              channelsOn: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $eq: ['$state', 'ON'] },
                        { $or: [{ $eq: ['$entityType', 'CHANNEL'] }, { $in: ['$type', ['LIGHT', 'FAN', 'PROJECTOR']] }] },
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },
            },
          },
        ]),
      ])

      const classrooms = classroomAgg.map((c) => {
        const isOnline = c.onlineNodes > 0
        const avail = isOnline ? c.totalChannels : 0
        return {
          room: c._id,
          totalNodes: c.totalNodes,
          onlineNodes: c.onlineNodes,
          totalChannels: c.totalChannels,
          channelsOn: c.channelsOn,
          availableChannels: avail,
          summary: isOnline ? `${c.channelsOn} ON / ${avail} Available` : '0 Controllable • Node Offline',
        }
      })

      const availableChannels = classrooms.reduce((acc, c) => acc + c.availableChannels, 0)

      return {
        totalNodes,
        onlineNodes,
        totalChannels,
        channelsOn,
        availableChannels,
        classrooms,
      }
    }

    // -----------------------------------------------------------------
    // TEST 1: Node Offline
    // -----------------------------------------------------------------
    console.log('--- TEST 1: Node Disconnected / Offline ---')
    await Device.updateOne({ deviceId: NODE_ID }, { $set: { isOnline: false } })
    await Device.updateMany({ deviceId: { $in: [LIGHT_ID, FAN_ID, PROJ_ID] } }, { $set: { isOnline: false } })

    let m1 = await computeDashboardMetrics()
    assert(m1.totalNodes === 1, `Total IoT Nodes is 1 (Never 4! Actual: ${m1.totalNodes})`)
    assert(m1.onlineNodes === 0, `Online Nodes is 0 (Actual: ${m1.onlineNodes})`)
    assert(m1.totalChannels === 3, `Total Channels is 3 (Actual: ${m1.totalChannels})`)
    assert(m1.availableChannels === 0, `Available Channels is 0 when node is offline (Actual: ${m1.availableChannels})`)
    assert(m1.classrooms[0].summary === '0 Controllable • Node Offline', `Room summary correctly reflects offline: "${m1.classrooms[0].summary}"`)

    // -----------------------------------------------------------------
    // TEST 2: Node Online, 0 Channels ON
    // -----------------------------------------------------------------
    console.log('\n--- TEST 2: Node Online, 0 Channels ON ---')
    await Device.updateOne({ deviceId: NODE_ID }, { $set: { isOnline: true } })
    await Device.updateMany({ deviceId: { $in: [LIGHT_ID, FAN_ID, PROJ_ID] } }, { $set: { isOnline: true, state: 'OFF' } })

    let m2 = await computeDashboardMetrics()
    assert(m2.totalNodes === 1, `Total IoT Nodes is 1 (Actual: ${m2.totalNodes})`)
    assert(m2.onlineNodes === 1, `Online Nodes is 1 Online (Actual: ${m2.onlineNodes})`)
    assert(m2.totalChannels === 3, `Total Channels is 3 (Actual: ${m2.totalChannels})`)
    assert(m2.channelsOn === 0, `Channels ON is 0 (Actual: ${m2.channelsOn})`)
    assert(m2.availableChannels === 3, `Available Channels is 3 Available (Actual: ${m2.availableChannels})`)
    assert(m2.classrooms[0].summary === '0 ON / 3 Available', `Room display matches requirement "0 ON / 3 Available" (Actual: "${m2.classrooms[0].summary}")`)

    // -----------------------------------------------------------------
    // TEST 3: 1 Channel ON (Light ON, Fan OFF, Projector OFF)
    // -----------------------------------------------------------------
    console.log('\n--- TEST 3: 1 Channel ON (Light ON, Fan OFF, Projector OFF) ---')
    await Device.updateOne({ deviceId: LIGHT_ID }, { $set: { state: 'ON' } })
    await Device.updateOne({ deviceId: FAN_ID }, { $set: { state: 'OFF' } })
    await Device.updateOne({ deviceId: PROJ_ID }, { $set: { state: 'OFF' } })

    let m3 = await computeDashboardMetrics()
    assert(m3.onlineNodes === 1, `IoT Nodes: 1 Online (Actual: ${m3.onlineNodes})`)
    assert(m3.channelsOn === 1, `Channels ON: 1 (Actual: ${m3.channelsOn})`)
    assert(m3.availableChannels === 3, `Available Channels: 3 Available (Actual: ${m3.availableChannels})`)
    assert(m3.classrooms[0].summary === '1 ON / 3 Available', `Room display matches requirement "1 ON / 3 Available" (Actual: "${m3.classrooms[0].summary}")`)

    // -----------------------------------------------------------------
    // TEST 4: 2 Channels ON (Light ON, Fan ON, Projector OFF)
    // -----------------------------------------------------------------
    console.log('\n--- TEST 4: 2 Channels ON (Light ON, Fan ON, Projector OFF) ---')
    await Device.updateOne({ deviceId: LIGHT_ID }, { $set: { state: 'ON' } })
    await Device.updateOne({ deviceId: FAN_ID }, { $set: { state: 'ON' } })
    await Device.updateOne({ deviceId: PROJ_ID }, { $set: { state: 'OFF' } })

    let m4 = await computeDashboardMetrics()
    assert(m4.onlineNodes === 1, `IoT Nodes: 1 Online (Actual: ${m4.onlineNodes})`)
    assert(m4.channelsOn === 2, `Channels ON: 2 (Actual: ${m4.channelsOn})`)
    assert(m4.availableChannels === 3, `Available Channels: 3 Available (Actual: ${m4.availableChannels})`)
    assert(m4.classrooms[0].summary === '2 ON / 3 Available', `Room display matches requirement "2 ON / 3 Available" (Actual: "${m4.classrooms[0].summary}")`)

    // -----------------------------------------------------------------
    // TEST 5: 3 Channels ON (Light ON, Fan ON, Projector ON)
    // -----------------------------------------------------------------
    console.log('\n--- TEST 5: 3 Channels ON (Light ON, Fan ON, Projector ON) ---')
    await Device.updateOne({ deviceId: LIGHT_ID }, { $set: { state: 'ON' } })
    await Device.updateOne({ deviceId: FAN_ID }, { $set: { state: 'ON' } })
    await Device.updateOne({ deviceId: PROJ_ID }, { $set: { state: 'ON' } })

    let m5 = await computeDashboardMetrics()
    assert(m5.onlineNodes === 1, `IoT Nodes: 1 Online (Actual: ${m5.onlineNodes})`)
    assert(m5.channelsOn === 3, `Channels ON: 3 (Actual: ${m5.channelsOn})`)
    assert(m5.availableChannels === 3, `Available Channels: 3 Available (Actual: ${m5.availableChannels})`)
    assert(m5.classrooms[0].summary === '3 ON / 3 Available', `Room display matches requirement "3 ON / 3 Available" (Actual: "${m5.classrooms[0].summary}")`)

    // -----------------------------------------------------------------
    // TEST 6: Multi-Classroom Scalability (Room 302 + Room 303)
    // -----------------------------------------------------------------
    console.log('\n--- TEST 6: Multi-Classroom Scalability (Simulate Room 303 Addition) ---')
    // Temporarily insert Room 303 devices
    const rm303Node = await Device.create({
      deviceId: 'ESP32-RM303-01',
      name: 'Room 303 Controller Node',
      type: 'OTHER',
      entityType: 'NODE',
      deviceCategory: 'NODE',
      classroom: 'Room 303',
      gpioPin: 2,
      isOnline: false, // Room 303 node is offline
      state: 'OFF',
    })

    const rm303Light = await Device.create({
      deviceId: 'ESP32-RM303-LIGHT-01',
      name: 'Room 303 Light',
      type: 'LIGHT',
      entityType: 'CHANNEL',
      deviceCategory: 'CHANNEL',
      classroom: 'Room 303',
      nodeId: 'ESP32-RM303-01',
      gpioPin: 23,
      isOnline: false,
      state: 'OFF',
    })

    const m6 = await computeDashboardMetrics()
    assert(m6.totalNodes === 2, `Total IoT Nodes dynamically scales to 2 across 2 rooms (Actual: ${m6.totalNodes})`)
    assert(m6.onlineNodes === 1, `Online Nodes is 1 (Room 302 online, Room 303 offline) (Actual: ${m6.onlineNodes})`)
    assert(m6.totalChannels === 4, `Total Channels is 4 across 2 rooms (Actual: ${m6.totalChannels})`)
    assert(m6.availableChannels === 3, `Available Channels is 3 (Only channels in online Room 302) (Actual: ${m6.availableChannels})`)

    // Clean up temporary Room 303 devices
    await Device.deleteMany({ classroom: 'Room 303' })
    console.log('  Cleaned up temporary Room 303 test records.')

    // -----------------------------------------------------------------
    // Reset to clean baseline
    // -----------------------------------------------------------------
    await Device.updateOne({ deviceId: NODE_ID }, { $set: { isOnline: true } })
    await Device.updateMany({ deviceId: { $in: [LIGHT_ID, FAN_ID, PROJ_ID] } }, { $set: { isOnline: true, state: 'OFF' } })

    console.log('\n====================================================')
    console.log(`RESULTS: ${passedTests}/${totalTests} ASSERTIONS PASSED`)
    console.log('====================================================\n')
  } catch (err) {
    console.error('Test error:', err)
  } finally {
    await closeDB()
  }
}

runTests()
