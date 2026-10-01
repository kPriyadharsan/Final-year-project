const net = require('net')

let aedesInstance = null
let netServer = null
let isRunning = false

/**
 * Starts a lightweight local MQTT broker using Aedes if port is available.
 * Enables real MQTT pub/sub and hardware command verification during development.
 *
 * @param {number} [port=1883]
 * @returns {Promise<boolean>} Whether the local broker was started
 */
async function startEmbeddedBroker(port = 1883) {
  if (isRunning) return true

  try {
    const { Aedes } = require('aedes')
    aedesInstance = await Aedes.createBroker()
    netServer = net.createServer(aedesInstance.handle)

    return new Promise((resolve) => {
      netServer.listen(port, () => {
        isRunning = true
        console.log(`[Aedes MQTT] 🚀 Local MQTT Broker listening on port ${port}`)
        resolve(true)
      })

      netServer.on('error', (err) => {
        // Port in use (e.g. external Mosquitto or EMQX already running)
        console.log(`[Aedes MQTT] Note: Port ${port} not bound (${err.code}). Connecting to existing broker.`)
        resolve(false)
      })
    })
  } catch (err) {
    console.warn(`[Aedes MQTT] Embedded broker note: ${err.message}`)
    return false
  }
}

/**
 * Stops the embedded MQTT broker on server shutdown
 */
async function stopEmbeddedBroker() {
  if (!isRunning) return

  return new Promise((resolve) => {
    if (netServer) {
      netServer.close(() => {
        if (aedesInstance) {
          aedesInstance.close(() => {
            isRunning = false
            console.log('[Aedes MQTT] Embedded broker stopped.')
            resolve()
          })
        } else {
          isRunning = false
          resolve()
        }
      })
    } else {
      isRunning = false
      resolve()
    }
  })
}

module.exports = {
  startEmbeddedBroker,
  stopEmbeddedBroker,
}
