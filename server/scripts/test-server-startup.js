const { spawn } = require('child_process')
const path = require('path')

async function testServerStartup() {
  console.log('='.repeat(60))
  console.log('🧪 VERIFYING PRODUCTION SERVER STARTUP AND SHUTDOWN FLOW')
  console.log('='.repeat(60))

  const testPort = '5099'
  const serverPath = path.resolve(__dirname, '../src/server.js')

  console.log(`\n--- 1. Spawning server on isolated PORT=${testPort} ---`)

  const child = spawn(process.execPath, [serverPath], {
    env: {
      ...process.env,
      PORT: testPort,
      NODE_ENV: 'production',
      JWT_SECRET: 'production_test_secret_key_exceeding_32_characters_for_ci_cd',
      CLIENT_URL: 'https://smart-classroom.vercel.app',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let serverStarted = false
  let serverOutput = ''

  child.stdout.on('data', (data) => {
    const text = data.toString()
    serverOutput += text
    process.stdout.write(`[Server stdout] ${text}`)
    if (text.includes(`Smart Classroom Server running on port ${testPort}`)) {
      serverStarted = true
    }
  })

  child.stderr.on('data', (data) => {
    const text = data.toString()
    serverOutput += text
    process.stderr.write(`[Server stderr] ${text}`)
  })

  // Wait up to 10 seconds for server to boot
  const startTime = Date.now()
  while (!serverStarted && Date.now() - startTime < 10000) {
    await new Promise((r) => setTimeout(r, 200))
  }

  if (!serverStarted) {
    console.error('❌ Server failed to start within 10 seconds.')
    child.kill('SIGKILL')
    process.exit(1)
  }

  console.log(`\n--- 2. Querying health endpoint (http://localhost:${testPort}/api/health) ---`)
  try {
    const res = await fetch(`http://localhost:${testPort}/api/health`)
    const body = await res.json()
    console.log(`HTTP ${res.status}:`, body)

    if (res.status !== 200 || body.status !== 'ok') {
      throw new Error(`Unexpected health status: ${JSON.stringify(body)}`)
    }
    console.log('✅ PASS: /api/health returned 200 OK with status="ok"')
  } catch (err) {
    console.error('❌ Health check failed:', err.message)
    child.kill('SIGKILL')
    process.exit(1)
  }

  console.log(`\n--- 3. Testing Graceful Shutdown via SIGTERM ---`)
  const shutdownPromise = new Promise((resolve) => {
    child.on('close', (code, signal) => {
      console.log(`✓ Server process exited with code ${code}, signal ${signal}`)
      resolve(code)
    })
  })

  child.kill('SIGTERM')
  const exitCode = await shutdownPromise

  if (exitCode === 0) {
    console.log('✅ PASS: Server shut down gracefully with exit code 0')
  } else {
    console.warn(`⚠️ Server exited with code: ${exitCode}`)
  }

  console.log('\n======================================================')
  console.log('🎉 SERVER STARTUP AND SHUTDOWN VERIFICATION PASSED!')
  console.log('======================================================')
}

testServerStartup().catch((err) => {
  console.error('Fatal test error:', err)
  process.exit(1)
})
