/**
 * Initial SUPER_ADMIN Development Seed Script
 *
 * Requirements:
 * - Reads SUPER_ADMIN_NAME, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD from server/.env
 * - Hashes password using reusable bcrypt utility
 * - Strictly idempotent: never creates duplicate admins
 * - Never prints plaintext password or hash in console logs
 * - Safe for development setup; no public registration endpoint exposed
 *
 * Usage:
 *   npm run seed:admin
 */
const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '../.env') })
const mongoose = require('mongoose')
const { User, ROLES } = require('../src/models/User')
const { hashPassword } = require('../src/utils/password.util')

async function seedSuperAdmin() {
  console.log('='.repeat(68))
  console.log('🌱 Smart Classroom - SUPER_ADMIN Seed Utility')
  console.log('='.repeat(68))

  // 1. Read and validate environment variables
  const adminName = process.env.SUPER_ADMIN_NAME
  const adminEmail = process.env.SUPER_ADMIN_EMAIL
  const adminPassword = process.env.SUPER_ADMIN_PASSWORD
  const mongoURI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/smart_classroom'

  const missing = []
  if (!adminName || adminName.trim() === '') missing.push('SUPER_ADMIN_NAME')
  if (!adminEmail || adminEmail.trim() === '') missing.push('SUPER_ADMIN_EMAIL')
  if (!adminPassword || adminPassword.trim() === '') missing.push('SUPER_ADMIN_PASSWORD')

  if (missing.length > 0) {
    console.error('\n❌ CONFIGURATION ERROR: Missing required seed environment variables:')
    missing.forEach((v) => console.error(`   • ${v}`))
    console.error('\n💡 Add these variables to your `server/.env` file. Refer to `server/.env.example`.')
    console.error('='.repeat(68) + '\n')
    process.exit(1)
  }

  const normalizedEmail = adminEmail.trim().toLowerCase()
  const trimmedName = adminName.trim()

  // Basic email pattern check
  if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(normalizedEmail)) {
    console.error(`\n❌ INVALID EMAIL: "${adminEmail}" is not a valid email address.`)
    process.exit(1)
  }

  // Password length enforcement
  if (adminPassword.length < 8) {
    console.error('\n❌ WEAK PASSWORD: SUPER_ADMIN_PASSWORD must be at least 8 characters long.')
    process.exit(1)
  }

  let connection = null
  try {
    console.log('⏳ Connecting to MongoDB...')
    connection = await mongoose.connect(mongoURI, {
      serverSelectionTimeoutMS: 5000,
    })
    console.log(`✅ Connected to database: ${connection.connection.host}/${connection.connection.name}`)

    // 2. Check for duplicate admin by email
    const existingByEmail = await User.findOne({ email: normalizedEmail })
    if (existingByEmail) {
      console.log('\n' + '-'.repeat(68))
      console.log(`ℹ️  SKIPPED: User with email [${normalizedEmail}] already exists.`)
      console.log(`   User ID : ${existingByEmail._id}`)
      console.log(`   Role    : ${existingByEmail.role}`)
      console.log(`   Status  : Active (${existingByEmail.isActive})`)
      console.log('   No duplicate account was created.')
      console.log('-'.repeat(68) + '\n')
      await mongoose.connection.close(false)
      process.exit(0)
    }

    // 3. Check if any SUPER_ADMIN already exists in the system
    const existingSuperAdmin = await User.findOne({ role: ROLES.SUPER_ADMIN })
    if (existingSuperAdmin) {
      console.log('\n' + '-'.repeat(68))
      console.log('ℹ️  SKIPPED: A SUPER_ADMIN account already exists in the database.')
      console.log(`   Existing Admin Email: ${existingSuperAdmin.email}`)
      console.log(`   Existing Admin Name : ${existingSuperAdmin.name}`)
      console.log('   System maintains single primary super admin. No duplicate created.')
      console.log('-'.repeat(68) + '\n')
      await mongoose.connection.close(false)
      process.exit(0)
    }

    // 4. Hash password securely (NEVER logged or stored plain)
    console.log('🔐 Hashing password with bcrypt (10 rounds)...')
    const passwordHash = await hashPassword(adminPassword)

    // 5. Create the Super Admin account
    console.log('👤 Creating SUPER_ADMIN account record...')
    const superAdmin = new User({
      name: trimmedName,
      email: normalizedEmail,
      passwordHash,
      role: ROLES.SUPER_ADMIN,
      department: 'Administration',
      assignedClasses: [],
      isActive: true,
    })

    const savedAdmin = await superAdmin.save()

    console.log('\n' + '='.repeat(68))
    console.log('🎉 SUCCESS: Initial SUPER_ADMIN account created successfully!')
    console.log('='.repeat(68))
    console.log(`   User ID    : ${savedAdmin._id}`)
    console.log(`   Name       : ${savedAdmin.name}`)
    console.log(`   Email      : ${savedAdmin.email}`)
    console.log(`   Role       : ${savedAdmin.role}`)
    console.log(`   Dashboard  : ${savedAdmin.hasDashboardAccess ? 'Authorized (SUPER_ADMIN)' : 'Denied'}`)
    console.log(`   Status     : ${savedAdmin.isActive ? 'Active' : 'Inactive'}`)
    console.log(`   Password   : [PROTECTED & HASHED - NEVER LOGGED]`)
    console.log(`   Created At : ${savedAdmin.createdAt}`)
    console.log('='.repeat(68) + '\n')

    await mongoose.connection.close(false)
    process.exit(0)
  } catch (err) {
    console.error('\n❌ SEEDING FAILED:', err.message)
    if (connection) {
      await mongoose.connection.close(false)
    }
    process.exit(1)
  }
}

seedSuperAdmin()
