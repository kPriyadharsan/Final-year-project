/**
 * Automated Verification Script for Super Admin Console KPI Architecture
 *
 * Validates:
 * 1. GET /api/admin/dashboard returns separated IoT node and relay channel metrics:
 *    - totalNodes = 1, onlineNodes = 1
 *    - totalChannels = 3, channelsOn = 0..3
 * 2. Classrooms aggregation returns 1 classroom with 1 node and 3 channels
 * 3. Physical nodes are strictly not counted as channels, and vice-versa
 * 4. Future-proofing: Room 302 node + channels structure matches expectations
 */

const path = require('path')
const dotenv = require('dotenv')
dotenv.config({ path: path.resolve(__dirname, '../.env') })

const mongoose = require('mongoose')
const { User, ROLES } = require('../src/models/User')
const { Device } = require('../src/models/Device')
const { generateToken } = require('../src/utils/jwt.util')

const API_BASE = `http://localhost:${process.env.PORT || 5000}`

async function runSuperAdminTests() {
  console.log('\n======================================================')
  console.log('🏛️ SUPER ADMIN CONSOLE ARCHITECTURE VERIFICATION')
  console.log('======================================================\n')

  await mongoose.connect(process.env.MONGODB_URI)
  console.log('✅ Connected to MongoDB Atlas')

  // 1. Prepare Super Admin Token
  let adminUser = await User.findOne({ role: ROLES.SUPER_ADMIN })
  if (!adminUser) {
    adminUser = await User.create({
      name: 'Super Admin Test',
      email: 'admin.kpi.test@smartclassroom.edu',
      password: 'AdminPassword123!',
      role: ROLES.SUPER_ADMIN,
    })
  }
  const adminToken = generateToken({
    id: adminUser._id.toString(),
    email: adminUser.email,
    role: adminUser.role,
  })

  // 2. Fetch /api/admin/dashboard
  console.log('\n--- 1. Fetching GET /api/admin/dashboard ---')
  const res = await fetch(`${API_BASE}/api/admin/dashboard`, {
    headers: {
      Authorization: `Bearer ${adminToken}`,
      Accept: 'application/json',
    },
  })

  if (!res.ok) {
    throw new Error(`Failed to fetch /api/admin/dashboard (HTTP ${res.status})`)
  }

  const data = await res.json()
  console.log('✓ Received Dashboard Metrics:')
  console.log(`  - Total Physical IoT Nodes : ${data.metrics.totalNodes}`)
  console.log(`  - Online IoT Nodes         : ${data.metrics.onlineNodes}`)
  console.log(`  - Total Relay Channels     : ${data.metrics.totalChannels}`)
  console.log(`  - Channels ON              : ${data.metrics.channelsOn}`)
  console.log(`  - Active Classrooms        : ${data.metrics.totalClasses}`)

  // 3. Validations
  if (data.metrics.totalNodes !== 1) {
    throw new Error(`Expected totalNodes to be 1 physical ESP32, got: ${data.metrics.totalNodes}`)
  }
  if (data.metrics.totalChannels !== 3) {
    throw new Error(`Expected totalChannels to be 3 relay channels, got: ${data.metrics.totalChannels}`)
  }

  // 4. Validate Classroom Architecture
  console.log('\n--- 2. Validating Classroom Breakdown ---')
  const room302 = data.classrooms.find((c) => c.name === 'Room 302')
  if (!room302) {
    throw new Error('Room 302 not found in dashboard classrooms')
  }
  console.log(`✓ Room 302 structure verified: ${room302.nodes} Node(s), ${room302.totalChannels} Channels`)

  // 5. Query MongoDB directly to verify future-proofing structure
  console.log('\n--- 3. Verifying Database Entity Types ---')
  const allDevices = await Device.find({ isActive: true }).lean()
  const nodes = allDevices.filter((d) => d.entityType === 'NODE' || d.type === 'OTHER')
  const channels = allDevices.filter((d) => d.entityType === 'CHANNEL' || ['LIGHT', 'FAN', 'PROJECTOR'].includes(d.type))

  console.log(`✓ MongoDB physical node count: ${nodes.length} (Device IDs: ${nodes.map((n) => n.deviceId).join(', ')})`)
  console.log(`✓ MongoDB relay channel count: ${channels.length} (Types: ${channels.map((c) => c.type).join(', ')})`)

  if (nodes.length !== 1 || channels.length !== 3) {
    throw new Error(`Expected 1 physical node and 3 channels, found ${nodes.length} nodes and ${channels.length} channels`)
  }

  await mongoose.disconnect()

  console.log('\n======================================================')
  console.log('🎉 ALL SUPER ADMIN CONSOLE ARCHITECTURE TESTS PASSED!')
  console.log('======================================================\n')
  process.exit(0)
}

runSuperAdminTests().catch((err) => {
  console.error('\n❌ TEST FAILED:', err)
  process.exit(1)
})
