/**
 * Automated Authentication & JWT Verification Test Suite
 * Tests:
 * 1. JWT Token generation & verification utilities (valid, expired, tampered)
 * 2. POST /api/auth/login (missing fields, bad email format, wrong password, correct credentials, deactivated user)
 * 3. GET /api/auth/me (valid Bearer token, missing token, invalid token, expired token)
 * 4. PUT /api/auth/profile (valid update, role-tampering rejection, email alteration rejection)
 * 5. PUT /api/auth/password (wrong current password, short new password, successful password change)
 * 6. Bcrypt hashing verification & complete exclusion of passwordHash from all responses
 *
 * Run with: npm run test:auth
 */
const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '../.env') })
const mongoose = require('mongoose')
const { User, ROLES } = require('../src/models/User')
const { hashPassword, comparePassword } = require('../src/utils/password.util')
const { generateToken, verifyToken } = require('../src/utils/jwt.util')
const { authenticate } = require('../src/middleware/auth.middleware')
const {
  login,
  getMe,
  updateProfile,
  updatePassword,
} = require('../src/controllers/auth.controller')

async function runAuthTests() {
  console.log('='.repeat(70))
  console.log('🔑 Smart Classroom - Production Authentication Test Suite')
  console.log('='.repeat(70))

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

  // Mock response builder
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

  let connection
  try {
    connection = await mongoose.connect(mongoURI, { serverSelectionTimeoutMS: 5000 })

    const testEmail = 'authtest.faculty@smartclassroom.edu'
    const testPassword = 'FacultySecret2026!'
    await User.deleteOne({ email: testEmail })

    const initialHash = await hashPassword(testPassword)
    const testUser = await User.create({
      name: 'Auth Test Faculty',
      email: testEmail,
      passwordHash: initialHash,
      role: ROLES.TEACHER,
      department: 'Electrical Engineering',
      assignedClasses: ['EE-301'],
      isActive: true,
    })

    console.log('\n[1] JWT Token Generation & Verification Utilities')
    const token = generateToken({ id: testUser._id.toString(), role: testUser.role })
    assert(typeof token === 'string' && token.split('.').length === 3, 'generateToken returns valid 3-part JWT')

    const decoded = verifyToken(token)
    assert(decoded.id === testUser._id.toString(), 'Token payload contains correct user id')
    assert(decoded.role === ROLES.TEACHER, 'Token payload contains correct user role')

    console.log('\n[2] Credential Verification & Safe User Serialization')
    const userWithHash = await User.findOne({ email: testEmail }).select('+passwordHash')
    const correctPassMatch = await userWithHash.comparePassword(testPassword)
    assert(correctPassMatch === true, 'Valid password matches stored bcrypt hash')

    const wrongPassMatch = await userWithHash.comparePassword('WrongPassword123!')
    assert(wrongPassMatch === false, 'Invalid password is strictly rejected')

    const safeJson = testUser.toJSON()
    assert(safeJson.passwordHash === undefined, 'passwordHash is completely excluded from safe user JSON')
    assert(safeJson.email === testEmail, 'Safe user JSON includes verified email')
    assert(safeJson.hasDashboardAccess === true, 'TEACHER has dashboard access flag')

    console.log('\n[3] Auth Controller: POST /api/auth/login')
    // 3a. Missing credentials
    const missingReq = { body: {} }
    const missingRes = createMockRes()
    await login(missingReq, missingRes)
    assert(missingRes.statusCode === 400, 'Rejects login request with missing credentials (400)')

    // 3b. Invalid email format
    const badEmailReq = { body: { email: 'invalid-email-format', password: testPassword } }
    const badEmailRes = createMockRes()
    await login(badEmailReq, badEmailRes)
    assert(badEmailRes.statusCode === 400 && badEmailRes.data.code === 'INVALID_EMAIL_FORMAT', 'Rejects malformed email format (400)')

    // 3c. Non-existent email
    const unknownReq = { body: { email: 'nonexistent@smartclassroom.edu', password: testPassword } }
    const unknownRes = createMockRes()
    await login(unknownReq, unknownRes)
    assert(unknownRes.statusCode === 401, 'Rejects non-existent email with generic 401')

    // 3d. Incorrect password
    const wrongPwdReq = { body: { email: testEmail, password: 'WrongPassword!' } }
    const wrongPwdRes = createMockRes()
    await login(wrongPwdReq, wrongPwdRes)
    assert(wrongPwdRes.statusCode === 401, 'Rejects wrong password with 401')

    // 3e. Successful login
    const validLoginReq = { body: { email: testEmail, password: testPassword } }
    const validLoginRes = createMockRes()
    await login(validLoginReq, validLoginRes)
    assert(
      validLoginRes.statusCode === 200 &&
      validLoginRes.data.token &&
      validLoginRes.data.user.email === testEmail &&
      validLoginRes.data.user.passwordHash === undefined,
      'Authenticates valid credentials, returns JWT, and excludes passwordHash'
    )

    console.log('\n[4] Auth Middleware Verification (requireAuth)')
    // 4a. Valid Bearer token
    const validAuthReq = { headers: { authorization: `Bearer ${token}` } }
    const validAuthRes = createMockRes()
    let nextCalled = false
    await authenticate(validAuthReq, validAuthRes, () => { nextCalled = true })
    assert(nextCalled === true, 'Allows valid token and invokes next()')
    assert(validAuthReq.user && validAuthReq.user._id.toString() === testUser._id.toString(), 'Attaches authenticated user to req.user')
    assert(validAuthReq.user.passwordHash === undefined, 'req.user does not contain passwordHash')

    // 4b. Missing Authorization header
    const noHeaderReq = { headers: {} }
    const noHeaderRes = createMockRes()
    await authenticate(noHeaderReq, noHeaderRes, () => {})
    assert(noHeaderRes.statusCode === 401 && noHeaderRes.data.code === 'TOKEN_MISSING', 'Rejects missing Authorization header with 401 TOKEN_MISSING')

    // 4c. Malformed Bearer header
    const malformedReq = { headers: { authorization: 'Bearer   ' } }
    const malformedRes = createMockRes()
    await authenticate(malformedReq, malformedRes, () => {})
    assert(malformedRes.statusCode === 401 && malformedRes.data.code === 'TOKEN_MALFORMED', 'Rejects malformed token string with 401 TOKEN_MALFORMED')

    // 4d. Tampered / invalid token
    const tamperedReq = { headers: { authorization: 'Bearer header.payload.fakeSignature' } }
    const tamperedRes = createMockRes()
    await authenticate(tamperedReq, tamperedRes, () => {})
    assert(tamperedRes.statusCode === 401 && tamperedRes.data.code === 'TOKEN_INVALID', 'Rejects tampered token with 401 TOKEN_INVALID')

    // 4e. Expired token
    const expiredToken = generateToken({ id: testUser._id.toString(), role: testUser.role }, '0s')
    const expiredReq = { headers: { authorization: `Bearer ${expiredToken}` } }
    const expiredRes = createMockRes()
    await authenticate(expiredReq, expiredRes, () => {})
    assert(expiredRes.statusCode === 401 && expiredRes.data.code === 'TOKEN_EXPIRED', 'Rejects expired token with 401 TOKEN_EXPIRED')

    // 4f. Deactivated user account
    testUser.isActive = false
    await testUser.save()
    const deactReq = { headers: { authorization: `Bearer ${token}` } }
    const deactRes = createMockRes()
    await authenticate(deactReq, deactRes, () => {})
    assert(deactRes.statusCode === 403 && deactRes.data.code === 'ACCOUNT_DEACTIVATED', 'Rejects deactivated user account with 403 ACCOUNT_DEACTIVATED')

    // Restore active status for subsequent tests
    testUser.isActive = true
    await testUser.save()

    console.log('\n[5] Auth Controller: GET /api/auth/me')
    const getMeReq = { user: testUser }
    const getMeRes = createMockRes()
    await getMe(getMeReq, getMeRes)
    assert(getMeRes.statusCode === 200 && getMeRes.data.user.email === testEmail, 'getMe returns safe profile for authenticated session')
    assert(getMeRes.data.user.passwordHash === undefined, 'getMe output never contains passwordHash')

    console.log('\n[6] Profile Management & Role-Tampering Protection: PUT /api/auth/profile')
    // 6a. Normal safe profile update
    const safeUpdateReq = { user: testUser, body: { name: 'Updated Faculty Name', department: 'Robotics' } }
    const safeUpdateRes = createMockRes()
    await updateProfile(safeUpdateReq, safeUpdateRes)
    assert(safeUpdateRes.statusCode === 200 && safeUpdateRes.data.user.name === 'Updated Faculty Name', 'Allows updating permitted profile fields (name, department)')

    // 6b. Role modification attempt (Privilege Escalation)
    const roleTamperReq = { user: testUser, body: { role: 'SUPER_ADMIN' } }
    const roleTamperRes = createMockRes()
    await updateProfile(roleTamperReq, roleTamperRes)
    assert(
      roleTamperRes.statusCode === 403 && roleTamperRes.data.code === 'ROLE_MODIFICATION_FORBIDDEN',
      'Strictly blocks role modification attempt via profile API with 403 ROLE_MODIFICATION_FORBIDDEN'
    )

    // 6c. Email alteration attempt
    const emailAlterReq = { user: testUser, body: { email: 'hacked@external.com' } }
    const emailAlterRes = createMockRes()
    await updateProfile(emailAlterReq, emailAlterRes)
    assert(
      emailAlterRes.statusCode === 400 && emailAlterRes.data.code === 'EMAIL_CHANGE_RESTRICTED',
      'Blocks unauthorized email address alteration with 400 EMAIL_CHANGE_RESTRICTED'
    )

    console.log('\n[7] Password Management: PUT /api/auth/password')
    // 7a. Missing password fields
    const missingPwdReq = { user: testUser, body: {} }
    const missingPwdRes = createMockRes()
    await updatePassword(missingPwdReq, missingPwdRes)
    assert(missingPwdRes.statusCode === 400, 'Rejects password update with missing fields (400)')

    // 7b. New password too short (< 8 chars)
    const shortPwdReq = { user: testUser, body: { currentPassword: testPassword, newPassword: '123' } }
    const shortPwdRes = createMockRes()
    await updatePassword(shortPwdReq, shortPwdRes)
    assert(shortPwdRes.statusCode === 400 && shortPwdRes.data.code === 'PASSWORD_TOO_SHORT', 'Rejects short new password (< 8 chars) with 400')

    // 7c. Incorrect current password
    const wrongCurPwdReq = { user: testUser, body: { currentPassword: 'WrongOldPassword!', newPassword: 'BrandNewSecurePass2026!' } }
    const wrongCurPwdRes = createMockRes()
    await updatePassword(wrongCurPwdReq, wrongCurPwdRes)
    assert(wrongCurPwdRes.statusCode === 401 && wrongCurPwdRes.data.code === 'INCORRECT_CURRENT_PASSWORD', 'Rejects incorrect current password with 401')

    // 7d. Successful password update
    const newSecurePassword = 'BrandNewSecurePass2026!'
    const validPwdReq = { user: testUser, body: { currentPassword: testPassword, newPassword: newSecurePassword } }
    const validPwdRes = createMockRes()
    await updatePassword(validPwdReq, validPwdRes)
    assert(validPwdRes.statusCode === 200, 'Successfully updates password with valid current credentials (200)')

    // Verify new password works with bcrypt and old password fails
    const updatedUserWithHash = await User.findById(testUser._id).select('+passwordHash')
    const newPassWorks = await comparePassword(newSecurePassword, updatedUserWithHash.passwordHash)
    const oldPassFails = await comparePassword(testPassword, updatedUserWithHash.passwordHash)
    assert(newPassWorks === true && oldPassFails === false, 'Database password hash successfully transitioned to new bcrypt hash')

    // Cleanup test user
    await User.deleteOne({ email: testEmail })

    console.log('\n' + '='.repeat(70))
    console.log(`🎉 AUTHENTICATION TEST SUMMARY: ${passed} passed, ${failed} failed`)
    console.log('='.repeat(70) + '\n')

    await mongoose.connection.close(false)
    process.exit(failed > 0 ? 1 : 0)
  } catch (err) {
    console.error('\n❌ Unexpected error running auth tests:', err)
    if (connection) await mongoose.connection.close(false)
    process.exit(1)
  }
}

runAuthTests()
