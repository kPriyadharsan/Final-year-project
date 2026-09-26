/**
 * Role-Based Access Control (RBAC) Test Suite
 *
 * Tests:
 * 1. requireAuth + requireRole(ROLES.SUPER_ADMIN) on /api/admin/test
 * 2. requireAuth + requireRole(ROLES.TEACHER, ROLES.SUPER_ADMIN) on /api/teacher/test
 * 3. Verified access for SUPER_ADMIN, TEACHER, and restriction on STUDENT
 * 4. Client role-tampering defense (verifying role is strictly loaded from authenticated JWT user)
 *
 * Run with: npm run test:roles
 */
const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '../.env') })
const mongoose = require('mongoose')
const { User, ROLES } = require('../src/models/User')
const { hashPassword } = require('../src/utils/password.util')
const { generateToken } = require('../src/utils/jwt.util')
const { requireAuth, requireRole } = require('../src/middleware/auth.middleware')

async function runRoleTests() {
  console.log('='.repeat(68))
  console.log('🛡️ Smart Classroom - Role-Based Authorization Test Suite')
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

  // Execute middleware chain helper
  const runMiddlewareChain = async (middlewares, req) => {
    const res = createMockRes()
    let currentIndex = 0
    let lastCalled = false

    const next = async () => {
      currentIndex++
      if (currentIndex < middlewares.length) {
        await middlewares[currentIndex](req, res, next)
      } else {
        lastCalled = true
      }
    }

    if (middlewares.length > 0) {
      await middlewares[0](req, res, next)
    }

    return { res, lastCalled }
  }

  let connection
  try {
    connection = await mongoose.connect(mongoURI, { serverSelectionTimeoutMS: 5000 })

    // Setup 3 test accounts: SUPER_ADMIN, TEACHER, STUDENT
    const testAdminEmail = 'rbac.admin@smartclassroom.edu'
    const testTeacherEmail = 'rbac.teacher@smartclassroom.edu'
    const testStudentEmail = 'rbac.student@smartclassroom.edu'

    await User.deleteMany({
      email: { $in: [testAdminEmail, testTeacherEmail, testStudentEmail] },
    })

    const pwdHash = await hashPassword('SampleSecure123!')

    const adminUser = await User.create({
      name: 'RBAC Super Admin',
      email: testAdminEmail,
      passwordHash: pwdHash,
      role: ROLES.SUPER_ADMIN,
      isActive: true,
    })

    const teacherUser = await User.create({
      name: 'RBAC Teacher',
      email: testTeacherEmail,
      passwordHash: pwdHash,
      role: ROLES.TEACHER,
      department: 'Mathematics',
      isActive: true,
    })

    const studentUser = await User.create({
      name: 'RBAC Student',
      email: testStudentEmail,
      passwordHash: pwdHash,
      role: ROLES.STUDENT,
      isActive: true,
    })

    // Generate JWTs
    const adminToken = generateToken({ id: adminUser._id.toString(), role: adminUser.role })
    const teacherToken = generateToken({ id: teacherUser._id.toString(), role: teacherUser.role })
    const studentToken = generateToken({ id: studentUser._id.toString(), role: studentUser.role })

    console.log('\n[1] Protected Route: GET /api/admin/test (SUPER_ADMIN only)')
    const adminMiddleware = [requireAuth, requireRole(ROLES.SUPER_ADMIN)]

    // 1a. Unauthenticated access
    const noTokenRes = await runMiddlewareChain(adminMiddleware, { headers: {} })
    assert(noTokenRes.res.statusCode === 401, 'Rejects unauthenticated request with 401')

    // 1b. STUDENT access
    const studentAdminRes = await runMiddlewareChain(adminMiddleware, {
      headers: { authorization: `Bearer ${studentToken}` },
    })
    assert(
      studentAdminRes.res.statusCode === 403 && studentAdminRes.res.data.code === 'FORBIDDEN',
      'Rejects STUDENT access with 403 Forbidden'
    )

    // 1c. TEACHER access
    const teacherAdminRes = await runMiddlewareChain(adminMiddleware, {
      headers: { authorization: `Bearer ${teacherToken}` },
    })
    assert(
      teacherAdminRes.res.statusCode === 403 && teacherAdminRes.res.data.code === 'FORBIDDEN',
      'Rejects TEACHER access to Admin route with 403 Forbidden'
    )

    // 1d. SUPER_ADMIN access
    const adminAdminRes = await runMiddlewareChain(adminMiddleware, {
      headers: { authorization: `Bearer ${adminToken}` },
    })
    assert(
      adminAdminRes.lastCalled === true && adminAdminRes.res.statusCode === 200,
      'Allows SUPER_ADMIN access and calls next()'
    )

    console.log('\n[2] Protected Route: GET /api/teacher/test (TEACHER & SUPER_ADMIN)')
    const teacherMiddleware = [requireAuth, requireRole(ROLES.TEACHER, ROLES.SUPER_ADMIN)]

    // 2a. Unauthenticated access
    const teacherNoTokenRes = await runMiddlewareChain(teacherMiddleware, { headers: {} })
    assert(teacherNoTokenRes.res.statusCode === 401, 'Rejects unauthenticated request with 401')

    // 2b. STUDENT access
    const studentTeacherRes = await runMiddlewareChain(teacherMiddleware, {
      headers: { authorization: `Bearer ${studentToken}` },
    })
    assert(
      studentTeacherRes.res.statusCode === 403 && studentTeacherRes.res.data.code === 'FORBIDDEN',
      'Rejects STUDENT access with 403 Forbidden'
    )

    // 2c. TEACHER access
    const teacherTeacherRes = await runMiddlewareChain(teacherMiddleware, {
      headers: { authorization: `Bearer ${teacherToken}` },
    })
    assert(
      teacherTeacherRes.lastCalled === true && teacherTeacherRes.res.statusCode === 200,
      'Allows TEACHER access and calls next()'
    )

    // 2d. SUPER_ADMIN access
    const adminTeacherRes = await runMiddlewareChain(teacherMiddleware, {
      headers: { authorization: `Bearer ${adminToken}` },
    })
    assert(
      adminTeacherRes.lastCalled === true && adminTeacherRes.res.statusCode === 200,
      'Allows SUPER_ADMIN access to Teacher route and calls next()'
    )

    console.log('\n[3] Security Test: Frontend Role-Tampering Protection')
    // A malicious student or teacher sends "role: SUPER_ADMIN" in request body or query or headers
    const tamperedReq = {
      headers: {
        authorization: `Bearer ${studentToken}`,
        'x-user-role': 'SUPER_ADMIN',
      },
      body: { role: 'SUPER_ADMIN' },
      query: { role: 'SUPER_ADMIN' },
    }
    const tamperedRes = await runMiddlewareChain(adminMiddleware, tamperedReq)
    assert(
      tamperedRes.res.statusCode === 403 && tamperedRes.res.data.userRole === 'STUDENT',
      'Tampered client role is completely ignored; authenticated database role (STUDENT) enforced with 403'
    )

    // Cleanup test accounts
    await User.deleteMany({
      email: { $in: [testAdminEmail, testTeacherEmail, testStudentEmail] },
    })

    console.log('\n' + '='.repeat(68))
    console.log(`🎉 ROLE RBAC TEST SUMMARY: ${passed} passed, ${failed} failed`)
    console.log('='.repeat(68) + '\n')

    await mongoose.connection.close(false)
    process.exit(failed > 0 ? 1 : 0)
  } catch (err) {
    console.error('\n❌ Unexpected error running RBAC tests:', err)
    if (connection) await mongoose.connection.close(false)
    process.exit(1)
  }
}

runRoleTests()
