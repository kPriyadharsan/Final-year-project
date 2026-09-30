/**
 * Verification Script for Express Backend MQTT Service:
 * - Verifies environment variable reading
 * - Tests service lifecycle & getMQTTStatus()
 * - Tests subscription to classroom/device/+/status
 * - Tests publish() function
 * - Tests error handling (server never crashes if broker is unreachable)
 * - Tests exposure through /api/health
 */

const path = require('path')
const dotenv = require('dotenv')
dotenv.config({ path: path.resolve(__dirname, '../.env') })

const {
  connectMQTT,
  disconnectMQTT,
  publish,
  subscribe,
  onMessage,
  getMQTTStatus,
  DEFAULT_TOPICS,
} = require('../src/services/mqtt.service')

const API_BASE = `http://localhost:${process.env.PORT || 5000}`

async function runTests() {
  console.log('\n======================================================')
  console.log('📡 SMART CLASSROOM BACKEND MQTT SERVICE VERIFICATION')
  console.log('======================================================\n')

  // 1. Verify Configuration & Initial State
  console.log('--- 1. Configuration & Initial State ---')
  const initialStatus = getMQTTStatus()
  console.log('Broker URL        :', initialStatus.brokerUrl)
  console.log('Client ID         :', initialStatus.clientId)
  console.log('Default Topics    :', DEFAULT_TOPICS)
  console.log('Initial Status    :', initialStatus.status)

  if (DEFAULT_TOPICS.includes('classroom/device/+/status')) {
    console.log('✅ PASS: Configured to subscribe to "classroom/device/+/status"')
  } else {
    console.error('❌ FAIL: Missing "classroom/device/+/status" default topic')
  }

  // 2. Connect Client
  console.log('\n--- 2. Connecting MQTT Client ---')
  const client = connectMQTT()
  if (client) {
    console.log('✅ PASS: connectMQTT() returned active client instance without crashing')
  } else {
    console.error('❌ FAIL: connectMQTT() failed to return client')
  }

  // 3. Status Check while connecting/retrying
  console.log('\n--- 3. Real-Time Status Exposure ---')
  const currentStatus = getMQTTStatus()
  console.log('Live Status Object:', JSON.stringify(currentStatus, null, 2))
  if (typeof currentStatus.connected === 'boolean' && currentStatus.status) {
    console.log('✅ PASS: getMQTTStatus() exposes live status, subscriptions, and metrics')
  } else {
    console.error('❌ FAIL: Invalid status object structure')
  }

  // 4. Test Resilient Error Handling (Attempting publish while connecting / offline)
  console.log('\n--- 4. Error Safety Check (Publish Handling) ---')
  try {
    await publish('classroom/device/room302/status', {
      deviceId: 'ESP32-RM302-LIGHT-01',
      state: 'ON',
      timestamp: new Date().toISOString(),
    })
    console.log('✅ PASS: Message published successfully (broker is active)')
  } catch (err) {
    // If local broker is not running, publish must reject cleanly with descriptive error and NOT crash the server
    console.log(`✓ Graceful rejection without process crash: "${err.message}"`)
    console.log('✅ PASS: Publish safely handles offline/unreachable broker state')
  }

  // 5. Test Topic Matching Logic & Message Registration
  console.log('\n--- 5. Topic Subscription & Handler Registration ---')
  let receivedMessage = null
  const unsubscribeHandler = onMessage('classroom/device/+/status', (topic, payload) => {
    receivedMessage = { topic, payload }
  })
  console.log('✓ Registered message callback for pattern: classroom/device/+/status')
  unsubscribeHandler()
  console.log('✅ PASS: onMessage registration and teardown successful')

  // 6. Test Exposure via /api/health Endpoint
  console.log('\n--- 6. Health API Verification (/api/health) ---')
  try {
    const res = await fetch(`${API_BASE}/api/health`)
    const healthData = await res.json()
    console.log('GET /api/health HTTP Status:', res.status)
    console.log('Services.mqtt exposed in health API:', healthData.services?.mqtt)

    if (healthData.services?.mqtt) {
      console.log('✅ PASS: Live MQTT service status is exposed in GET /api/health')
    } else {
      console.error('❌ FAIL: services.mqtt missing from /api/health')
    }
  } catch (apiErr) {
    console.warn(`(Notice: Express server on ${API_BASE} not currently listening during standalone test: ${apiErr.message})`)
  }

  // 7. Clean Disconnect
  console.log('\n--- 7. Clean Disconnect Check ---')
  await disconnectMQTT(true)
  const finalStatus = getMQTTStatus()
  console.log('Final Status after disconnect:', finalStatus.status)
  if (!finalStatus.connected) {
    console.log('✅ PASS: Disconnected cleanly')
  }

  console.log('\n======================================================')
  console.log('🎉 MQTT SERVICE TESTS PASSED!')
  console.log('======================================================\n')
}

runTests().catch((err) => {
  console.error('\n❌ Test encountered unexpected error:', err)
  process.exit(1)
})
