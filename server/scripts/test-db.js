/**
 * Standalone MongoDB Connection Test Script
 * Run with: node scripts/test-db.js (or `npm run test:db`)
 */
const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '../.env') })
const mongoose = require('mongoose')
const { pingDatabase } = require('../src/config/db')

async function runDatabaseTest() {
  const mongoURI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/smart_classroom'

  console.log('='.repeat(65))
  console.log('🧪 MongoDB Connection Test: AI Voice-Controlled Smart Classroom')
  console.log('='.repeat(65))
  console.log(`📍 Target URI   : ${mongoURI}`)
  console.log(`⏱️  Timeout      : 5000ms`)
  console.log(`⏳ Attempting handshake...`)

  const startTime = Date.now()

  try {
    const conn = await mongoose.connect(mongoURI, {
      serverSelectionTimeoutMS: 5000,
    })

    const handshakeTime = Date.now() - startTime
    console.log(`\n✅ Handshake Succeeded in ${handshakeTime}ms!`)
    console.log(`   Host        : ${conn.connection.host}`)
    console.log(`   Port        : ${conn.connection.port || 'default'}`)
    console.log(`   Database    : ${conn.connection.name}`)

    // Test pinging the admin database
    console.log('\n📡 Performing Database Ping check...')
    const pingResult = await pingDatabase()

    if (pingResult.success) {
      console.log(`✅ Admin Ping Round-trip: ${pingResult.latencyMs}ms`)
    } else {
      console.warn(`⚠️ Ping warning: ${pingResult.error}`)
    }

    // List collections
    const collections = await conn.connection.db.listCollections().toArray()
    console.log(`📁 Collections : ${collections.length} collection(s) present in [${conn.connection.name}]`)
    if (collections.length > 0) {
      collections.forEach((col) => console.log(`   • ${col.name}`))
    } else {
      console.log('   (Empty database - ready for initial schema creation)')
    }

    console.log('\n' + '='.repeat(65))
    console.log('🎉 RESULT: MongoDB connection test PASSED successfully!')
    console.log('='.repeat(65) + '\n')

    await mongoose.connection.close(false)
    process.exit(0)
  } catch (err) {
    console.error('\n' + '='.repeat(65))
    console.error('❌ RESULT: MongoDB connection test FAILED')
    console.error('='.repeat(65))
    console.error(`Error details: ${err.message}`)
    console.error('\n💡 Troubleshooting Tips:')
    console.error('  1. Ensure your MongoDB daemon / service is running.')
    console.error('     - For local Windows: Start MongoDB service or run `mongod`')
    console.error('     - For MongoDB Atlas: Verify IP access list (whitelist current IP)')
    console.error('  2. Check `server/.env` MONGODB_URI connection string format and credentials.')
    console.error('='.repeat(65) + '\n')

    process.exit(1)
  }
}

runDatabaseTest()
