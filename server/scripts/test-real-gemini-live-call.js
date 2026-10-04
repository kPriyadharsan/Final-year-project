/**
 * Verification of Real Gemini Live WebSockets Tool Calling for control_classroom_devices
 * using model: gemini-2.5-flash-native-audio-preview-12-2025
 */
const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '../.env') })
const { GoogleGenAI, Type } = require('@google/genai')
const WebSocket = require('ws')
global.WebSocket = WebSocket

async function testRealGeminiLiveFunctionCall() {
  console.log('Testing real Gemini Live WebSocket function calling with control_classroom_devices...')
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.error('No GEMINI_API_KEY')
    process.exit(1)
  }

  const ai = new GoogleGenAI({ apiKey })

  const toolDeclaration = {
    functionDeclarations: [
      {
        name: 'control_classroom_devices',
        description: 'Control smart classroom devices such as lights, fans, and projectors. Supports single or multiple device actions simultaneously.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            actions: {
              type: Type.ARRAY,
              description: 'List of device control actions to execute in the classroom.',
              items: {
                type: Type.OBJECT,
                properties: {
                  device: {
                    type: Type.STRING,
                    description: 'The target classroom device type.',
                    enum: ['light', 'fan', 'projector'],
                  },
                  action: {
                    type: Type.STRING,
                    description: 'The power state or switch action to perform.',
                    enum: ['ON', 'OFF'],
                  },
                },
                required: ['device', 'action'],
              },
            },
          },
          required: ['actions'],
        },
      },
    ],
  }

  const systemInstruction = `You control a smart classroom.

Supported devices:
- light
- fan
- projector

Supported actions:
- ON
- OFF

When the user requests a device action, call control_classroom_devices.

For multiple requested devices, include every requested device in the actions array.

Examples:

User: Turn on the fan.
Tool call:
actions = [
  { device: "fan", action: "ON" }
]

User: Turn on the fan and light.
Tool call:
actions = [
  { device: "fan", action: "ON" },
  { device: "light", action: "ON" }
]

User: Turn everything off.
Tool call:
actions = [
  { device: "fan", action: "OFF" },
  { device: "light", action: "OFF" },
  { device: "projector", action: "OFF" }
]

Never invent unsupported devices.`

  let functionCallReceived = false
  let session = null
  let sessionConnectConfig = null

  try {
    const messagePromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timeout waiting for Gemini Live response (15s)'))
      }, 15000)

      function checkMessage(message) {
        // Check toolCall
        if (message.toolCall?.functionCalls) {
          for (const call of message.toolCall.functionCalls) {
            console.log(`🎯 Real Gemini Live Tool Call Received:`, call.name)
            console.log(`Arguments:`, JSON.stringify(call.args, null, 2))
            if (call.name === 'control_classroom_devices') {
              functionCallReceived = true
              clearTimeout(timeout)
              resolve(call)
              return
            }
          }
        }

        // Check serverContent modelTurn
        if (message.serverContent?.modelTurn?.parts) {
          for (const part of message.serverContent.modelTurn.parts) {
            if (part.functionCall) {
              console.log(`🎯 Real Gemini Live Tool Call in Part Received:`, part.functionCall.name)
              console.log(`Arguments:`, JSON.stringify(part.functionCall.args, null, 2))
              if (part.functionCall.name === 'control_classroom_devices') {
                functionCallReceived = true
                clearTimeout(timeout)
                resolve(part.functionCall)
                return
              }
            }
          }
        }
      }

      sessionConnectConfig = {
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalities: ['AUDIO'],
          systemInstruction: {
            parts: [{ text: systemInstruction }],
          },
          tools: [toolDeclaration],
        },
        callbacks: {
          onopen: () => {
            console.log('✅ Connected to Gemini Live session via WebSocket!')
          },
          onmessage: (msg) => {
            checkMessage(msg)
          },
          onerror: (err) => {
            console.warn('Live error:', err)
          },
          onclose: (e) => {
            console.log('Live closed:', e)
          },
        },
      }
    })

    session = await ai.live.connect(sessionConnectConfig)

    // Send a text turn asking to turn on the fan and light
    console.log('Sending user request: "Turn on the fan and light"')
    session.sendClientContent({
      turns: [
        {
          role: 'user',
          parts: [{ text: 'Turn on the fan and light' }],
        },
      ],
      turnComplete: true,
    })

    const toolCall = await messagePromise
    console.log('✅ PASS: Real Gemini Live Function Call Verified successfully!')
    console.log('Call details:', JSON.stringify(toolCall))
  } finally {
    if (session) {
      try {
        await session.close()
      } catch (_) {}
    }
  }
}

testRealGeminiLiveFunctionCall().catch((err) => {
  console.error('Gemini Live test error:', err)
  process.exit(1)
})
