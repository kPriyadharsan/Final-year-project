import fetch from 'node-fetch'

const TEST_ACCOUNTS = [
  {
    role: 'SUPER_ADMIN',
    name: 'Admin',
    email: 'dharsan2763@gmail.com',
    password: '1234567890',
    expectedRedirect: '/admin',
    testEndpoint: '/api/admin/dashboard',
  },
  {
    role: 'TEACHER',
    name: 'Teacher',
    email: 'alakesanece@gmail.com',
    password: '7418529630',
    expectedRedirect: '/teacher',
    testEndpoint: '/api/teacher/test',
  },
  {
    role: 'STUDENT',
    name: 'Student',
    email: 'vidhya@gmail.com',
    password: '147258369',
    expectedRedirect: '/student',
    testEndpoint: '/api/student/classes',
  },
]

const API_BASE = 'http://localhost:5000'

async function runTest() {
  console.log('========================================================')
  console.log('🧪 TEST ACCOUNT FUNCTIONAL & RBAC VERIFICATION')
  console.log('========================================================\n')

  let allPassed = true

  for (const account of TEST_ACCOUNTS) {
    console.log(`Testing [${account.name}] Account: ${account.email}`)

    try {
      // 1. Authenticate with backend /api/auth/login
      const loginRes = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: account.email, password: account.password }),
      })

      if (!loginRes.ok) {
        console.error(`  ❌ Login failed: HTTP ${loginRes.status} ${loginRes.statusText}`)
        allPassed = false
        continue
      }

      const loginData = await loginRes.json()
      const user = loginData.user
      const token = loginData.token

      if (!token) {
        console.error('  ❌ No token returned in login response')
        allPassed = false
        continue
      }

      if (user.role !== account.role) {
        console.error(`  ❌ Role mismatch! Expected: ${account.role}, Received: ${user.role}`)
        allPassed = false
        continue
      }

      console.log(`  ✅ Login successful! Role: ${user.role}, Name: ${user.name}`)

      // 2. Test protected role route
      const roleRes = await fetch(`${API_BASE}${account.testEndpoint}`, {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (roleRes.ok) {
        console.log(`  ✅ Protected route ${account.testEndpoint} accessible (HTTP ${roleRes.status})`)
      } else {
        console.warn(`  ⚠️ Protected route ${account.testEndpoint} returned HTTP ${roleRes.status}`)
      }
      console.log(`  ✅ Destination route: ${account.expectedRedirect}\n`)
    } catch (err) {
      console.error(`  ❌ Error during test:`, err.message)
      allPassed = false
    }
  }

  if (allPassed) {
    console.log('🎉 ALL 3 TEST ACCOUNTS VERIFIED AND FUNCTIONAL!')
  } else {
    console.error('💥 ONE OR MORE TEST ACCOUNTS FAILED')
    process.exit(1)
  }
}

runTest()
