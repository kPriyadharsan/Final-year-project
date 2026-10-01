const mongoose = require('mongoose')

const VOICE_INTENTS = Object.freeze({
  DEVICE_CONTROL: 'DEVICE_CONTROL',
  CREATE_NOTE: 'CREATE_NOTE',
  CREATE_QUIZ: 'CREATE_QUIZ',
  CREATE_IMAGE: 'CREATE_IMAGE',
  CREATE_PPT: 'CREATE_PPT',
  UNKNOWN: 'UNKNOWN',
})

const EXECUTION_STATUSES = Object.freeze({
  EXECUTED: 'EXECUTED',
  DETECTED: 'DETECTED',
  FAILED: 'FAILED',
  UNRECOGNIZED: 'UNRECOGNIZED',
})

const voiceCommandSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    transcript: {
      type: String,
      required: [true, 'Voice command transcript is required'],
      trim: true,
    },
    intent: {
      type: String,
      required: [true, 'Classified intent is required'],
      uppercase: true,
      trim: true,
      index: true,
    },
    device: {
      type: String,
      lowercase: true,
      trim: true,
      default: null,
    },
    action: {
      type: String,
      uppercase: true,
      trim: true,
      default: null,
    },
    result: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    versionKey: false,
  }
)

const VoiceCommand = mongoose.models.VoiceCommand || mongoose.model('VoiceCommand', voiceCommandSchema)

module.exports = {
  VoiceCommand,
  VOICE_INTENTS,
  EXECUTION_STATUSES,
}
