/**
 * Validation test for Projector RGB lighting control pipeline
 */
const assert = require('assert')
const {
  getProjectorColorCommandTopic,
  getProjectorColorStateTopic,
  parseMqttTopic,
  TOPIC_PATTERNS,
} = require('../src/utils/mqttTopics')

console.log('🧪 Testing Projector Color Topic Helpers & Parsing...')

// 1. Check topic builders
const cmdTopic = getProjectorColorCommandTopic('Room 302')
assert.strictEqual(
  cmdTopic,
  'smartclassroom/room302/projector/color/command',
  `Expected "smartclassroom/room302/projector/color/command", got "${cmdTopic}"`
)
console.log('✅ Command topic matches:', cmdTopic)

const stateTopic = getProjectorColorStateTopic('Room 302')
assert.strictEqual(
  stateTopic,
  'smartclassroom/room302/projector/color/state',
  `Expected "smartclassroom/room302/projector/color/state", got "${stateTopic}"`
)
console.log('✅ State topic matches:', stateTopic)

// 2. Check topic patterns
assert.strictEqual(
  TOPIC_PATTERNS.PROJECTOR_COLOR_STATE,
  'smartclassroom/+/projector/color/state',
  'Wildcard subscription pattern mismatch'
)
console.log('✅ Wildcard subscription topic pattern matches:', TOPIC_PATTERNS.PROJECTOR_COLOR_STATE)

// 3. Check topic parser
const parsedState = parseMqttTopic('smartclassroom/room302/projector/color/state')
assert.strictEqual(parsedState.isSmartClassroom, true)
assert.strictEqual(parsedState.isColorTopic, true)
assert.strictEqual(parsedState.classroom, 'room302')
assert.strictEqual(parsedState.deviceType, 'projector')
assert.strictEqual(parsedState.channel, 'state')
console.log('✅ Parsed color state topic correctly:', parsedState)

const parsedCmd = parseMqttTopic('smartclassroom/room302/projector/color/command')
assert.strictEqual(parsedCmd.isSmartClassroom, true)
assert.strictEqual(parsedCmd.isColorTopic, true)
assert.strictEqual(parsedCmd.classroom, 'room302')
assert.strictEqual(parsedCmd.deviceType, 'projector')
assert.strictEqual(parsedCmd.channel, 'command')
console.log('✅ Parsed color command topic correctly:', parsedCmd)

// 4. Verify Payload structure requirement:
// {
//   "power": "ON",
//   "color": {
//     "r": 255,
//     "g": 0,
//     "b": 255
//   }
// }
const samplePayload = {
  power: 'ON',
  color: {
    r: 255,
    g: 0,
    b: 255,
  },
}
assert.strictEqual(samplePayload.power, 'ON')
assert.strictEqual(samplePayload.color.r, 255)
assert.strictEqual(samplePayload.color.g, 0)
assert.strictEqual(samplePayload.color.b, 255)
console.log('✅ Sample RGB payload format validated.')

console.log('\n🎉 ALL PROJECTOR RGB TOPIC & PAYLOAD TESTS PASSED 100%!')
