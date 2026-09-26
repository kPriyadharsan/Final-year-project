const path = require('path')
const dotenv = require('dotenv')

// Load environment variables from server/.env
const envPath = path.resolve(__dirname, '../../.env')
dotenv.config({ path: envPath })

/**
 * Validates and loads required environment variables.
 * Exits with clear, actionable diagnostics if any required variable is missing or malformed.
 */
function validateAndLoadEnv() {
  const errors = []
  const warnings = []

  // 1. PORT
  const rawPort = process.env.PORT || '5000'
  const parsedPort = parseInt(rawPort, 10)
  if (isNaN(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
    errors.push({
      key: 'PORT',
      message: `Must be a valid TCP port number between 1 and 65535. Received: "${rawPort}"`,
      hint: 'Default is 5000.',
    })
  }

  // 2. MONGODB_URI
  const mongoUri = process.env.MONGODB_URI
  if (!mongoUri) {
    errors.push({
      key: 'MONGODB_URI',
      message: 'MongoDB connection URI is missing.',
      hint: 'Example: mongodb://127.0.0.1:27017/smart_classroom or mongodb+srv://...',
    })
  } else if (!mongoUri.startsWith('mongodb://') && !mongoUri.startsWith('mongodb+srv://')) {
    errors.push({
      key: 'MONGODB_URI',
      message: 'MongoDB URI must begin with "mongodb://" or "mongodb+srv://".',
      hint: 'Example: mongodb://127.0.0.1:27017/smart_classroom',
    })
  }

  // 3. JWT_SECRET
  const jwtSecret = process.env.JWT_SECRET
  if (!jwtSecret) {
    errors.push({
      key: 'JWT_SECRET',
      message: 'JWT secret key is missing.',
      hint: 'Define a strong random secret (min 16 characters) used to sign authentication tokens.',
    })
  } else if (jwtSecret.length < 16) {
    errors.push({
      key: 'JWT_SECRET',
      message: `JWT secret key is too short (${jwtSecret.length} chars). Minimum recommended is 16 characters.`,
      hint: 'Use a strong cryptographic random string or passphrase.',
    })
  } else if (jwtSecret === 'your_jwt_secret_key_minimum_32_chars') {
    warnings.push({
      key: 'JWT_SECRET',
      message: 'You are using the default placeholder secret from .env.example. Replace with a unique random secret for production.',
    })
  }

  // 4. GEMINI_API_KEY (CRITICAL: Server-only secret, never to be sent to frontend)
  const geminiKey = process.env.GEMINI_API_KEY
  if (!geminiKey) {
    errors.push({
      key: 'GEMINI_API_KEY',
      message: 'Google Gemini API key is missing.',
      hint: 'Required for future AI voice interpretation. Generate one at: https://aistudio.google.com/app/apikey',
    })
  } else if (geminiKey.trim() === '' || geminiKey === 'your_gemini_api_key_here') {
    errors.push({
      key: 'GEMINI_API_KEY',
      message: 'GEMINI_API_KEY contains an empty or default unconfigured placeholder.',
      hint: 'Provide a valid Gemini API key in server/.env.',
    })
  }

  // 5. MQTT_BROKER_URL
  const mqttBrokerUrl = process.env.MQTT_BROKER_URL
  const validMqttProtocols = ['mqtt://', 'mqtts://', 'ws://', 'wss://', 'tcp://']
  if (!mqttBrokerUrl) {
    errors.push({
      key: 'MQTT_BROKER_URL',
      message: 'MQTT Broker URL is missing.',
      hint: 'Required for smart classroom hardware communication. Example: mqtt://127.0.0.1:1883 or mqtt://broker.emqx.io:1883',
    })
  } else if (!validMqttProtocols.some((protocol) => mqttBrokerUrl.startsWith(protocol))) {
    errors.push({
      key: 'MQTT_BROKER_URL',
      message: `MQTT Broker URL must start with one of: ${validMqttProtocols.join(', ')}.`,
      hint: `Received: "${mqttBrokerUrl}". Example: mqtt://127.0.0.1:1883`,
    })
  }

  // 6. MQTT_CLIENT_ID
  const mqttClientId = process.env.MQTT_CLIENT_ID
  if (!mqttClientId || mqttClientId.trim() === '') {
    errors.push({
      key: 'MQTT_CLIENT_ID',
      message: 'MQTT Client ID is missing.',
      hint: 'Provide a unique identifier string, e.g. "smart_classroom_backend_01".',
    })
  }

  // 7. Optional MQTT Credentials
  const mqttUsername = process.env.MQTT_USERNAME || ''
  const mqttPassword = process.env.MQTT_PASSWORD || ''

  // 8. CLIENT_URL & NODE_ENV
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173'
  const nodeEnv = process.env.NODE_ENV || 'development'

  // If validation errors exist, print an informative formatted banner and exit
  if (errors.length > 0) {
    console.error('\n' + '='.repeat(78))
    console.error(' ❌ CRITICAL BACKEND CONFIGURATION ERROR: Missing or Invalid Environment')
    console.error('='.repeat(78))
    console.error('\nThe backend server could not start because required environment')
    console.error('variables in `server/.env` failed validation:\n')

    errors.forEach((err, idx) => {
      console.error(`  ${idx + 1}. [${err.key}]`)
      console.error(`     Issue: ${err.message}`)
      if (err.hint) {
        console.error(`     Fix  : ${err.hint}`)
      }
      console.error('')
    })

    console.error('-'.repeat(78))
    console.error('💡 QUICK FIX:')
    console.error('   1. Check your `server/.env` file.')
    console.error('   2. Compare with `server/.env.example` for all required variables.')
    console.error('   3. Fill in the missing values and restart the server.\n')
    console.error('='.repeat(78) + '\n')

    process.exit(1)
  }

  // Print any non-fatal warnings
  if (warnings.length > 0 && nodeEnv !== 'test') {
    console.warn('\n' + '⚠️ '.repeat(10))
    warnings.forEach((warn) => {
      console.warn(`[Config Warning] ${warn.key}: ${warn.message}`)
    })
    console.warn('⚠️ '.repeat(10) + '\n')
  }

  // Helper to mask secrets for logging or health inspection
  const maskSecret = (secret) => {
    if (!secret || typeof secret !== 'string') return 'none'
    if (secret.length <= 8) return '****'
    return `${secret.slice(0, 4)}...${secret.slice(-4)}`
  }

  const config = {
    PORT: parsedPort,
    MONGODB_URI: mongoUri,
    JWT_SECRET: jwtSecret,
    GEMINI_API_KEY: geminiKey,
    MQTT_BROKER_URL: mqttBrokerUrl,
    MQTT_USERNAME: mqttUsername,
    MQTT_PASSWORD: mqttPassword,
    MQTT_CLIENT_ID: mqttClientId,
    CLIENT_URL: clientUrl,
    NODE_ENV: nodeEnv,
    // Safe non-sensitive summary for diagnostics
    getDiagnostics() {
      return {
        port: parsedPort,
        nodeEnv,
        clientUrl,
        mongoConfigured: !!mongoUri,
        jwtConfigured: !!jwtSecret,
        geminiConfigured: !!geminiKey,
        geminiMasked: maskSecret(geminiKey),
        mqtt: {
          brokerUrl: mqttBrokerUrl,
          clientId: mqttClientId,
          hasAuth: !!(mqttUsername && mqttPassword),
        },
      }
    },
  }

  return Object.freeze(config)
}

module.exports = validateAndLoadEnv()
