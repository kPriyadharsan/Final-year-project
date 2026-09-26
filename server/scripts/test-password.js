/**
 * Automated Test Suite for Reusable Password Utilities
 * Run with: npm run test:password (or node scripts/test-password.js)
 */
const { hashPassword, comparePassword, isBcryptHash } = require('../src/utils/password.util')
const { User, ROLES } = require('../src/models/User')

async function runPasswordTests() {
  console.log('='.repeat(65))
  console.log('🔐 Password Hashing Utilities Test Suite (bcrypt)')
  console.log('='.repeat(65))

  let passed = 0
  let failed = 0

  const assert = (condition, testName) => {
    if (condition) {
      console.log(`  ✅ PASS: ${testName}`)
      passed++
    } else {
      console.error(`  ❌ FAIL: ${testName}`)
      failed++
    }
  }

  try {
    // Test 1: Hashing a valid plain-text password
    console.log('\n[1] Basic Hashing & Verification')
    const plain = 'SmartClassroom2026!Secure'
    const hash = await hashPassword(plain)

    assert(typeof hash === 'string', 'hashPassword returns a string')
    assert(isBcryptHash(hash), 'Generated hash matches bcrypt pattern ($2a/b$...)')
    assert(hash !== plain, 'Password is never stored in plain text')

    // Test 2: Comparing correct password
    console.log('\n[2] Comparison Checks')
    const match = await comparePassword(plain, hash)
    assert(match === true, 'comparePassword returns TRUE for matching password')

    // Test 3: Comparing incorrect password
    const wrong = await comparePassword('WrongPassword123', hash)
    assert(wrong === false, 'comparePassword returns FALSE for incorrect password')

    // Test 4: Salt randomness (same password yields different unique hashes)
    console.log('\n[3] Salt Randomness')
    const hash2 = await hashPassword(plain)
    assert(hash !== hash2, 'Subsequent hashes of identical password produce distinct salts')
    assert(await comparePassword(plain, hash2), 'Both distinct hashes still verify against the original plain password')

    // Test 5: Input validation / error handling
    console.log('\n[4] Input Validation & Edge Cases')
    let emptyCaught = false
    try {
      await hashPassword('')
    } catch {
      emptyCaught = true
    }
    assert(emptyCaught, 'Rejects empty password with clear error')

    let nullCaught = false
    try {
      await hashPassword(null)
    } catch {
      nullCaught = true
    }
    assert(nullCaught, 'Rejects null input with clear error')

    let compareEmptyCaught = false
    try {
      await comparePassword('', hash)
    } catch {
      compareEmptyCaught = true
    }
    assert(compareEmptyCaught, 'comparePassword rejects empty candidate password')

    // Test 6: User Model Integration
    console.log('\n[5] User Model Integration')
    const userHash = await hashPassword('TeacherSecret123')
    const teacher = new User({
      name: 'Professor Curie',
      email: 'curie@classroom.edu',
      passwordHash: userHash,
      role: ROLES.TEACHER,
    })

    assert(teacher.validateSync() === undefined, 'User document validates with bcrypt hash')
    assert(await teacher.comparePassword('TeacherSecret123'), 'teacher.comparePassword succeeds with right password')
    assert(!(await teacher.comparePassword('BadSecret')), 'teacher.comparePassword fails with wrong password')
    assert(teacher.toJSON().passwordHash === undefined, 'passwordHash is excluded from serialized toJSON output')

    console.log('\n' + '='.repeat(65))
    console.log(`🎉 TEST SUMMARY: ${passed} passed, ${failed} failed`)
    console.log('='.repeat(65) + '\n')

    process.exit(failed > 0 ? 1 : 0)
  } catch (err) {
    console.error('\n❌ Unexpected error running password tests:', err)
    process.exit(1)
  }
}

runPasswordTests()
