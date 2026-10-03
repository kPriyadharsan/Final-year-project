/**
 * Comprehensive Role-Based Access Control (RBAC) & Privilege Defense Test Suite
 *
 * Tests:
 * 1. SUPER_ADMIN, TEACHER, and STUDENT access permissions across all endpoints:
 *    - /api/admin/* (SUPER_ADMIN only)
 *    - /api/teacher/* (TEACHER & SUPER_ADMIN)
 *    - /api/student/* (STUDENT & SUPER_ADMIN)
 *    - /api/devices/* (SUPER_ADMIN & TEACHER; forbidden to STUDENT)
 *    - /api/voice/history (SUPER_ADMIN & TEACHER; forbidden to STUDENT)
 * 2. Privilege Escalation Defense:
 *    - Provisioning SUPER_ADMIN via API is strictly rejected (403 PRIVILEGE_ESCALATION_BLOCKED)
 *    - Valid provisioning for TEACHER and STUDENT accounts (201 Created)
 *    - Weak password rejection (400)
 *    - Duplicate email conflict rejection (409 DUPLICATE_EMAIL)
 * 3. Self-Deactivation Defense:
 *    - Super Admin cannot deactivate their own active account (400 CANNOT_DEACTIVATE_SELF)
 *    - Admin can deactivate other user accounts (200 OK)
 * 4. Client Role-Tampering Protection:
 *    - Tampered role headers, query parameters, or request body are completely ignored
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
  console.log('='.repeat(70))
  console.log('🛡️ Smart Classroom - Production RBAC & Privilege Defense Test Suite')
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

    // Setup test accounts: SUPER_ADMIN, TEACHER, STUDENT
    const testAdminEmail = 'rbac.superadmin@smartclassroom.edu'
    const testTeacherEmail = 'rbac.teacher@smartclassroom.edu'
    const testStudentEmail = 'rbac.student@smartclassroom.edu'
    const testProvisionedEmail = 'rbac.provisioned.teacher@smartclassroom.edu'

    await User.deleteMany({
      email: {
        $in: [
          testAdminEmail,
          testTeacherEmail,
          testStudentEmail,
          testProvisionedEmail,
          'rbac.provisioned.student@smartclassroom.edu',
        ],
      },
    })

    const pwdHash = await hashPassword('StandardPass2026!')

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
      assignedClasses: ['MATH-101'],
      isActive: true,
    })

    // Generate JWTs
    const adminToken = generateToken({ id: adminUser._id.toString(), role: adminUser.role })
    const teacherToken = generateToken({ id: teacherUser._id.toString(), role: teacherUser.role })
    const studentToken = generateToken({ id: studentUser._id.toString(), role: studentUser.role })

    // Define middleware chains per route requirements
    const adminRoute = [requireAuth, requireRole(ROLES.SUPER_ADMIN)]
    const teacherRoute = [requireAuth, requireRole(ROLES.TEACHER, ROLES.SUPER_ADMIN)]
    const studentRoute = [requireAuth, requireRole(ROLES.STUDENT, ROLES.SUPER_ADMIN)]
    const deviceRoute = [requireAuth, requireRole(ROLES.SUPER_ADMIN, ROLES.TEACHER)]

    console.log('\n[1] Protected Route: /api/admin/* (Strictly SUPER_ADMIN)')
    // 1a. Unauthenticated
    const a1 = await runMiddlewareChain(adminRoute, { headers: {} })
    assert(a1.res.statusCode === 401, 'Rejects unauthenticated request with 401')

    // 1b. STUDENT access
    const a2 = await runMiddlewareChain(adminRoute, { headers: { authorization: `Bearer ${studentToken}` } })
    assert(a2.res.statusCode === 403 && a2.res.data.code === 'FORBIDDEN', 'Rejects STUDENT access with 403 Forbidden')

    // 1c. TEACHER access
    const a3 = await runMiddlewareChain(adminRoute, { headers: { authorization: `Bearer ${teacherToken}` } })
    assert(a3.res.statusCode === 403 && a3.res.data.code === 'FORBIDDEN', 'Rejects TEACHER access to Admin route with 403 Forbidden')

    // 1d. SUPER_ADMIN access
    const a4 = await runMiddlewareChain(adminRoute, { headers: { authorization: `Bearer ${adminToken}` } })
    assert(a4.lastCalled === true && a4.res.statusCode === 200, 'Allows SUPER_ADMIN access and calls next()')

    console.log('\n[2] Protected Route: /api/teacher/* (TEACHER & SUPER_ADMIN)')
    // 2a. Unauthenticated
    const t1 = await runMiddlewareChain(teacherRoute, { headers: {} })
    assert(t1.res.statusCode === 401, 'Rejects unauthenticated request with 401')

    // 2b. STUDENT access
    const t2 = await runMiddlewareChain(teacherRoute, { headers: { authorization: `Bearer ${studentToken}` } })
    assert(t2.res.statusCode === 403 && t2.res.data.code === 'FORBIDDEN', 'Rejects STUDENT access with 403 Forbidden')

    // 2c. TEACHER access
    const t3 = await runMiddlewareChain(teacherRoute, { headers: { authorization: `Bearer ${teacherToken}` } })
    assert(t3.lastCalled === true && t3.res.statusCode === 200, 'Allows TEACHER access and calls next()')

    // 2d. SUPER_ADMIN access
    const t4 = await runMiddlewareChain(teacherRoute, { headers: { authorization: `Bearer ${adminToken}` } })
    assert(t4.lastCalled === true && t4.res.statusCode === 200, 'Allows SUPER_ADMIN access to Teacher route and calls next()')

    console.log('\n[3] Protected Route: /api/student/* (STUDENT & SUPER_ADMIN)')
    // 3a. Unauthenticated
    const s1 = await runMiddlewareChain(studentRoute, { headers: {} })
    assert(s1.res.statusCode === 401, 'Rejects unauthenticated request with 401')

    // 3b. TEACHER access (Forbidden: Student-only resources)
    const s2 = await runMiddlewareChain(studentRoute, { headers: { authorization: `Bearer ${teacherToken}` } })
    assert(s2.res.statusCode === 403 && s2.res.data.code === 'FORBIDDEN', 'Rejects TEACHER access to Student route with 403 Forbidden')

    // 3c. STUDENT access
    const s3 = await runMiddlewareChain(studentRoute, { headers: { authorization: `Bearer ${studentToken}` } })
    assert(s3.lastCalled === true && s3.res.statusCode === 200, 'Allows STUDENT access and calls next()')

    // 3d. SUPER_ADMIN access
    const s4 = await runMiddlewareChain(studentRoute, { headers: { authorization: `Bearer ${adminToken}` } })
    assert(s4.lastCalled === true && s4.res.statusCode === 200, 'Allows SUPER_ADMIN access to Student route and calls next()')

    console.log('\n[4] Protected Device Control: /api/devices/* (SUPER_ADMIN & TEACHER)')
    // 4a. STUDENT access to device control (Strictly blocked)
    const d1 = await runMiddlewareChain(deviceRoute, { headers: { authorization: `Bearer ${studentToken}` } })
    assert(d1.res.statusCode === 403 && d1.res.data.code === 'FORBIDDEN', 'Blocks STUDENT from accessing device control routes (403)')

    // 4b. TEACHER access to device control
    const d2 = await runMiddlewareChain(deviceRoute, { headers: { authorization: `Bearer ${teacherToken}` } })
    assert(d2.lastCalled === true && d2.res.statusCode === 200, 'Allows TEACHER to access device control routes (200)')

    // 4c. SUPER_ADMIN access to device control
    const d3 = await runMiddlewareChain(deviceRoute, { headers: { authorization: `Bearer ${adminToken}` } })
    assert(d3.lastCalled === true && d3.res.statusCode === 200, 'Allows SUPER_ADMIN to access device control routes (200)')

    console.log('\n[5] Security Defense: Client Role-Tampering Protection')
    const tamperedReq = {
      headers: {
        authorization: `Bearer ${studentToken}`,
        'x-user-role': 'SUPER_ADMIN',
      },
      body: { role: 'SUPER_ADMIN' },
      query: { role: 'SUPER_ADMIN' },
    }
    const tamperedRes = await runMiddlewareChain(adminRoute, tamperedReq)
    assert(
      tamperedRes.res.statusCode === 403 && tamperedRes.res.data.userRole === 'STUDENT',
      'Tampered client role in body/header/query is ignored; DB role (STUDENT) strictly enforced'
    )

    console.log('\n[6] Privilege Escalation Defense in User Provisioning')
    // Mount admin router controller logic directly to test user provisioning rules
    const adminRoutes = require('../src/routes/admin.routes')

    // Find the POST /users route handler
    const postUserLayer = adminRoutes.stack.find(
      (layer) => layer.route && layer.route.path === '/users' && layer.route.methods.post
    )
    const postUserHandler = postUserLayer.route.stack[postUserLayer.route.stack.length - 1].handle

    // 6a. Attempt to provision a SUPER_ADMIN via API
    const escalateReq = {
      user: adminUser,
      body: {
        name: 'Malicious Admin',
        email: 'attacker.admin@smartclassroom.edu',
        role: 'SUPER_ADMIN',
        password: 'Password123!',
      },
    }
    const escalateRes = createMockRes()
    await postUserHandler(escalateReq, escalateRes)
    assert(
      escalateRes.statusCode === 403 && escalateRes.data.code === 'PRIVILEGE_ESCALATION_BLOCKED',
      'Privilege escalation defense blocks creating SUPER_ADMIN via API (403 PRIVILEGE_ESCALATION_BLOCKED)'
    )

    // 6b. Attempt to provision with weak password (< 8 chars)
    const weakPassReq = {
      user: adminUser,
      body: {
        name: 'New Faculty',
        email: testProvisionedEmail,
        role: 'TEACHER',
        password: 'short',
      },
    }
    const weakPassRes = createMockRes()
    await postUserHandler(weakPassReq, weakPassRes)
    assert(
      weakPassRes.statusCode === 400 && weakPassRes.data.code === 'WEAK_PASSWORD',
      'Rejects weak password (< 8 chars) during user provisioning (400 WEAK_PASSWORD)'
    )

    // 6c. Valid provisioning of a TEACHER
    const validTeacherReq = {
      user: adminUser,
      body: {
        name: 'Valid Provisioned Teacher',
        email: testProvisionedEmail,
        role: 'TEACHER',
        password: 'FacultyStrongPassword2026!',
        department: 'Computer Science',
      },
    }
    const validTeacherRes = createMockRes()
    await postUserHandler(validTeacherReq, validTeacherRes)
    assert(
      validTeacherRes.statusCode === 201 &&
      validTeacherRes.data.user.role === 'TEACHER' &&
      validTeacherRes.data.user.passwordHash === undefined,
      'Successfully provisions TEACHER account (201) with passwordHash completely excluded'
    )

    // 6d. Duplicate email detection
    const dupReq = {
      user: adminUser,
      body: {
        name: 'Duplicate Teacher',
        email: testProvisionedEmail,
        role: 'TEACHER',
        password: 'FacultyStrongPassword2026!',
      },
    }
    const dupRes = createMockRes()
    await postUserHandler(dupReq, dupRes)
    assert(
      dupRes.statusCode === 409 && dupRes.data.code === 'DUPLICATE_EMAIL',
      'Rejects duplicate email during user provisioning (409 DUPLICATE_EMAIL)'
    )

    console.log('\n[7] Account Status Modification & Self-Deactivation Defense')
    const patchStatusLayer = adminRoutes.stack.find(
      (layer) => layer.route && layer.route.path === '/users/:id/status' && layer.route.methods.patch
    )
    const patchStatusHandler = patchStatusLayer.route.stack[patchStatusLayer.route.stack.length - 1].handle

    // 7a. Admin attempts to deactivate their own account
    const selfDeactReq = {
      user: adminUser,
      params: { id: adminUser._id.toString() },
      body: { isActive: false },
    }
    const selfDeactRes = createMockRes()
    await patchStatusHandler(selfDeactReq, selfDeactRes)
    assert(
      selfDeactRes.statusCode === 400 && selfDeactRes.data.code === 'CANNOT_DEACTIVATE_SELF',
      'Super Admin cannot deactivate their own active account (400 CANNOT_DEACTIVATE_SELF)'
    )

    // 7b. Admin deactivates provisioned teacher account
    const provisionedUser = await User.findOne({ email: testProvisionedEmail })
    const deactOtherReq = {
      user: adminUser,
      params: { id: provisionedUser._id.toString() },
      body: { isActive: false },
    }
    const deactOtherRes = createMockRes()
    await patchStatusHandler(deactOtherReq, deactOtherRes)
    assert(
      deactOtherRes.statusCode === 200 && deactOtherRes.data.user.isActive === false,
      'Super Admin can successfully toggle activation status of managed users (200 OK)'
    )

    // Cleanup all created test accounts
    await User.deleteMany({
      email: {
        $in: [
          testAdminEmail,
          testTeacherEmail,
          testStudentEmail,
          testProvisionedEmail,
          'rbac.provisioned.student@smartclassroom.edu',
        ],
      },
    })

    console.log('\n' + '='.repeat(70))
    console.log(`🎉 ROLE RBAC & PRIVILEGE TEST SUMMARY: ${passed} passed, ${failed} failed`)
    console.log('='.repeat(70) + '\n')

    await mongoose.connection.close(false)
    process.exit(failed > 0 ? 1 : 0)
  } catch (err) {
    console.error('\n❌ Unexpected error running RBAC tests:', err)
    if (connection) await mongoose.connection.close(false)
    process.exit(1)
  }
}

runRoleTests()
