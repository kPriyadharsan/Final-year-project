/**
 * Master Smart Classroom Database Seeding Script
 *
 * Runs complete initialization:
 * 1. Seeds Users: SUPER_ADMIN, TEACHER, and STUDENT (with bcrypt hashed passwords)
 * 2. Seeds Classroom Devices: Light, Fan, and Projector (with MQTT topics and GPIO assignments)
 *
 * Usage:
 *   node scripts/seed.js (or `npm run seed`)
 */
const { seedUsers } = require('./seed-users')
const { seedDevices } = require('./seed-devices')

async function runMasterSeed() {
  console.log('\n' + '#'.repeat(72))
  console.log('🚀 SMART CLASSROOM INITIAL DATABASE SEED PROCESS')
  console.log('#'.repeat(72) + '\n')

  try {
    console.log('--- Step 1: Initializing Role-Based User Accounts ---')
    await seedUsers()

    console.log('--- Step 2: Initializing Classroom IoT Devices ---')
    await seedDevices()

    console.log('#'.repeat(72))
    console.log('✅ ALL SEED OPERATIONS COMPLETED SUCCESSFULLY!')
    console.log('#'.repeat(72) + '\n')
    process.exit(0)
  } catch (err) {
    console.error('\n❌ MASTER SEED ENCOUNTERED AN ERROR:', err.message)
    process.exit(1)
  }
}

runMasterSeed()
