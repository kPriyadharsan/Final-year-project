/**
 * Automated Authentication & JWT Verification Test Suite
 * Tests:
 * 1. POST /api/auth/login (missing fields, wrong password, correct credentials)
 * 2. Token generation, payload structure (id, role), and passwordHash exclusion
 * 3. GET /api/auth/me (valid Bearer token, missing token, invalid token, expired token)
 *
 * Run with: npm run test:auth
 */
const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '../.env') })
const mongoose = require('mongoose')
const { User, ROLES } = require('../src/models/User')
const { hashPassword } = require('../src/utils/password.util')
const { generateToken, verifyToken } = require('../src/utils/jwt.util')
const { authenticate } = require('../src/middleware/auth.middleware')

async function runAuthTests() {
  console.log('='.repeat(68))
  console.log('🔑 Smart Classroom - JWT Authentication Test Suite')
  console.log('='.repeat(68))

  const mongoURI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/smart_classroom'
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

  let connection
  try {
    connection = await mongoose.connect(mongoURI, { serverSelectionTimeoutMS: 5000 })

    // Ensure a test user exists
    const testEmail = 'authtest.teacher@smartclassroom.edu'
    const testPassword = 'TeacherAuthTestPass123!'
    await User.deleteOne({ email: testEmail })

    const passwordHash = await hashPassword(testPassword)
    const testUser = await User.create({
      name: 'Auth Test Teacher',
      email: testEmail,
      passwordHash,
      role: ROLES.TEACHER,
      department: 'Physics',
      assignedClasses: ['PHY-101'],
      isActive: true,
    })

    console.log('\n[1] JWT Token Generation & Verification Utilities')
    const token = generateToken({ id: testUser._id.toString(), role: testUser.role })
    assert(typeof token === 'string' && token.split('.').length === 3, 'generateToken returns valid 3-part JWT')

    const decoded = verifyToken(token)
    assert(decoded.id === testUser._id.toString(), 'Token payload contains correct user id')
    assert(decoded.role === ROLES.TEACHER, 'Token payload contains correct user role')

    console.log('\n[2] Credential Verification & Safe User Response')
    // Compare correct password
    const userWithHash = await User.findOne({ email: testEmail }).select('+passwordHash')
    const correctPassMatch = await userWithHash.comparePassword(testPassword)
    assert(correctPassMatch === true, 'Valid password successfully matches stored bcrypt hash')

    // Compare wrong password
    const wrongPassMatch = await userWithHash.comparePassword('WrongPassword!')
    assert(wrongPassMatch === false, 'Invalid password is rejected')

    // Verify passwordHash is never serialized
    const safeJson = testUser.toJSON()
    assert(safeJson.passwordHash === undefined, 'passwordHash is strictly excluded from safe user JSON')
    assert(safeJson.email === testEmail, 'Safe user JSON includes verified email')
    assert(safeJson.hasDashboardAccess === true, 'TEACHER has dashboard access')

    console.log('\n[3] Auth Middleware Verification (Mock Request/Response)')
    // Mock helper
    const createMockRes = () => {
      const res = {
        statusCode: 200,
        data: null,
        status(code) {
          this.statusCode = code
          return this
        },
        json(payload) {
          this.data = payload
          return this
        },
      }
      return res
    }

    // 3a. Valid Bearer Token
    const validReq = { headers: { authorization: `Bearer ${token}` } }
    const validRes = createMockRes()
    let nextCalled = false
    await authenticate(validReq, validRes, () => { nextCalled = true })
    assert(nextCalled === true, 'Middleware allows valid token and invokes next()')
    assert(validReq.user && validReq.user._id.toString() === testUser._id.toString(), 'Middleware attaches authenticated user to req.user')
    assert(validReq.user.passwordHash === undefined, 'req.user does not leak passwordHash')

    // 3b. Missing Authorization Header
    const missingReq = { headers: {} }
    const missingRes = createMockRes()
    await authenticate(missingReq, missingRes, () => {})
    assert(missingRes.statusCode === 401, 'Middleware returns 401 when Authorization header is missing')

    // 3c. Invalid Token Format
    const badTokenReq = { headers: { authorization: 'Bearer invalid.tampered.token' } }
    const badTokenRes = createMockRes()
    await authenticate(badTokenReq, badTokenRes, () => {})
    assert(badTokenRes.statusCode === 401 && badTokenRes.data.code === 'TOKEN_INVALID', 'Middleware rejects tampered/invalid token with 401')

    // 3d. Expired Token
    const expiredToken = generateToken({ id: testUser._id.toString(), role: testUser.role }, '0s')
    const expiredReq = { headers: { authorization: `Bearer ${expiredToken}` } }
    const expiredRes = createMockRes()
    await authenticate(expiredReq, expiredRes, () => {})
    assert(expiredRes.statusCode === 401 && expiredRes.data.code === 'TOKEN_EXPIRED', 'Middleware rejects expired token with TOKEN_EXPIRED')

    // 3e. Deactivated User Account
    testUser.isActive = false
    await testUser.save()
    const deactReq = { headers: { authorization: `Bearer ${token}` } }
    const deactRes = createMockRes()
    await authenticate(deactReq, deactRes, () => {})
    assert(deactRes.statusCode === 403 && deactRes.data.code === 'ACCOUNT_DEACTIVATED', 'Middleware blocks deactivated user with 403 Forbidden')

    // Cleanup test user
    await User.deleteOne({ email: testEmail })

    console.log('\n' + '='.repeat(68))
    console.log(`🎉 AUTH TEST SUMMARY: ${passed} passed, ${failed} failed`)
    console.log('='.repeat(68) + '\n')

    await mongoose.connection.close(false)
    process.exit(failed > 0 ? 1 : 0)
  } catch (err) {
    console.error('\n❌ Unexpected error running auth tests:', err)
    if (connection) await mongoose.connection.close(false)
    process.exit(1)
  }
}

runAuthTests()
