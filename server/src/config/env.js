const path = require('path')
const dotenv = require('dotenv')

// Load environment variables from server/.env if present
const envPath = path.resolve(__dirname, '../../.env')
dotenv.config({ path: envPath })

/**
 * Mask secret strings for secure logging or diagnostic inspection
 *
 * @param {string} secret
 * @returns {string} Masked string (e.g. "AIza...8f2a" or "****")
 */
function maskSecret(secret) {
  if (!secret || typeof secret !== 'string') return 'none'
  const trimmed = secret.trim()
  if (trimmed.length <= 8) return '****'
  return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`
}

/**
 * Mask embedded user credentials in URLs (e.g. mongodb+srv://user:pass@host -> mongodb+srv://***:***@host)
 *
 * @param {string} urlString
 * @returns {string} Sanitized URL
 */
function maskUrlCredentials(urlString) {
  if (!urlString || typeof urlString !== 'string') return ''
  return urlString.replace(/\/\/(.*?):(.*?)@/, '//***:***@')
}

// Known placeholder secrets that must never be used in production
const PLACEHOLDER_SECRETS = [
  'your_jwt_secret_key_minimum_32_chars',
  'your_jwt_secret_key_minimum_32_chars_long',
  'replace_with_a_secure_random_secret_at_least_32_characters_long',
  'secret',
  'changeme',
  '12345678',
  'password123',
]

/**
 * Validates and loads required environment variables.
 * Exits with clear, actionable diagnostics if any required production variable is missing or malformed.
 */
function validateAndLoadEnv() {
  const errors = []
  const warnings = []

  // 1. NODE_ENV
  const nodeEnv = (process.env.NODE_ENV || 'development').trim().toLowerCase()
  const validEnvironments = ['development', 'production', 'test']
  if (!validEnvironments.includes(nodeEnv)) {
    warnings.push({
      key: 'NODE_ENV',
      message: `Unknown NODE_ENV "${nodeEnv}". Recommended values are: ${validEnvironments.join(', ')}. Defaulting to development behavior.`,
    })
  }
  const isProduction = nodeEnv === 'production'

  // 2. PORT
  const rawPort = process.env.PORT || '5000'
  const parsedPort = parseInt(rawPort, 10)
  if (isNaN(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
    errors.push({
      key: 'PORT',
      message: `Must be a valid TCP port number between 1 and 65535. Received: "${rawPort}"`,
      hint: 'Default is 5000.',
    })
  }

  // 3. MONGODB_URI
  const mongoUri = process.env.MONGODB_URI
  if (!mongoUri || mongoUri.trim() === '') {
    errors.push({
      key: 'MONGODB_URI',
      message: 'MongoDB connection URI is missing.',
      hint: 'Example: mongodb://127.0.0.1:27017/smart_classroom or mongodb+srv://<user>:<password>@cluster.mongodb.net/smart_classroom',
    })
  } else if (!mongoUri.startsWith('mongodb://') && !mongoUri.startsWith('mongodb+srv://')) {
    errors.push({
      key: 'MONGODB_URI',
      message: 'MongoDB URI must begin with "mongodb://" or "mongodb+srv://".',
      hint: 'Example: mongodb://127.0.0.1:27017/smart_classroom',
    })
  } else if (isProduction && (mongoUri.includes('127.0.0.1') || mongoUri.includes('localhost'))) {
    warnings.push({
      key: 'MONGODB_URI',
      message: 'MongoDB URI is pointing to localhost in production. Cloud MongoDB Atlas is strongly recommended for production deployment.',
    })
  }

  // 4. JWT_SECRET
  const jwtSecret = process.env.JWT_SECRET
  const minSecretLength = isProduction ? 32 : 16
  if (!jwtSecret || jwtSecret.trim() === '') {
    errors.push({
      key: 'JWT_SECRET',
      message: 'JWT secret key is missing.',
      hint: 'Define a strong random secret used to sign and verify user authentication tokens.',
    })
  } else if (jwtSecret.trim().length < minSecretLength) {
    errors.push({
      key: 'JWT_SECRET',
      message: `JWT secret key is too short (${jwtSecret.trim().length} chars). Minimum required for ${nodeEnv} is ${minSecretLength} characters.`,
      hint: 'Generate a strong secret with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    })
  } else if (PLACEHOLDER_SECRETS.includes(jwtSecret.trim().toLowerCase())) {
    if (isProduction) {
      errors.push({
        key: 'JWT_SECRET',
        message: 'Security error: You cannot use a default placeholder JWT secret in production mode.',
        hint: 'Generate a unique cryptographic random secret for production.',
      })
    } else {
      warnings.push({
        key: 'JWT_SECRET',
        message: 'You are using a default placeholder secret. Replace with a unique random secret before deploying.',
      })
    }
  }

  // 5. CLIENT_URL
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173'
  if (isProduction) {
    if (!process.env.CLIENT_URL) {
      warnings.push({
        key: 'CLIENT_URL',
        message: 'CLIENT_URL is not set in production. Defaulting to "http://localhost:5173". Configure this to your frontend deployment domain (e.g. https://your-project.vercel.app) to allow CORS.',
      })
    } else if (process.env.CLIENT_URL.includes('localhost') || process.env.CLIENT_URL.includes('127.0.0.1')) {
      warnings.push({
        key: 'CLIENT_URL',
        message: 'CLIENT_URL points to localhost in production mode. Update to your live frontend URL.',
      })
    }
  }

  // 6. GEMINI_API_KEY (Server-only secret for AI voice interpretation)
  const geminiKey = process.env.GEMINI_API_KEY || ''
  const isGeminiPlaceholder =
    !geminiKey ||
    geminiKey.trim() === '' ||
    geminiKey === 'your_gemini_api_key_here' ||
    geminiKey.includes('REPLACE_WITH_YOUR_KEY')

  if (isGeminiPlaceholder) {
    warnings.push({
      key: 'GEMINI_API_KEY',
      message: 'GEMINI_API_KEY is not configured or using placeholder. The backend will operate using the built-in rule-based intent fallback parser.',
    })
  }

  // 7. MQTT_BROKER_URL
  const mqttBrokerUrl = process.env.MQTT_BROKER_URL || 'mqtt://127.0.0.1:1883'
  const validMqttProtocols = ['mqtt://', 'mqtts://', 'ws://', 'wss://', 'tcp://']
  if (!validMqttProtocols.some((protocol) => mqttBrokerUrl.startsWith(protocol))) {
    errors.push({
      key: 'MQTT_BROKER_URL',
      message: `MQTT Broker URL must start with one of: ${validMqttProtocols.join(', ')}.`,
      hint: `Received: "${mqttBrokerUrl}". Example: mqtt://127.0.0.1:1883 or mqtts://broker.hivemq.com:8883`,
    })
  } else if (isProduction && (mqttBrokerUrl.includes('127.0.0.1') || mqttBrokerUrl.includes('localhost'))) {
    warnings.push({
      key: 'MQTT_BROKER_URL',
      message: 'MQTT_BROKER_URL points to localhost in production. Cloud MQTT broker is recommended for distributed IoT devices.',
    })
  }

  // 8. MQTT_CLIENT_ID
  const mqttClientId = process.env.MQTT_CLIENT_ID || 'smart_classroom_backend_server_01'

  // 9. Optional MQTT Credentials
  const mqttUsername = process.env.MQTT_USERNAME || ''
  const mqttPassword = process.env.MQTT_PASSWORD || ''

  // 10. Demo QR Authentication Configuration
  const rawDemoExpiry = process.env.DEMO_QR_EXPIRY_MINUTES || '120'
  let parsedDemoExpiry = parseInt(rawDemoExpiry, 10)
  if (isNaN(parsedDemoExpiry) || parsedDemoExpiry < 1) {
    warnings.push({
      key: 'DEMO_QR_EXPIRY_MINUTES',
      message: `Invalid demo QR expiry duration "${rawDemoExpiry}". Defaulting to 120 minutes.`,
    })
    parsedDemoExpiry = 120
  }

  const demoBaseUrl = (
    process.env.DEMO_QR_BASE_URL ||
    (clientUrl ? clientUrl.split(',')[0].trim() : 'http://localhost:5173')
  ).replace(/\/+$/, '')

  // If fatal validation errors exist, print an informative formatted banner and halt process
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
    console.error('   3. Fill in valid values and restart the server.\n')
    console.error('='.repeat(78) + '\n')

    process.exit(1)
  }

  // Print non-fatal warnings (suppressed during unit/script tests)
  if (warnings.length > 0 && nodeEnv !== 'test') {
    console.warn('\n' + '⚠️ '.repeat(10))
    warnings.forEach((warn) => {
      console.warn(`[Config Warning] ${warn.key}: ${warn.message}`)
    })
    console.warn('⚠️ '.repeat(10) + '\n')
  }

  const config = {
    PORT: parsedPort,
    NODE_ENV: nodeEnv,
    CLIENT_URL: clientUrl,
    MONGODB_URI: mongoUri,
    JWT_SECRET: jwtSecret,
    GEMINI_API_KEY: geminiKey,
    MQTT_BROKER_URL: mqttBrokerUrl,
    MQTT_CLIENT_ID: mqttClientId,
    MQTT_USERNAME: mqttUsername,
    MQTT_PASSWORD: mqttPassword,
    DEMO_QR_EXPIRY_MINUTES: parsedDemoExpiry,
    DEMO_QR_BASE_URL: demoBaseUrl,
    // Utilities
    maskSecret,
    maskUrlCredentials,
    // Safe non-sensitive summary for diagnostics and health routes (NEVER exposes secrets)
    getDiagnostics() {
      return {
        port: parsedPort,
        nodeEnv,
        clientUrl,
        mongoConfigured: !!mongoUri,
        jwtConfigured: !!jwtSecret,
        geminiConfigured: !isGeminiPlaceholder,
        geminiMasked: isGeminiPlaceholder ? 'Not Configured (Fallback Mode)' : maskSecret(geminiKey),
        mqtt: {
          brokerUrl: maskUrlCredentials(mqttBrokerUrl),
          clientId: mqttClientId,
          hasAuth: !!(mqttUsername && mqttPassword),
        },
      }
    },
  }

  return Object.freeze(config)
}

module.exports = validateAndLoadEnv()
