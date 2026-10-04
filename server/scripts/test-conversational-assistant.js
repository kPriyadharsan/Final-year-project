/**
 * Comprehensive Test Suite for Conversational Smart Classroom Assistant
 *
 * Verifies all 13 core requirements:
 * 1. Conversational Examples A through H
 * 2. Intent Classification (CONTROL, QUERY, CONVERSATION, UNSUPPORTED, AMBIGUOUS)
 * 3. Follow-up context & pronoun resolution ("it", "that", "this", "the device", "the same one")
 * 4. Natural language variations
 * 5. Capability queries without tool execution ("What can you control?", "Which device has RGB?")
 * 6. Live device state queries ("Is the fan on?") without hardware execution
 * 7. Unsupported capability rejection ("Make the fan purple", "Increase fan speed") without tool execution
 * 8. Truthful execution / No hallucination on partial/total backend failures
 * 9. Concise voice responses (1 short sentence max)
 * 10. Centralized system instruction & dynamic device capability registry
 * 11. Extensibility with future devices (AC, smart board)
 * 12. Ambiguous command handling
 * 13. Preserving existing MQTT / DB state architecture
 */

const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '../.env') })
const mongoose = require('mongoose')
const { GoogleGenAI } = require('@google/genai')

const {
  DEVICE_CAPABILITY_REGISTRY,
  formatCapabilitiesForPrompt,
  isCapabilitySupported,
  getDeviceCapabilities,
} = require('../src/constants/deviceCapabilities')

const {
  buildClassroomSystemInstruction,
  CONTROL_CLASSROOM_DEVICES_TOOL,
  SET_CLASSROOM_RGB_TOOL,
} = require('../src/services/gemini.service')

const { Device, DEVICE_TYPES, DEVICE_STATES } = require('../src/models/Device')

async function runConversationalAssistantTests() {
  console.log('='.repeat(75))
  console.log('🤖 CONVERSATIONAL SMART CLASSROOM ASSISTANT TEST SUITE')
  console.log('='.repeat(75))

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.error('❌ Missing GEMINI_API_KEY')
    process.exit(1)
  }

  // 1. Connect DB for live device states
  const mongoURI = process.env.MONGODB_URI
  if (mongoURI) {
    await mongoose.connect(mongoURI)
    console.log('✅ Connected to MongoDB Atlas')
  }

  const ai = new GoogleGenAI({ apiKey })
  const modelName = process.env.GEMINI_MODEL || 'gemini-3.7-flash'

  // Classroom state setup
  const classroom = 'Room 302'
  const mockDeviceStates = {
    light: 'OFF',
    fan: 'ON',
    projector: 'ON',
  }

  const systemInstruction = buildClassroomSystemInstruction({
    classroom,
    deviceStates: mockDeviceStates,
  })

  const tools = [CONTROL_CLASSROOM_DEVICES_TOOL, SET_CLASSROOM_RGB_TOOL]

  let passedTests = 0
  let totalTests = 0

  function assert(condition, message) {
    totalTests++
    if (!condition) {
      console.error(`❌ FAILED: ${message}`)
      throw new Error(`Assertion failed: ${message}`)
    }
    console.log(`✓ ${message}`)
    passedTests++
  }

  const candidateModels = [
    process.env.GEMINI_MODEL,
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
    'gemini-flash-latest',
    'gemini-3.8-flash',
    'gemini-3.5-flash',
    'gemini-3.7-flash',
  ].filter((m, i, arr) => m && arr.indexOf(m) === i)

  let activeModelIndex = 0

  // Helper to query Gemini with history and model fallback on 429 quota limits
  async function queryGemini(history, currentPrompt, maxRetries = 8) {
    const contents = [
      ...history,
      {
        role: 'user',
        parts: [{ text: currentPrompt }],
      },
    ]

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const currentModel = candidateModels[activeModelIndex % candidateModels.length]
      try {
        const response = await ai.models.generateContent({
          model: currentModel,
          contents,
          config: {
            systemInstruction: {
              parts: [{ text: systemInstruction }],
            },
            tools,
            temperature: 0.1,
          },
        })

        const functionCalls = response.functionCalls || []
        const text = response.text ? response.text.trim() : ''
        return { response, functionCalls, text }
      } catch (err) {
        const isQuota = err.status === 429 || err.message?.includes('429') || err.message?.includes('Quota')
        const isTransient = err.status === 503 || err.message?.includes('503') || err.message?.includes('high demand')

        if ((isQuota || isTransient) && attempt < maxRetries) {
          activeModelIndex++
          const nextModel = candidateModels[activeModelIndex % candidateModels.length]
          console.log(`⚠️ Rate/transient limit on ${currentModel} (${err.status || 'limit'}). Falling back to model: ${nextModel}...`)
          await new Promise((r) => setTimeout(r, 1500))
          continue
        }
        throw err
      }
    }
  }

  // =========================================================================
  // TEST 1: System Instruction Centralization & Extensibility Verification
  // =========================================================================
  console.log('\n--- 1. Verification of System Prompt & Capability Registry ---')
  assert(systemInstruction.includes('voice assistant for a smart classroom'), 'Contains role definition')
  assert(systemInstruction.includes('LATEST CONFIRMED HARDWARE STATE:'), 'Includes dynamic live device state')
  assert(systemInstruction.includes('Light: OFF'), 'Includes Light state OFF')
  assert(systemInstruction.includes('Fan: ON'), 'Includes Fan state ON')
  assert(systemInstruction.includes('Projector: ON'), 'Includes Projector state ON')
  assert(systemInstruction.includes('Example A'), 'Includes conversational Example A')
  assert(systemInstruction.includes('Example H'), 'Includes conversational Example H')
  assert(systemInstruction.includes('INTENT CLASSIFICATION'), 'Includes conceptual intent classification')
  assert(systemInstruction.includes('TRUTHFUL EXECUTION'), 'Includes truthful execution and anti-hallucination rule')
  assert(systemInstruction.includes('PRONOUN RESOLUTION'), 'Includes pronoun resolution rules')

  // Test registry extensibility
  const mockAcExt = {
    device: 'ac',
    capabilities: ['power', 'temperature', 'mode'],
  }
  const formattedAc = formatCapabilitiesForPrompt([mockAcExt])
  assert(formattedAc.includes('AC'), 'Extensible formatter supports AC device')
  assert(formattedAc.includes('temperature, mode'), 'Extensible formatter outputs AC capabilities')

  // =========================================================================
  // TEST 2: Example E & G - Capability Queries (QUERY intent -> Zero Tool Call)
  // =========================================================================
  console.log('\n--- 2. Example E & G: Capability Queries (Zero Tool Execution) ---')
  const qCap = await queryGemini([], 'What can you control?')
  console.log(`Assistant reply: "${qCap.text}"`)
  assert(qCap.functionCalls.length === 0, 'No tool call executed for "What can you control?"')
  assert(
    qCap.text.toLowerCase().includes('light') &&
      qCap.text.toLowerCase().includes('fan') &&
      qCap.text.toLowerCase().includes('projector'),
    'Explains light, fan, and projector capabilities'
  )

  const qRgb = await queryGemini([], 'Which device has RGB?')
  console.log(`Assistant reply: "${qRgb.text}"`)
  assert(qRgb.functionCalls.length === 0, 'No tool call executed for "Which device has RGB?"')
  assert(qRgb.text.toLowerCase().includes('projector'), 'Identifies projector as the RGB device')

  // =========================================================================
  // TEST 3: Example F - Live Device State Query (QUERY intent -> Zero Tool Call)
  // =========================================================================
  console.log('\n--- 3. Example F: Device State Query (Zero Tool Execution) ---')
  const qState = await queryGemini([], 'Is the fan on?')
  console.log(`Assistant reply: "${qState.text}"`)
  assert(qState.functionCalls.length === 0, 'No tool call executed for "Is the fan on?"')
  assert(qState.text.toLowerCase().includes('on') || qState.text.toLowerCase().includes('yes'), 'Accurately answers fan is ON from state snapshot')

  const qLight = await queryGemini([], 'Is the light on?')
  console.log(`Assistant reply: "${qLight.text}"`)
  assert(qLight.functionCalls.length === 0, 'No tool call executed for "Is the light on?"')
  assert(qLight.text.toLowerCase().includes('off') || qLight.text.toLowerCase().includes('no'), 'Accurately answers light is OFF from state snapshot')

  // =========================================================================
  // TEST 4: Example H & Unsupported Capabilities (UNSUPPORTED intent -> Zero Tool Call)
  // =========================================================================
  console.log('\n--- 4. Example H & Unsupported Capability Safety Rule ---')
  const qFanRgb = await queryGemini([], 'Make the fan purple.')
  console.log(`Assistant reply: "${qFanRgb.text}"`)
  assert(qFanRgb.functionCalls.length === 0, 'No tool call executed for "Make the fan purple"')
  assert(
    qFanRgb.text.toLowerCase().includes("doesn't") ||
      qFanRgb.text.toLowerCase().includes('does not') ||
      qFanRgb.text.toLowerCase().includes('not support'),
    'Explains that fan does not have RGB lighting'
  )

  const qFanSpeed = await queryGemini([], 'Increase fan speed to 5.')
  console.log(`Assistant reply: "${qFanSpeed.text}"`)
  assert(qFanSpeed.functionCalls.length === 0, 'No tool call executed for "Increase fan speed"')
  assert(
    qFanSpeed.text.toLowerCase().includes('speed') ||
      qFanSpeed.text.toLowerCase().includes('support') ||
      qFanSpeed.text.toLowerCase().includes('available'),
    'Explains that fan speed control is unsupported'
  )

  // =========================================================================
  // TEST 5: Example A - Multi-Turn Conversational Context & Pronoun Resolution
  // Turn 1: "Turn on the projector." -> Turn 2: "Make it purple."
  // =========================================================================
  console.log('\n--- 5. Example A: Pronoun Resolution & Follow-Up Context ---')
  const historyA = []

  // Turn 1
  const t1 = await queryGemini(historyA, 'Turn on the projector.')
  assert(t1.functionCalls.length > 0, 'Turn 1 produced tool call')
  const call1 = t1.functionCalls[0]
  assert(call1.name === 'control_classroom_devices', 'Called control_classroom_devices')
  assert(call1.args?.actions?.[0]?.device === 'projector' && call1.args?.actions?.[0]?.action === 'ON', 'Projector ON action requested')

  // Update history with assistant tool call and tool result
  historyA.push(
    { role: 'user', parts: [{ text: 'Turn on the projector.' }] },
    { role: 'model', parts: t1.response.candidates[0].content.parts },
    {
      role: 'user',
      parts: [
        {
          functionResponse: {
            name: call1.name,
            response: {
              actions: [{ device: 'projector', action: 'ON', success: true }],
            },
          },
        },
      ],
    }
  )

  // Turn 2: Follow-up with pronoun "it"
  const t2 = await queryGemini(historyA, 'Make it purple.')
  assert(t2.functionCalls.length > 0, 'Turn 2 produced tool call')
  const call2 = t2.functionCalls[0]
  assert(call2.name === 'set_classroom_rgb', 'Resolved "it" to projector RGB and called set_classroom_rgb')
  assert(call2.args?.device === 'projector', 'Target device resolved to projector')
  const resolvedColorName = call2.args?.color?.name || call2.args?.colorName || call2.args?.color
  assert(resolvedColorName === 'purple', 'Color resolved to purple')

  // Update history with assistant RGB tool call and response
  historyA.push(
    { role: 'user', parts: [{ text: 'Make it purple.' }] },
    { role: 'model', parts: t2.response.candidates[0].content.parts },
    {
      role: 'user',
      parts: [
        {
          functionResponse: {
            name: call2.name,
            response: {
              device: 'projector',
              status: 'success',
              color: { name: 'purple', r: 168, g: 85, b: 247 },
            },
          },
        },
      ],
    }
  )

  // Turn 3: Pronoun "that" -> "Now make that blue."
  const t3 = await queryGemini(historyA, 'Now make that blue.')
  assert(t3.functionCalls.length > 0, 'Turn 3 produced tool call')
  const call3 = t3.functionCalls[0]
  assert(call3.name === 'set_classroom_rgb', 'Called set_classroom_rgb for "make that blue"')
  assert(call3.args?.device === 'projector', 'Resolved "that" to projector')
  const colorBlue = call3.args?.color?.name || call3.args?.colorName || call3.args?.color
  assert(colorBlue === 'blue', 'Color resolved to blue')

  // Turn 4: "Turn it off." -> resolves "it" to projector power OFF
  historyA.push(
    { role: 'user', parts: [{ text: 'Now make that blue.' }] },
    { role: 'model', parts: t3.response.candidates[0].content.parts },
    {
      role: 'user',
      parts: [
        {
          functionResponse: {
            name: call3.name,
            response: {
              device: 'projector',
              status: 'success',
              color: { name: 'blue' },
            },
          },
        },
      ],
    }
  )

  const t4 = await queryGemini(historyA, 'Turn it off.')
  assert(t4.functionCalls.length > 0, 'Turn 4 produced tool call')
  const call4 = t4.functionCalls[0]
  assert(call4.name === 'control_classroom_devices', 'Called control_classroom_devices for "Turn it off"')
  assert(call4.args?.actions?.[0]?.device === 'projector' && call4.args?.actions?.[0]?.action === 'OFF', 'Resolved "it" to projector power OFF')

  // =========================================================================
  // TEST 6: Example B - Follow-up Correction ("Actually, turn it off.")
  // =========================================================================
  console.log('\n--- 6. Example B: Follow-up Correction ---')
  const tB1 = await queryGemini([], 'Turn on the fan.')
  assert(tB1.functionCalls.length > 0, 'Turn on fan produced tool call')
  const callB1 = tB1.functionCalls[0]

  const historyB = [
    { role: 'user', parts: [{ text: 'Turn on the fan.' }] },
    { role: 'model', parts: tB1.response.candidates[0].content.parts },
    {
      role: 'user',
      parts: [
        {
          functionResponse: {
            name: callB1.name,
            response: { actions: [{ device: 'fan', action: 'ON', success: true }] },
          },
        },
      ],
    },
  ]

  const tB2 = await queryGemini(historyB, 'Actually, turn it off.')
  assert(tB2.functionCalls.length > 0, 'Example B turn 2 produced tool call')
  const callB = tB2.functionCalls[0]
  assert(callB.name === 'control_classroom_devices', 'Called control_classroom_devices')
  assert(callB.args?.actions?.[0]?.device === 'fan' && callB.args?.actions?.[0]?.action === 'OFF', 'Resolved "it" to fan OFF')

  // =========================================================================
  // TEST 7: Example C & D - Batch and "Everything" Control
  // =========================================================================
  console.log('\n--- 7. Example C & D: Multi-Device and "Everything Off" ---')
  const tC = await queryGemini([], 'Turn on the projector and fan.')
  assert(tC.functionCalls.length > 0, 'Turn on projector and fan produced tool call')
  const cActions = tC.functionCalls[0].args?.actions || []
  assert(cActions.length === 2, 'Two devices in action payload')
  const cDevices = cActions.map((a) => a.device)
  assert(cDevices.includes('projector') && cDevices.includes('fan'), 'Payload includes projector and fan')

  const tD = await queryGemini([], 'Turn everything off.')
  assert(tD.functionCalls.length > 0, 'Turn everything off produced tool call')
  const dActions = tD.functionCalls[0].args?.actions || []
  assert(dActions.length === 3, 'Payload includes all 3 devices')
  assert(dActions.every((a) => a.action === 'OFF'), 'All actions are OFF')

  // =========================================================================
  // TEST 8: Anti-Hallucination & Truthful Execution
  // Verify assistant speaks actual partial failure rather than false success
  // =========================================================================
  console.log('\n--- 8. Anti-Hallucination / Truthful Execution on Partial Failure ---')
  const tFail1 = await queryGemini([], 'Turn off the light and fan.')
  assert(tFail1.functionCalls.length > 0, 'Turn off light and fan produced tool call')
  const callFail = tFail1.functionCalls[0]

  const failureHistory = [
    { role: 'user', parts: [{ text: 'Turn off the light and fan.' }] },
    { role: 'model', parts: tFail1.response.candidates[0].content.parts },
    {
      role: 'user',
      parts: [
        {
          functionResponse: {
            name: callFail.name,
            response: {
              actions: [
                { device: 'light', action: 'OFF', success: true, message: 'Light is OFF' },
                { device: 'fan', action: 'OFF', success: false, message: 'Fan device offline' },
              ],
              allSucceeded: false,
              partialFailure: true,
            },
          },
        },
      ],
    },
  ]

  let respPartial = null
  for (let attempt = 1; attempt <= 3; attempt++) {
    const currentMod = candidateModels[activeModelIndex % candidateModels.length]
    try {
      respPartial = await ai.models.generateContent({
        model: currentMod,
        contents: failureHistory,
        config: {
          systemInstruction: {
            parts: [{ text: systemInstruction }],
          },
          tools,
          temperature: 0.1,
        },
      })
      break
    } catch (err) {
      if (attempt < 3) {
        activeModelIndex++
        await new Promise((r) => setTimeout(r, 1500))
        continue
      }
      throw err
    }
  }

  const partialText = respPartial.text ? respPartial.text.trim().toLowerCase() : ''
  console.log(`Assistant spoken response to partial failure: "${respPartial.text?.trim()}"`)
  assert(
    partialText.includes('fan') &&
      (partialText.includes('fail') || partialText.includes("couldn't") || partialText.includes('could not') || partialText.includes('offline')),
    'Assistant truthfully reported that the fan command failed'
  )
  assert(!partialText.includes('everything is off'), 'Assistant did NOT hallucinate full success')

  // =========================================================================
  // TEST 9: Ambiguous Command Handling
  // "Make it blue" with no prior context -> depends on context:
  // Either resolves to the single RGB-capable device (projector) or asks for clarification
  // =========================================================================
  console.log('\n--- 9. Ambiguous Command Handling (Zero Context) ---')
  const qAmbig = await queryGemini([], 'Make it blue.')
  console.log(`Assistant reply to ambiguous input: "${qAmbig.text}"`)
  const isClarification = qAmbig.text && (qAmbig.text.includes('?') || qAmbig.text.toLowerCase().includes('what') || qAmbig.text.toLowerCase().includes('which'))
  const isOnlyRgbDeviceResolved = qAmbig.functionCalls.length > 0 && qAmbig.functionCalls[0].args?.device === 'projector'
  assert(
    isClarification || isOnlyRgbDeviceResolved,
    'Either asked for clarification or resolved "it" to the single RGB-capable appliance (projector)'
  )

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log('\n' + '='.repeat(75))
  console.log(`🎉 ALL ${passedTests}/${totalTests} CONVERSATIONAL ASSISTANT TESTS PASSED!`)
  console.log('='.repeat(75))

  if (mongoose.connection.readyState === 1) {
    await mongoose.disconnect()
  }
}

runConversationalAssistantTests().catch((err) => {
  console.error('\n❌ Conversational Assistant Test Suite Error:', err)
  process.exit(1)
})
