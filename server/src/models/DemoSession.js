const mongoose = require('mongoose')

const DEMO_STATUS = Object.freeze({
  ACTIVE: 'ACTIVE',
  REVOKED: 'REVOKED',
  EXPIRED: 'EXPIRED',
})

const demoSessionSchema = new mongoose.Schema(
  {
    tokenHash: {
      type: String,
      required: [true, 'Token hash is required'],
      unique: true,
      index: true,
    },
    tokenPrefix: {
      type: String,
      required: [true, 'Token prefix is required for auditing'],
      trim: true,
    },
    generation: {
      type: Number,
      required: [true, 'Session generation/version is required'],
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    status: {
      type: String,
      enum: {
        values: Object.values(DEMO_STATUS),
        message: 'Invalid demo session status: {VALUE}',
      },
      default: DEMO_STATUS.ACTIVE,
      index: true,
    },
    expiresAt: {
      type: Date,
      required: [true, 'Expiry timestamp is required'],
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    scanCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastScannedAt: {
      type: Date,
      default: null,
    },
    revokedAt: {
      type: Date,
      default: null,
    },
    revokedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (doc, ret) => {
        delete ret.tokenHash // CRITICAL: Never expose token hash in API responses
        delete ret.__v
        return ret
      },
    },
    toObject: {
      virtuals: true,
      transform: (doc, ret) => {
        delete ret.tokenHash
        delete ret.__v
        return ret
      },
    },
  }
)

// Compound index for active generation query
demoSessionSchema.index({ generation: 1, isActive: 1 })
demoSessionSchema.index({ status: 1, expiresAt: 1 })

// MongoDB TTL Index: automatically purge expired demo session records
demoSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

const DemoSession = mongoose.model('DemoSession', demoSessionSchema)

module.exports = {
  DemoSession,
  DEMO_STATUS,
}
