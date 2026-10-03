const mongoose = require('mongoose')

/**
 * Controlled Log Actions & Status Enums
 */
const LOG_ACTIONS = Object.freeze({
  ON: 'ON',
  OFF: 'OFF',
})

const MQTT_DELIVERY_STATUS = Object.freeze({
  PUBLISHED: 'PUBLISHED',
  OFFLINE_QUEUED: 'OFFLINE_QUEUED',
  FAILED: 'FAILED',
})

const deviceLogSchema = new mongoose.Schema(
  {
    device: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Device',
      required: [true, 'Device reference is required'],
      index: true,
    },
    deviceId: {
      type: String,
      required: [true, 'Hardware deviceId is required'],
      uppercase: true,
      trim: true,
      index: true,
    },
    deviceName: {
      type: String,
      required: [true, 'Device name snapshot is required'],
      trim: true,
    },
    classroom: {
      type: String,
      required: [true, 'Classroom identifier snapshot is required'],
      trim: true,
      index: true,
    },
    action: {
      type: String,
      required: [true, 'Command action is required'],
      enum: {
        values: Object.values(LOG_ACTIONS),
        message: 'Invalid action. Allowed actions: ON, OFF',
      },
      uppercase: true,
      trim: true,
    },
    previousState: {
      type: String,
      enum: Object.values(LOG_ACTIONS),
      default: null,
    },
    newState: {
      type: String,
      required: [true, 'New state is required'],
      enum: Object.values(LOG_ACTIONS),
      uppercase: true,
    },
    topic: {
      type: String,
      required: [true, 'MQTT command topic is required'],
      trim: true,
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    mqttStatus: {
      type: String,
      enum: Object.values(MQTT_DELIVERY_STATUS),
      default: MQTT_DELIVERY_STATUS.PUBLISHED,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false,
      default: null,
      index: true,
    },
    userName: {
      type: String,
      required: true,
      trim: true,
    },
    userRole: {
      type: String,
      required: true,
      trim: true,
    },
    source: {
      type: String,
      default: 'REST_API',
      trim: true,
    },
    errorMessage: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (doc, ret) => {
        delete ret.__v
        return ret
      },
    },
    toObject: {
      virtuals: true,
      transform: (doc, ret) => {
        delete ret.__v
        return ret
      },
    },
  }
)

// Index for chronological classroom and device telemetry inspection
deviceLogSchema.index({ device: 1, createdAt: -1 })
deviceLogSchema.index({ deviceId: 1, createdAt: -1 })
deviceLogSchema.index({ classroom: 1, createdAt: -1 })
deviceLogSchema.index({ user: 1, createdAt: -1 })

const DeviceLog = mongoose.model('DeviceLog', deviceLogSchema)

module.exports = {
  DeviceLog,
  LOG_ACTIONS,
  MQTT_DELIVERY_STATUS,
}
