const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '../.env') })
const mongoose = require('mongoose')
const { User, ROLES } = require('../src/models/User')
const { hashPassword } = require('../src/utils/password.util')

const TEST_ACCOUNTS = [
  {
    name: 'Priyadharsan (Admin)',
    email: 'dharsan2763@gmail.com',
    password: '1234567890',
    role: ROLES.SUPER_ADMIN,
    department: 'Campus Administration',
  },
  {
    name: 'Alakesan (Teacher)',
    email: 'alakesanece@gmail.com',
    password: '7418529630',
    role: ROLES.TEACHER,
    department: 'ECE Department',
    assignedClasses: ['CS-301', 'Room 302'],
  },
  {
    name: 'Vidhya (Student)',
    email: 'vidhya@gmail.com',
    password: '147258369',
    role: ROLES.STUDENT,
    department: 'Computer Science',
    assignedClasses: ['CS-301'],
  },
]

async function seedTestAccounts() {
  console.log('='.repeat(70))
  console.log('🌱 Seeding Development Test Accounts (Admin, Teacher, Student)')
  console.log('='.repeat(70))

  const mongoURI = process.env.MONGODB_URI
  if (!mongoURI) {
    console.error('❌ MONGODB_URI missing in environment')
    process.exit(1)
  }

  await mongoose.connect(mongoURI)
  console.log('✅ Connected to MongoDB Atlas\n')

  for (const acc of TEST_ACCOUNTS) {
    const passwordHash = await hashPassword(acc.password)
    const existing = await User.findOne({ email: acc.email.toLowerCase() })

    if (existing) {
      existing.name = acc.name
      existing.passwordHash = passwordHash
      existing.role = acc.role
      existing.department = acc.department
      existing.isActive = true
      if (acc.assignedClasses) existing.assignedClasses = acc.assignedClasses
      await existing.save()
      console.log(`✓ Updated [${acc.role}] ${acc.name} (${acc.email})`)
    } else {
      const created = await User.create({
        name: acc.name,
        email: acc.email.toLowerCase(),
        passwordHash,
        role: acc.role,
        department: acc.department,
        assignedClasses: acc.assignedClasses || [],
        isActive: true,
      })
      console.log(`✨ Created [${acc.role}] ${acc.name} (${acc.email}) -> ID: ${created._id}`)
    }
  }

  console.log('\n✅ All test accounts seeded successfully.')
  await mongoose.disconnect()
}

seedTestAccounts().catch((err) => {
  console.error('❌ Failed to seed test accounts:', err)
  process.exit(1)
})
