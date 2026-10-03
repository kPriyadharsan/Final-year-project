/**
 * Production-Safe User Seeding Script
 *
 * Seeds:
 * 1. Exactly one SUPER_ADMIN (if none exists)
 * 2. Test TEACHER user (environment configurable)
 * 3. Test STUDENT user (environment configurable)
 *
 * Security & Reliability Requirements:
 * - All passwords hashed using bcrypt (10 rounds)
 * - Plaintext passwords are NEVER logged or stored
 * - Environment configurable via server/.env
 * - Strictly idempotent: never overwrites or creates duplicates
 *
 * Usage:
 *   node scripts/seed-users.js
 */
const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '../.env') })
const mongoose = require('mongoose')
const { User, ROLES } = require('../src/models/User')
const { hashPassword } = require('../src/utils/password.util')

async function seedUsers() {
  console.log('='.repeat(70))
  console.log('🌱 Smart Classroom - Role-Based User Seed Utility')
  console.log('='.repeat(70))

  const mongoURI = process.env.MONGODB_URI
  if (!mongoURI) {
    console.error('❌ CONFIGURATION ERROR: MONGODB_URI is not set in environment.')
    process.exit(1)
  }

  // 1. Read environment-configured seed parameters (with safe dev fallbacks)
  const adminConfig = {
    name: (process.env.SUPER_ADMIN_NAME || 'Super Admin').trim(),
    email: (process.env.SUPER_ADMIN_EMAIL || 'admin@smartclassroom.edu').trim().toLowerCase(),
    password: process.env.SUPER_ADMIN_PASSWORD || 'SuperAdminSecure2026!',
    role: ROLES.SUPER_ADMIN,
    department: 'Campus Administration',
  }

  const teacherConfig = {
    name: (process.env.SEED_TEACHER_NAME || 'Prof. Sarah Connor').trim(),
    email: (process.env.SEED_TEACHER_EMAIL || 'teacher@smartclassroom.edu').trim().toLowerCase(),
    password: process.env.SEED_TEACHER_PASSWORD || 'TeacherSecure2026!',
    role: ROLES.TEACHER,
    department: process.env.SEED_TEACHER_DEPT || 'Computer Science & Engineering',
    assignedClasses: ['CS-301', 'CS-402'],
  }

  const studentConfig = {
    name: (process.env.SEED_STUDENT_NAME || 'Alex Mercer').trim(),
    email: (process.env.SEED_STUDENT_EMAIL || 'student@smartclassroom.edu').trim().toLowerCase(),
    password: process.env.SEED_STUDENT_PASSWORD || 'StudentSecure2026!',
    role: ROLES.STUDENT,
    department: 'Computer Science',
    assignedClasses: ['CS-301'],
  }

  const usersToSeed = [adminConfig, teacherConfig, studentConfig]

  let connection = null
  try {
    console.log('⏳ Connecting to MongoDB...')
    connection = await mongoose.connect(mongoURI, { serverSelectionTimeoutMS: 8000 })
    console.log(`✅ Connected to database: ${connection.connection.host}/${connection.connection.name}\n`)

    for (const userDef of usersToSeed) {
      // Check if user with this email already exists
      const existingUser = await User.findOne({ email: userDef.email })
      if (existingUser) {
        console.log(`✓ [${userDef.role}] ${userDef.name} (${userDef.email}) -> Already exists (ID: ${existingUser._id})`)
        continue
      }

      // Check if a SUPER_ADMIN already exists before creating another
      if (userDef.role === ROLES.SUPER_ADMIN) {
        const existingAdmin = await User.findOne({ role: ROLES.SUPER_ADMIN })
        if (existingAdmin) {
          console.log(`✓ [SUPER_ADMIN] System already has primary admin (${existingAdmin.email}). Skipping.`)
          continue
        }
      }

      // Hash password with bcrypt (never plaintext)
      const passwordHash = await hashPassword(userDef.password)

      const newUser = await User.create({
        name: userDef.name,
        email: userDef.email,
        passwordHash,
        role: userDef.role,
        department: userDef.department || '',
        assignedClasses: userDef.assignedClasses || [],
        isActive: true,
      })

      console.log(`✨ Created [${newUser.role}] ${newUser.name} (${newUser.email}) -> ID: ${newUser._id}`)
    }

    console.log('\n' + '='.repeat(70))
    console.log('🎉 SUCCESS: All role accounts verified/seeded successfully!')
    console.log('='.repeat(70) + '\n')

    await mongoose.connection.close(false)
    return true
  } catch (err) {
    console.error('\n❌ USER SEEDING FAILED:', err.message)
    if (connection) await mongoose.connection.close(false)
    throw err
  }
}

if (require.main === module) {
  seedUsers()
    .then(() => process.exit(0))
    .catch(() => process.exit(1))
}

module.exports = { seedUsers }
