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
 * Entity Hierarchy Distinction:
 * NODE: Physical ESP32 microcontroller board (e.g. ESP32-RM302-01)
 * CHANNEL: Controllable relay channel output belonging to a controller node (e.g. LIGHT, FAN, PROJECTOR)
 */
const DEVICE_CATEGORIES = Object.freeze({
  NODE: 'NODE',
  CHANNEL: 'CHANNEL',
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
    deviceCategory: {
      type: String,
      enum: {
        values: Object.values(DEVICE_CATEGORIES),
        message: 'Invalid device category. Allowed: NODE, CHANNEL',
      },
      default: function () {
        return this.type === DEVICE_TYPES.OTHER ? DEVICE_CATEGORIES.NODE : DEVICE_CATEGORIES.CHANNEL
      },
      uppercase: true,
      trim: true,
      index: true,
    },
    entityType: {
      type: String,
      enum: {
        values: Object.values(DEVICE_CATEGORIES),
        message: 'Invalid entity type. Allowed: NODE, CHANNEL',
      },
      default: function () {
        return this.type === DEVICE_TYPES.OTHER ? DEVICE_CATEGORIES.NODE : DEVICE_CATEGORIES.CHANNEL
      },
      uppercase: true,
      trim: true,
      index: true,
    },
    nodeId: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
      index: true,
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
    requestedState: {
      type: String,
      enum: Object.values(DEVICE_STATES),
      default: null,
      uppercase: true,
      trim: true,
    },
    confirmedState: {
      type: String,
      enum: Object.values(DEVICE_STATES),
      default: null,
      uppercase: true,
      trim: true,
    },
    lastCommandedAt: {
      type: Date,
      default: null,
    },
    lastConfirmedAt: {
      type: Date,
      default: null,
    },
    isOnline: {
      type: Boolean,
      default: false,
      index: true,
    },
    lastSeenAt: {
      type: Date,
      default: null,
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
deviceSchema.index({ classroom: 1, entityType: 1 })
deviceSchema.index({ mqttStatusTopic: 1 })
deviceSchema.index({ mqttCommandTopic: 1 })

// Auto-populate standardized MQTT topics if not provided
const { getCommandTopic, getStateTopic, getAvailabilityTopic } = require('../utils/mqttTopics')
deviceSchema.pre('validate', function (next) {
  // Synchronize entityType and deviceCategory
  if (this.deviceCategory && !this.entityType) {
    this.entityType = this.deviceCategory
  } else if (this.entityType && !this.deviceCategory) {
    this.deviceCategory = this.entityType
  } else if (!this.deviceCategory && !this.entityType) {
    const isNode = this.type === DEVICE_TYPES.OTHER
    this.deviceCategory = isNode ? DEVICE_CATEGORIES.NODE : DEVICE_CATEGORIES.CHANNEL
    this.entityType = this.deviceCategory
  }

  // Populate MQTT topics if missing
  if (this.classroom) {
    const isNode = this.entityType === DEVICE_CATEGORIES.NODE || this.type === DEVICE_TYPES.OTHER
    if (isNode) {
      if (!this.mqttCommandTopic || this.mqttCommandTopic.trim() === '') {
        this.mqttCommandTopic = getAvailabilityTopic(this.classroom)
      }
      if (!this.mqttStatusTopic || this.mqttStatusTopic.trim() === '') {
        this.mqttStatusTopic = getAvailabilityTopic(this.classroom)
      }
    } else if (this.type) {
      if (!this.mqttCommandTopic || this.mqttCommandTopic.trim() === '') {
        this.mqttCommandTopic = getCommandTopic(this.classroom, this.type)
      }
      if (!this.mqttStatusTopic || this.mqttStatusTopic.trim() === '') {
        this.mqttStatusTopic = getStateTopic(this.classroom, this.type)
      }
    }
  }
  next()
})

const Device = mongoose.model('Device', deviceSchema)

module.exports = {
  Device,
  DEVICE_TYPES,
  DEVICE_CATEGORIES,
  DEVICE_STATES,
}
