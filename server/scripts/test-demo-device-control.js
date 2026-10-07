/**
 * Verification Script: Demo Student Device Control & CORS Validation
 *
 * Verifies:
 * 1. CORS allows origin: https://smart-classroom-2763.vercel.app
 * 2. Standard STUDENT account is denied access to /api/devices (403 FORBIDDEN / UNAUTHORIZED)
 * 3. DEMO student account (via QR token flow or DEMO_QR authType) CAN:
 *    - GET /api/devices
 *    - POST /api/devices/:id/command
 *    - POST /api/devices/:id/color
 */

const http = require('http')

const BASE_URL = 'http://localhost:5000'

function request(options, bodyData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let rawData = ''
      res.on('data', (chunk) => (rawData += chunk))
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: rawData ? JSON.parse(rawData) : null,
          })
        } catch (e) {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: rawData,
          })
        }
      })
    })

    req.on('error', reject)
    if (bodyData) {
      req.write(typeof bodyData === 'string' ? bodyData : JSON.stringify(bodyData))
    }
    req.end()
  })
}

async function runTests() {
  console.log('====================================================')
  console.log('🧪 RUNNING DEMO STUDENT DEVICE CONTROL & CORS TESTS')
  console.log('====================================================\n')

  let passed = 0
  let failed = 0

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`)
      passed++
    } else {
      console.error(`  ❌ FAIL: ${message}`)
      failed++
    }
  }

  try {
    // 1. CORS Test for https://smart-classroom-2763.vercel.app
    console.log('1. Checking CORS for Vercel domain...')
    const corsRes = await request({
      hostname: 'localhost',
      port: 5000,
      path: '/api/health',
      method: 'GET',
      headers: {
        Origin: 'https://smart-classroom-2763.vercel.app',
      },
    })

    assert(
      corsRes.headers['access-control-allow-origin'] === 'https://smart-classroom-2763.vercel.app',
      `Access-Control-Allow-Origin header returned correctly for Vercel: "${corsRes.headers['access-control-allow-origin']}"`
    )

    // Preflight OPTIONS test
    const preflightRes = await request({
      hostname: 'localhost',
      port: 5000,
      path: '/api/devices',
      method: 'OPTIONS',
      headers: {
        Origin: 'https://smart-classroom-2763.vercel.app',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Authorization,Content-Type',
      },
    })
    assert(
      preflightRes.status === 200 || preflightRes.status === 204,
      `Preflight OPTIONS succeeded with status ${preflightRes.status}`
    )
    assert(
      preflightRes.headers['access-control-allow-origin'] === 'https://smart-classroom-2763.vercel.app',
      `Preflight returned Access-Control-Allow-Origin for Vercel domain`
    )

    // 2. Standard Student Login & Blocked Device Control Check
    console.log('\n2. Testing Standard Student Permissions (Must be blocked)...')
    const stdLoginRes = await request(
      {
        hostname: 'localhost',
        port: 5000,
        path: '/api/auth/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      {
        email: 'student@smartclassroom.edu',
        password: 'studentpassword123',
      }
    )

    let stdToken = stdLoginRes.body?.token
    if (stdToken) {
      const stdDevRes = await request({
        hostname: 'localhost',
        port: 5000,
        path: '/api/devices',
        method: 'GET',
        headers: { Authorization: `Bearer ${stdToken}` },
      })
      assert(
        stdDevRes.status === 403,
        `Standard student is blocked from /api/devices (Status: ${stdDevRes.status})`
      )
    } else {
      console.log('  ⚠️ Skipping standard student login test (default seed student might differ)')
    }

    // 3. Super Admin Generates Demo QR
    console.log('\n3. Testing Demo QR Generation & Student Access...')
    const adminLogin = await request(
      {
        hostname: 'localhost',
        port: 5000,
        path: '/api/auth/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      {
        email: 'admin@smartclassroom.edu',
        password: 'SuperAdminSecure2026!',
      }
    )

    assert(adminLogin.status === 200 && adminLogin.body?.token, 'Admin login succeeded')
    const adminToken = adminLogin.body?.token

    const genRes = await request({
      hostname: 'localhost',
      port: 5000,
      path: '/api/auth/demo/generate',
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    })

    const rawDemoToken = genRes.body?.data?.token
    assert(genRes.status === 200 && !!rawDemoToken, `Admin generated active Demo QR (token length: ${rawDemoToken?.length})`)

    // 4. Demo Student Logs in with rawDemoToken
    console.log('\n4. Demo Student Login via QR Token...')
    const demoLoginRes = await request(
      {
        hostname: 'localhost',
        port: 5000,
        path: '/api/auth/demo/login',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://smart-classroom-2763.vercel.app',
        },
      },
      { token: rawDemoToken }
    )

    const studentData = demoLoginRes.body?.data
    const demoToken = studentData?.token
    assert(demoLoginRes.status === 200 && !!demoToken, 'Demo student authenticated successfully')
    assert(studentData?.user?.role === 'STUDENT', 'User role is STUDENT')
    assert(studentData?.user?.isDemo === true, 'User is flagged as isDemo = true')

    // 5. Demo Student Fetches Devices
    console.log('\n5. Demo Student accessing /api/devices...')
    const demoDevicesRes = await request({
      hostname: 'localhost',
      port: 5000,
      path: '/api/devices?classroom=Room%20302',
      method: 'GET',
      headers: {
        Authorization: `Bearer ${demoToken}`,
        Origin: 'https://smart-classroom-2763.vercel.app',
      },
    })

    assert(demoDevicesRes.status === 200, `Demo student GET /api/devices allowed (Status: ${demoDevicesRes.status})`)
    const devicesList = demoDevicesRes.body?.devices || []
    console.log(`  ℹ️ Found ${devicesList.length} devices in classroom.`)

    // Simulate node online so commands can be delivered
    await request(
      {
        hostname: 'localhost',
        port: 5000,
        path: '/api/devices/ESP32-RM302-01/simulate-status',
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
      },
      { state: 'ON', isOnline: true }
    )

    // 6. Demo Student Controls a Device (e.g. Light or Fan)
    console.log('\n6. Demo Student executing device command (Web Button control)...')
    const targetDev = devicesList.find((d) => ['LIGHT', 'FAN', 'PROJECTOR'].includes(d.type)) || devicesList[0]
    if (targetDev) {
      const devId = targetDev.deviceId || targetDev._id

      // Simulate channel online
      await request(
        {
          hostname: 'localhost',
          port: 5000,
          path: `/api/devices/${encodeURIComponent(devId)}/simulate-status`,
          method: 'POST',
          headers: {
            Authorization: `Bearer ${adminToken}`,
            'Content-Type': 'application/json',
          },
        },
        { state: 'OFF', isOnline: true }
      )
      const cmdRes = await request(
        {
          hostname: 'localhost',
          port: 5000,
          path: `/api/devices/${encodeURIComponent(devId)}/command`,
          method: 'POST',
          headers: {
            Authorization: `Bearer ${demoToken}`,
            'Content-Type': 'application/json',
            Origin: 'https://smart-classroom-2763.vercel.app',
          },
        },
        { action: 'ON' }
      )

      assert(
        cmdRes.status !== 403 && cmdRes.body?.code !== 'UNAUTHORIZED_ROLE',
        `Demo student is NOT blocked by RBAC on device command (Status: ${cmdRes.status}, Code: ${cmdRes.body?.code})`
      )
      assert(
        cmdRes.status === 200 && cmdRes.body?.status === 'success',
        `Demo student executed command on device ${devId}: ${cmdRes.body?.message || cmdRes.status}`
      )
    }

    // 7. Demo Student Controls Projector RGB Color
    console.log('\n7. Demo Student executing Projector Color command...')
    const projDev = devicesList.find((d) => d.type === 'PROJECTOR') || { deviceId: 'ESP32-RM302-PROJ-01' }
    const projId = projDev.deviceId || projDev._id || 'projector'

    const colorRes = await request(
      {
        hostname: 'localhost',
        port: 5000,
        path: `/api/devices/${encodeURIComponent(projId)}/color`,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${demoToken}`,
          'Content-Type': 'application/json',
          Origin: 'https://smart-classroom-2763.vercel.app',
        },
      },
      {
        power: 'ON',
        color: { r: 16, g: 185, b: 129, name: 'Mint Green' },
      }
    )

    assert(
      colorRes.status !== 403 && colorRes.body?.code !== 'UNAUTHORIZED_ROLE',
      `Demo student is NOT blocked by RBAC on color command (Status: ${colorRes.status}, Code: ${colorRes.body?.code})`
    )
    assert(
      colorRes.status === 200 && colorRes.body?.status === 'success',
      `Demo student set Projector color to Mint Green: ${colorRes.body?.message || colorRes.status}`
    )

    console.log('\n====================================================')
    console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`)
    console.log('====================================================\n')

    process.exit(failed > 0 ? 1 : 0)
  } catch (error) {
    console.error('Fatal test error:', error)
    process.exit(1)
  }
}

runTests()
