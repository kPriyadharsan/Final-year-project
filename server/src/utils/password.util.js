const bcrypt = require('bcryptjs')

// Default salt rounds for bcrypt hashing (balanced for security and performance)
const DEFAULT_SALT_ROUNDS = 10

/**
 * Asynchronously hashes a plain-text password using bcrypt.
 *
 * @param {string} plainPassword - The plain-text password to hash.
 * @param {number} [saltRounds=DEFAULT_SALT_ROUNDS] - Cost factor for salt generation.
 * @returns {Promise<string>} The resulting secure bcrypt password hash.
 * @throws {Error} If plainPassword is missing, empty, or not a string.
 */
async function hashPassword(plainPassword, saltRounds = DEFAULT_SALT_ROUNDS) {
  if (!plainPassword || typeof plainPassword !== 'string' || plainPassword.trim() === '') {
    throw new Error('Invalid input: Password must be a non-empty string.')
  }

  if (typeof saltRounds !== 'number' || saltRounds < 4 || saltRounds > 31) {
    throw new Error('Invalid saltRounds: Must be a number between 4 and 31.')
  }

  const salt = await bcrypt.genSalt(saltRounds)
  return await bcrypt.hash(plainPassword, salt)
}

/**
 * Asynchronously compares a candidate plain-text password with a bcrypt hash.
 *
 * @param {string} plainPassword - The plain-text password to verify.
 * @param {string} hash - The stored bcrypt hash to compare against.
 * @returns {Promise<boolean>} True if the password matches the hash, false otherwise.
 * @throws {Error} If either parameter is missing, empty, or not a string.
 */
async function comparePassword(plainPassword, hash) {
  if (!plainPassword || typeof plainPassword !== 'string') {
    throw new Error('Invalid input: Plain password must be a non-empty string.')
  }

  if (!hash || typeof hash !== 'string') {
    throw new Error('Invalid input: Hash must be a non-empty string.')
  }

  // bcrypt.compare safely handles time-constant comparison
  return await bcrypt.compare(plainPassword, hash)
}

/**
 * Helper to quickly verify if a string matches the standard bcrypt hash format.
 *
 * @param {string} hash - String to check.
 * @returns {boolean} True if string matches standard bcrypt signature.
 */
function isBcryptHash(hash) {
  if (!hash || typeof hash !== 'string') return false
  return /^\$2[aby]?\$\d{2}\$[./A-Za-z0-9]{53}$/.test(hash)
}

module.exports = {
  hashPassword,
  comparePassword,
  isBcryptHash,
  DEFAULT_SALT_ROUNDS,
}
