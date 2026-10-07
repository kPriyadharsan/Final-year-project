/**
 * Comprehensive Automated Verification Suite for Temporary QR-Based Demo Authentication
 * Tests all 12 behaviors:
 * 1. Normal login functionality (untouched)
 * 2. Unauthorized access checks on admin demo endpoints
 * 3. Super Admin demo QR generation
 * 4. Token hash security (plaintext secret not stored in MongoDB, never returned)
 * 5. Demo status inspection
 * 6. Student login via demo token
 * 7. Student access to protected endpoints & RBAC enforcement
 * 8. Super Admin global demo reset
 * 9. Old student session instant invalidation via generation check
 * 10. Old QR token rejection
 * 11. New QR token login & session functionality
 * 12. Normal login operational after reset
 */

const crypto = require('crypto')
const mongoose = require('mongoose')
const env = require('../src/config/env')
const { User, ROLES } = require('../src/models/User')
const { DemoSession, DEMO_STATUS } = require('../src/models/DemoSession')
const { DemoState } = require('../src/models/DemoState')

const API_BASE = `http://localhost:${env.PORT}`

let passedTests = 0
let failedTests = 0

function assert(condition, testName, failureDetails = '') {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`)
    passedTests++
  } else {
    console.error(`  ❌ FAIL: ${testName}`)
    if (failureDetails) console.error(`     Details: ${failureDetails}`)
    failedTests++
  }
}

async function request(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  }

  const response = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  })

  let data
  try {
    data = await response.json()
  } catch {
    data = null
  }

  return { status: response.status, ok: response.ok, data }
}

async function runTests() {
  console.log('\n======================================================================')
  console.log(' 🧪 TEMPORARY QR DEMO AUTHENTICATION SUITE')
  console.log('======================================================================\n')

  await mongoose.connect(env.MONGODB_URI)

  // 1. Normal Login Test
  console.log('▶ [1/10] Verifying Normal Authentication (Must be 100% operational)...')
  const adminLoginRes = await request('/api/auth/login', {
    method: 'POST',
    body: {
      email: 'admin@smartclassroom.edu',
      password: 'SuperAdminSecure2026!',
    },
  })

  assert(
    adminLoginRes.status === 200 && adminLoginRes.data?.token,
    'Normal Super Admin login succeeds with email/password',
    JSON.stringify(adminLoginRes.data)
  )

  const adminToken = adminLoginRes.data?.token
  const adminHeaders = { Authorization: `Bearer ${adminToken}` }

  // 2. Unauthorized Access Controls
  console.log('\n▶ [2/10] Verifying RBAC on Demo Management Endpoints...')
  const noAuthRes = await request('/api/auth/demo/generate', { method: 'POST' })
  assert(
    noAuthRes.status === 401 && noAuthRes.data?.code === 'TOKEN_MISSING',
    'Unauthenticated POST /api/auth/demo/generate rejected with 401 TOKEN_MISSING'
  )

  const noAuthStatusRes = await request('/api/auth/demo/status', { method: 'GET' })
  assert(
    noAuthStatusRes.status === 401 && noAuthStatusRes.data?.code === 'TOKEN_MISSING',
    'Unauthenticated GET /api/auth/demo/status rejected with 401'
  )

  // 3. Super Admin Generates Demo QR
  console.log('\n▶ [3/10] Testing Super Admin QR Generation (POST /api/auth/demo/generate)...')
  const genRes = await request('/api/auth/demo/generate', {
    method: 'POST',
    headers: adminHeaders,
  })

  assert(
    genRes.status === 200 && genRes.data?.status === 'success',
    'Super Admin successfully generates demo QR',
    JSON.stringify(genRes.data)
  )

  const genData = genRes.data?.data
  assert(!!genData?.token && genData.token.length === 64, 'Generated token is a secure 256-bit hex string')
  assert(!!genData?.qrUrl && genData.qrUrl.includes('/demo-login/'), 'QR URL contains valid demo login link')
  assert(typeof genData?.generation === 'number', `Session has integer generation version (${genData?.generation})`)
  assert(!genData?.tokenHash, 'Security check: Secret tokenHash is NEVER returned in API response')

  const initialToken = genData.token
  const initialGeneration = genData.generation

  // Security Verification in MongoDB: Verify token is hashed
  const expectedHash = crypto.createHash('sha256').update(initialToken).digest('hex')
  const dbSession = await DemoSession.findOne({ tokenHash: expectedHash })
  assert(!!dbSession, 'MongoDB correctly stores SHA-256 hash of token instead of plaintext')
  assert(
    dbSession?.tokenHash !== initialToken,
    'Plaintext token is NOT stored in MongoDB'
  )

  // 4. Status Endpoint Check
  console.log('\n▶ [4/10] Testing Demo Status Inspection (GET /api/auth/demo/status)...')
  const statusRes = await request('/api/auth/demo/status', {
    method: 'GET',
    headers: adminHeaders,
  })

  assert(
    statusRes.status === 200 && statusRes.data?.data?.hasActiveQr === true,
    'Status endpoint confirms active QR credential exists',
    JSON.stringify(statusRes.data)
  )
  assert(
    statusRes.data?.data?.generation === initialGeneration,
    `Status endpoint matches current generation (${initialGeneration})`
  )

  // 5. Student Login via Scanned QR Token
  console.log('\n▶ [5/10] Testing Student Demo Login (POST /api/auth/demo/login)...')
  const studentLoginRes = await request('/api/auth/demo/login', {
    method: 'POST',
    body: { token: initialToken },
  })

  assert(
    studentLoginRes.status === 200 && studentLoginRes.data?.status === 'success',
    'Student successfully logs in using temporary demo QR token',
    JSON.stringify(studentLoginRes.data)
  )

  const studentData = studentLoginRes.data?.data
  const studentToken = studentData?.token
  assert(!!studentToken, 'Student receives authenticated JWT token')
  assert(studentData?.user?.role === 'STUDENT', 'User role is correctly set to STUDENT')
  assert(studentData?.user?.isDemo === true, 'Session is marked as isDemo: true')
  assert(studentData?.user?.authType === 'DEMO_QR', 'Session is tagged with authType: DEMO_QR')
  assert(studentData?.demoGeneration === initialGeneration, 'Session carries matching demoGeneration')

  const studentHeaders = { Authorization: `Bearer ${studentToken}` }

  // 6. Access Protected Student Resources & RBAC Enforcement
  console.log('\n▶ [6/10] Testing Student RBAC & Resource Access...')
  const studentClassesRes = await request('/api/student/classes', {
    method: 'GET',
    headers: studentHeaders,
  })

  assert(
    studentClassesRes.status === 200,
    'Demo student can access student protected routes (/api/student/classes)',
    JSON.stringify(studentClassesRes.data)
  )

  const studentAdminAttempt = await request('/api/auth/demo/reset', {
    method: 'POST',
    headers: studentHeaders,
  })

  assert(
    studentAdminAttempt.status === 403,
    'RBAC enforcement: Demo student is FORBIDDEN (403) from calling admin demo reset'
  )

  // 7. Global Reset Requirement
  console.log('\n▶ [7/10] Testing Global Reset (POST /api/auth/demo/reset)...')
  const resetRes = await request('/api/auth/demo/reset', {
    method: 'POST',
    headers: adminHeaders,
  })

  assert(
    resetRes.status === 200 && resetRes.data?.status === 'success',
    'Super Admin reset succeeds',
    JSON.stringify(resetRes.data)
  )

  const resetData = resetRes.data?.data
  const newGeneration = resetData?.generation
  const newToken = resetData?.token

  assert(
    newGeneration === initialGeneration + 1,
    `Demo generation incremented from ${initialGeneration} to ${newGeneration}`
  )
  assert(
    !!newToken && newToken !== initialToken,
    'Reset generated a completely fresh credential token'
  )

  // 8. Old Student Session Invalidation (CRITICAL REQUIREMENT)
  console.log('\n▶ [8/10] Testing Instant Invalidation of Old Demo Student Sessions...')
  const oldSessionAccessRes = await request('/api/student/classes', {
    method: 'GET',
    headers: studentHeaders, // OLD student token from previous generation
  })

  assert(
    oldSessionAccessRes.status === 401 && oldSessionAccessRes.data?.code === 'DEMO_SESSION_REVOKED',
    'CRITICAL: Old demo student session is INSTANTLY REJECTED with 401 DEMO_SESSION_REVOKED',
    JSON.stringify(oldSessionAccessRes.data)
  )

  // 9. Old QR Token Invalidation
  console.log('\n▶ [9/10] Testing Invalidation of Old QR Token...')
  const oldTokenLoginRes = await request('/api/auth/demo/login', {
    method: 'POST',
    body: { token: initialToken },
  })

  assert(
    oldTokenLoginRes.status === 401,
    `Old QR token rejected with 401 (${oldTokenLoginRes.data?.code})`,
    JSON.stringify(oldTokenLoginRes.data)
  )

  // 10. New QR Token Login & Session Validation
  console.log('\n▶ [10/10] Testing New QR Token Login & Normal Login Continuance...')
  const newLoginRes = await request('/api/auth/demo/login', {
    method: 'POST',
    body: { token: newToken },
  })

  assert(
    newLoginRes.status === 200 && newLoginRes.data?.status === 'success',
    'New QR token login succeeds after reset',
    JSON.stringify(newLoginRes.data)
  )

  const newStudentToken = newLoginRes.data?.data?.token
  const newStudentHeaders = { Authorization: `Bearer ${newStudentToken}` }

  const newSessionAccessRes = await request('/api/student/classes', {
    method: 'GET',
    headers: newStudentHeaders,
  })

  assert(
    newSessionAccessRes.status === 200,
    'New demo student session can access student protected routes successfully'
  )

  // Normal login check again
  const normalLoginCheckRes = await request('/api/auth/login', {
    method: 'POST',
    body: {
      email: 'admin@smartclassroom.edu',
      password: 'SuperAdminSecure2026!',
    },
  })

  assert(
    normalLoginCheckRes.status === 200 && normalLoginCheckRes.data?.token,
    'Normal authentication remains 100% operational throughout'
  )

  // Expiry check with invalid token
  const invalidTokenRes = await request('/api/auth/demo/login', {
    method: 'POST',
    body: { token: 'completely_invalid_random_token_1234567890abcdef' },
  })
  assert(
    invalidTokenRes.status === 401 && invalidTokenRes.data?.code === 'INVALID_DEMO_TOKEN',
    'Unknown or malformed token rejected with 401 INVALID_DEMO_TOKEN'
  )

  await mongoose.disconnect()

  console.log('\n======================================================================')
  console.log(` 🏁 VERIFICATION SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED`)
  console.log('======================================================================\n')

  if (failedTests > 0) {
    process.exit(1)
  }
}

runTests().catch((err) => {
  console.error('Fatal Test Suite Error:', err)
  process.exit(1)
})
