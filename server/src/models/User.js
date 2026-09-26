const mongoose = require('mongoose')
const bcrypt = require('bcryptjs')

/**
 * Controlled Role Enums for Smart Classroom System
 */
const ROLES = Object.freeze({
  SUPER_ADMIN: 'SUPER_ADMIN',
  TEACHER: 'TEACHER',
  STUDENT: 'STUDENT',
})

/**
 * Roles currently authorized for Dashboard access
 * (Per specifications: SUPER_ADMIN and TEACHER)
 */
const DASHBOARD_ROLES = Object.freeze([
  ROLES.SUPER_ADMIN,
  ROLES.TEACHER,
])

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'User name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email address is required'],
      unique: true,
      trim: true,
      lowercase: true,
      match: [
        /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
        'Please enter a valid email address',
      ],
      index: true,
    },
    passwordHash: {
      type: String,
      required: [true, 'Password hash is required'],
      select: false, // Prevents passwordHash from being selected by default in queries
    },
    role: {
      type: String,
      required: [true, 'User role is required'],
      enum: {
        values: Object.values(ROLES),
        message: 'Invalid role "{VALUE}". Allowed roles are: ' + Object.values(ROLES).join(', '),
      },
      default: ROLES.STUDENT,
    },
    department: {
      type: String,
      trim: true,
      default: '',
    },
    assignedClasses: {
      type: [{ type: String, trim: true }],
      default: [],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (doc, ret) => {
        delete ret.passwordHash
        delete ret.__v
        return ret
      },
    },
    toObject: {
      virtuals: true,
      transform: (doc, ret) => {
        delete ret.passwordHash
        delete ret.__v
        return ret
      },
    },
  }
)

/**
 * Virtual: Checks if the user has dashboard access privileges
 * Returns true for SUPER_ADMIN and TEACHER
 */
userSchema.virtual('hasDashboardAccess').get(function () {
  return DASHBOARD_ROLES.includes(this.role)
})

/**
 * Static Helper: Securely hashes a plain-text password using bcrypt
 * @param {string} plainPassword
 * @param {number} saltRounds
 * @returns {Promise<string>}
 */
userSchema.statics.hashPassword = async function (plainPassword, saltRounds = 10) {
  if (!plainPassword || typeof plainPassword !== 'string') {
    throw new Error('A valid string password must be provided for hashing.')
  }
  return await bcrypt.hash(plainPassword, saltRounds)
}

/**
 * Instance Method: Compares a candidate plain-text password with the stored hash
 * @param {string} candidatePassword
 * @returns {Promise<boolean>}
 */
userSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.passwordHash) {
    throw new Error('Password hash is not loaded. Ensure select("+passwordHash") was used in the query.')
  }
  return await bcrypt.compare(candidatePassword, this.passwordHash)
}

const User = mongoose.model('User', userSchema)

module.exports = {
  User,
  ROLES,
  DASHBOARD_ROLES,
}
