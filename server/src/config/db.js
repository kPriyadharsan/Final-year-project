const mongoose = require('mongoose')

/**
 * Configure Mongoose connection events and error handlers
 */
function setupConnectionListeners() {
  // Prevent adding duplicate listeners if called multiple times
  if (mongoose.connection._hasClassroomListeners) {
    return
  }
  mongoose.connection._hasClassroomListeners = true

  // Event: Successful connection
  mongoose.connection.on('connected', () => {
    const host = mongoose.connection.host || 'unknown'
    const port = mongoose.connection.port || ''
    const dbName = mongoose.connection.name || ''
    console.log(`🍃 [MongoDB] Successfully connected to: ${host}${port ? `:${port}` : ''}/${dbName}`)
  })

  // Event: Connection error occurred
  mongoose.connection.on('error', (err) => {
    console.error(`❌ [MongoDB] Runtime connection error: ${err.message}`)
  })

  // Event: Disconnection occurred
  mongoose.connection.on('disconnected', () => {
    console.warn('⚠️  [MongoDB] Database disconnected. Waiting for reconnection...')
  })

  // Event: Successful reconnection
  mongoose.connection.on('reconnected', () => {
    console.log('🔄 [MongoDB] Database reconnected successfully.')
  })

  // Event: Connection close
  mongoose.connection.on('close', () => {
    console.log('🔒 [MongoDB] Connection has closed.')
  })
}

/**
 * Gracefully closes the database connection on application shutdown.
 * @param {string} signal - Triggering termination signal (e.g. SIGINT, SIGTERM)
 */
async function closeDB(signal = 'App Termination') {
  try {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close(false)
      console.log(`🔒 [MongoDB] Connection closed gracefully via [${signal}].`)
    }
  } catch (err) {
    console.error(`❌ [MongoDB] Error closing connection during [${signal}]:`, err.message)
  }
}

/**
 * Establishes connection to MongoDB using MONGODB_URI from environment variables.
 * @returns {Promise<mongoose.Connection|null>}
 */
async function connectDB() {
  const mongoURI = process.env.MONGODB_URI

  if (!mongoURI || typeof mongoURI !== 'string' || mongoURI.trim() === '') {
    const errorMsg = 'MONGODB_URI is missing or empty. MongoDB connection must come entirely from MONGODB_URI.'
    console.error(`❌ [MongoDB] Configuration Error: ${errorMsg}`)
    throw new Error(errorMsg)
  }

  // Register lifecycle event listeners
  setupConnectionListeners()

  const options = {
    serverSelectionTimeoutMS: 8000, // Timeout for cluster connectivity
    socketTimeoutMS: 45000,
    connectTimeoutMS: 10000,
    maxPoolSize: 50,
    minPoolSize: 2,
    autoIndex: process.env.NODE_ENV !== 'production',
  }

  try {
    const conn = await mongoose.connect(mongoURI, options)
    return conn
  } catch (error) {
    const maskedUri = mongoURI.replace(/\/\/(.*?):(.*?)@/, '//***:***@')
    console.error('\n' + '-'.repeat(60))
    console.error(`❌ [MongoDB] Initial Connection Failed:`)
    console.error(`   Target URI: ${maskedUri}`)
    console.error(`   Error     : ${error.message}`)
    console.error('\n💡 Troubleshooting Guide:')
    console.error('   1. If using local MongoDB, ensure MongoDB service or "mongod" is running.')
    console.error('   2. If using MongoDB Atlas, check your network access (IP whitelist) and credentials.')
    console.error('   3. The server will remain running for non-database endpoints (e.g. /api/health).')
    console.error('-'.repeat(60) + '\n')
    return null
  }
}

/**
 * Helper to return human-readable connection states
 * @returns {string} 'connected' | 'connecting' | 'disconnecting' | 'disconnected'
 */
function getMongoStatus() {
  const states = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting',
  }
  return states[mongoose.connection.readyState] || 'unknown'
}

/**
 * Performs a live ping check against the connected MongoDB instance.
 * @returns {Promise<{ success: boolean, latencyMs?: number, host?: string, name?: string, error?: string }>}
 */
async function pingDatabase() {
  if (mongoose.connection.readyState !== 1) {
    return {
      success: false,
      status: getMongoStatus(),
      error: `Database is currently ${getMongoStatus()}. Not ready for queries.`,
    }
  }

  const startTime = Date.now()
  try {
    // Ping admin database to measure active round-trip latency
    await mongoose.connection.db.admin().ping()
    const latencyMs = Date.now() - startTime
    return {
      success: true,
      status: 'connected',
      latencyMs,
      host: mongoose.connection.host,
      port: mongoose.connection.port,
      name: mongoose.connection.name,
    }
  } catch (err) {
    return {
      success: false,
      status: 'error',
      error: err.message,
    }
  }
}

// Register process exit listeners for graceful disconnection
process.on('SIGINT', async () => {
  await closeDB('SIGINT')
})

process.on('SIGTERM', async () => {
  await closeDB('SIGTERM')
})

module.exports = {
  connectDB,
  closeDB,
  getMongoStatus,
  pingDatabase,
}
