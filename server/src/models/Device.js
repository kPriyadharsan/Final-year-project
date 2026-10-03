const mongoose = require('mongoose')

/**
 * Controlled Device Types Enum for Smart Classroom IoT system
 */
const DEVICE_TYPES = Object.freeze({
  LIGHT: 'LIGHT',
  FAN: 'FAN',
  PROJECTOR: 'PROJECTOR',
  OTHER: 'OTHER',
})

/**
 * Controlled Operating States
 */
const DEVICE_STATES = Object.freeze({
  ON: 'ON',
  OFF: 'OFF',
})

const deviceSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Device name is required'],
      trim: true,
      minlength: [2, 'Device name must be at least 2 characters'],
      maxlength: [100, 'Device name cannot exceed 100 characters'],
    },
    type: {
      type: String,
      required: [true, 'Device type is required'],
      enum: {
        values: Object.values(DEVICE_TYPES),
        message: 'Invalid device type. Allowed types: LIGHT, FAN, PROJECTOR, OTHER',
      },
      uppercase: true,
      trim: true,
    },
    classroom: {
      type: String,
      required: [true, 'Classroom identifier is required'],
      trim: true,
      maxlength: [100, 'Classroom identifier cannot exceed 100 characters'],
      index: true,
    },
    deviceId: {
      type: String,
      required: [true, 'Unique hardware deviceId is required'],
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    mqttCommandTopic: {
      type: String,
      required: [true, 'MQTT command topic is required'],
      trim: true,
    },
    mqttStatusTopic: {
      type: String,
      required: [true, 'MQTT status topic is required'],
      trim: true,
    },
    state: {
      type: String,
      enum: {
        values: Object.values(DEVICE_STATES),
        message: 'Invalid state. Allowed states: ON, OFF',
      },
      default: DEVICE_STATES.OFF,
      uppercase: true,
      trim: true,
    },
    isOnline: {
      type: Boolean,
      default: false,
      index: true,
    },
    gpioPin: {
      type: Number,
      min: [0, 'GPIO pin cannot be negative'],
      max: [40, 'GPIO pin cannot exceed 40 on standard ESP32/NodeMCU controllers'],
      default: null,
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters'],
      default: '',
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
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

// Compound and lookup indexes for fast queries
deviceSchema.index({ classroom: 1, type: 1 })
deviceSchema.index({ classroom: 1, isActive: 1 })
deviceSchema.index({ mqttStatusTopic: 1 })
deviceSchema.index({ mqttCommandTopic: 1 })

const Device = mongoose.model('Device', deviceSchema)

module.exports = {
  Device,
  DEVICE_TYPES,
  DEVICE_STATES,
}
