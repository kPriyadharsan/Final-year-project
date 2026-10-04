require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') })
const mongoose = require('mongoose')
const { Device } = require('../src/models/Device')

async function run() {
  await mongoose.connect(process.env.MONGODB_URI)
  const p = await Device.findOneAndUpdate(
    { type: 'PROJECTOR' },
    {
      $set: {
        color: { r: 59, g: 130, b: 246 },
        colorPower: 'OFF',
      },
    },
    { new: true }
  )
  console.log('UPDATED PROJECTOR IN DB:', JSON.stringify({
    deviceId: p?.deviceId,
    state: p?.state,
    colorPower: p?.colorPower,
    color: p?.color,
  }, null, 2))
  await mongoose.disconnect()
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
