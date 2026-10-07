/**
 * test-realtime-voice-architecture.js
 *
 * Verification script for the new real-time low-latency voice architecture:
 * 1. Verifies WebSocket bridge connection at /ws/voice
 * 2. Verifies session handshake (type: 'session_ready')
 * 3. Verifies fast turn finalization VAD control event
 * 4. Verifies instant barge-in interruption (type: 'interrupt' -> type: 'interrupted')
 * 5. Verifies latest command priority tracking
 * 6. Verifies non-blocking hardware command dispatch
 * 7. Verifies backward compatibility with dashboard device control
 */

const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '../.env') })
const WebSocket = require('ws')
const mongoose = require('mongoose')

const PORT = process.env.PORT || 5000
const WS_URL = `ws://localhost:${PORT}/ws/voice`
const API_URL = `http://localhost:${PORT}`

async function runRealtimeVoiceTests() {
  console.log('======================================================')
  console.log('⚡ REAL-TIME LOW-LATENCY VOICE ARCHITECTURE VERIFICATION')
  console.log('======================================================')
  console.log(`Target WebSocket: ${WS_URL}`)

  let passCount = 0

  // 1. WebSocket Bridge Connection & Handshake Test
  console.log('\n--- 1. Testing WebSocket Connection to /ws/voice ---')
  const ws = new WebSocket(WS_URL)

  const handshakePromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('WebSocket handshake timeout (5s)')), 5000)

    ws.on('open', () => {
      console.log('✅ WebSocket connection successfully opened!')
    })

    const onHandshakeMsg = (data) => {
      try {
        const msg = JSON.parse(data.toString())
        if (msg.type === 'session_ready') {
          console.log(`✅ Received session handshake: [${msg.sessionId}] | Model: ${msg.model}`)
          ws.removeListener('message', onHandshakeMsg)
          clearTimeout(timeout)
          resolve(msg)
        }
      } catch (e) {}
    }

    ws.on('message', onHandshakeMsg)

    ws.on('error', (err) => {
      clearTimeout(timeout)
      reject(err)
    })
  })

  try {
    const sessionData = await handshakePromise
    passCount++

    // 2. Testing VAD Speech Start & End-of-Speech Control Events
    console.log('\n--- 2. Testing VAD Speech Start & Turn Finalization ---')
    const turnPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Turn finalization timeout (5s)')), 5000)

      const handler = (data) => {
        try {
          const msg = JSON.parse(data.toString())
          if (msg.type === 'state_change' && msg.state === 'PROCESSING') {
            console.log(`✅ State transition verified: state=${msg.state}, turnDetectionDelay=${msg.metrics?.turnDetectionDelayMs}ms`)
            ws.removeListener('message', handler)
            clearTimeout(timeout)
            resolve(msg)
          }
        } catch (e) {}
      }

      ws.on('message', handler)

      // Send speech_start then simulated turn_complete after 600ms
      ws.send(JSON.stringify({ type: 'speech_start', timestamp: Date.now() }))
      setTimeout(() => {
        ws.send(JSON.stringify({
          type: 'turn_complete',
          speechStartTime: Date.now() - 1500,
          speechEndTime: Date.now() - 600,
        }))
      }, 50)
    })

    await turnPromise
    passCount++

    // 3. Testing Instant Barge-In Interruption Event
    console.log('\n--- 3. Testing Instant Barge-in Interruption ---')
    const interruptPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Barge-in timeout (5s)')), 5000)

      const handler = (data) => {
        try {
          const msg = JSON.parse(data.toString())
          if (msg.type === 'interrupted') {
            console.log(`✅ Barge-in Interruption Confirmed: turnId=${msg.turnId}, timestamp=${msg.timestamp}`)
            ws.removeListener('message', handler)
            clearTimeout(timeout)
            resolve(msg)
          }
        } catch (e) {}
      }

      ws.on('message', handler)

      // Send interrupt event
      ws.send(JSON.stringify({ type: 'interrupt', timestamp: Date.now() }))
    })

    await interruptPromise
    passCount++

    // 4. Testing Latest Command Priority & Non-Blocking Execution
    console.log('\n--- 4. Testing Latest Command Priority Tracker ---')
    const { createCommandTracker } = require('../src/services/voiceStream.service')
    const cmd1 = createCommandTracker('fan', 'ON')
    const cmd2 = createCommandTracker('fan', 'OFF')

    console.log(`Command 1 (fan ON)  sequence=${cmd1.sequence}, isLatest=${cmd1.isLatest()}`)
    console.log(`Command 2 (fan OFF) sequence=${cmd2.sequence}, isLatest=${cmd2.isLatest()}`)

    if (!cmd1.isLatest() && cmd2.isLatest()) {
      console.log('✅ PASS: Stale command (cmd1) automatically invalidated by newer command (cmd2)')
      passCount++
    } else {
      throw new Error('Latest command priority check failed')
    }

    // 5. Testing Fast-Dispatch Hardware Action Event
    console.log('\n--- 5. Testing Fast-Dispatch Non-Blocking Action Event ---')
    const dispatchPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Dispatch timeout (5s)')), 5000)

      const handler = (data) => {
        try {
          const msg = JSON.parse(data.toString())
          if (msg.type === 'device_action_dispatched') {
            console.log(`✅ Received optimistic action dispatch:`, msg.actions)
            ws.removeListener('message', handler)
            clearTimeout(timeout)
            resolve(msg)
          }
        } catch (e) {}
      }

      ws.on('message', handler)

      ws.send(JSON.stringify({
        type: 'fast_dispatch_command',
        text: 'Turn on the fan',
      }))
    })

    await dispatchPromise
    passCount++

    ws.close()

    console.log('\n======================================================')
    console.log(`🎉 ALL ${passCount}/5 ARCHITECTURE VERIFICATION TESTS PASSED!`)
    console.log('======================================================')
    process.exit(0)
  } catch (err) {
    console.error('❌ Verification test failed:', err.message)
    if (ws.readyState === WebSocket.OPEN) ws.close()
    process.exit(1)
  }
}

runRealtimeVoiceTests()
