const mongoose = require('mongoose')

const demoStateSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: 'GLOBAL_DEMO_STATE',
    },
    currentGeneration: {
      type: Number,
      required: true,
      default: 1,
      min: 1,
    },
    activeSessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DemoSession',
      default: null,
    },
    lastResetAt: {
      type: Date,
      default: null,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
  }
)

const DemoState = mongoose.model('DemoState', demoStateSchema)

module.exports = {
  DemoState,
}
