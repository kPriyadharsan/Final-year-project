const { VoiceCommand, EXECUTION_STATUSES } = require('../models/VoiceCommand')
const commandParserService = require('../services/commandParser.service')
const deviceCommandService = require('../services/deviceCommand.service')

/**
 * @desc    Process natural language voice transcript, validate intent, execute hardware control or return software intent, and audit log
 * @route   POST /api/voice/command
 * @access  Public / Authenticated
 */
async function handleVoiceCommand(req, res) {
  try {
    const rawTranscript = req.body.transcript || req.body.text || req.body.command

    // 1. Validate transcript input
    if (!rawTranscript || typeof rawTranscript !== 'string' || rawTranscript.trim() === '') {
      return res.status(400).json({
        status: 'error',
        code: 'TRANSCRIPT_REQUIRED',
        message: 'A valid text "transcript" is required in the request body.',
        example: {
          transcript: 'Turn on the fan',
        },
      })
    }

    const transcript = rawTranscript.trim()
    const classroom = req.body.classroom || process.env.DEFAULT_CLASSROOM || 'Room 302'
    const currentUser = req.user || null

    console.log(`[VoiceController] 🎙️ Processing voice command: "${transcript}" (User: ${currentUser ? currentUser.name : 'Anonymous'})`)

    // 2. Pass transcript to Gemini intent parser
    const parsed = await commandParserService.parseClassroomCommand(transcript)

    let executionStatus = EXECUTION_STATUSES.UNRECOGNIZED
    let humanReadableMessage = ''
    let executionDetails = {}

    // 3. Process Intent with Strict Backend Enforcement
    // NEVER let Gemini directly execute an MQTT command.
    if (parsed.intent === 'DEVICE_CONTROL') {
      // Backend validates parsed device & action against allowlists
      if (parsed.isValid && parsed.device && parsed.action) {
        // Execute through backend device command service
        const cmdResult = await deviceCommandService.executeDeviceCommand({
          deviceType: parsed.device,
          action: parsed.action,
          color: parsed.color,
          classroom,
          user: currentUser,
          source: 'VOICE_COMMAND',
        })

        if (cmdResult.success && cmdResult.delivered) {
          executionStatus = EXECUTION_STATUSES.EXECUTED
          humanReadableMessage = cmdResult.message
          executionDetails = {
            device: cmdResult.device,
            mqtt: cmdResult.mqtt,
            logId: cmdResult.logId,
          }
        } else {
          executionStatus = EXECUTION_STATUSES.FAILED
          humanReadableMessage = cmdResult.message || 'Command could not be delivered.'
          executionDetails = {
            code: cmdResult.code || 'DELIVERY_FAILED',
            reason: cmdResult.message || 'Command could not be delivered.',
            device: cmdResult.device,
          }
        }
      } else {
        executionStatus = EXECUTION_STATUSES.FAILED
        humanReadableMessage = parsed.reason || 'Device control validation failed.'
        executionDetails = { reason: parsed.reason }
      }
    } else if (parsed.intent !== 'UNKNOWN') {
      // Software intents (CREATE_NOTE, CREATE_QUIZ, CREATE_IMAGE, CREATE_PPT)
      executionStatus = EXECUTION_STATUSES.DETECTED
      const intentNames = {
        CREATE_NOTE: 'Create Notes',
        CREATE_QUIZ: 'Create Quiz',
        CREATE_IMAGE: 'Generate Image',
        CREATE_PPT: 'Generate Presentation',
      }
      const label = intentNames[parsed.intent] || parsed.intent
      humanReadableMessage = `Detected software intent: ${label}. Ready for generation.`
      executionDetails = {
        intent: parsed.intent,
        softwareModule: parsed.intent.toLowerCase().replace('_', '-'),
      }
    } else {
      // UNKNOWN or conversational questions: query Gemini AI for smart natural response
      const geminiService = require('../services/gemini.service')
      if (geminiService.isConfigured()) {
        try {
          const aiGen = await geminiService.generateText(transcript, {
            systemInstruction:
              'You are the AI Voice Assistant for Smart Classroom Room 302. Answer concisely in 1 to 2 clear sentences suitable for audio speech.',
            maxOutputTokens: 120,
          })
          if (aiGen && aiGen.text) {
            executionStatus = EXECUTION_STATUSES.DETECTED
            humanReadableMessage = aiGen.text.trim()
            executionDetails = {
              intent: 'CONVERSATIONAL_AI',
              aiResponse: aiGen.text.trim(),
            }
          } else {
            executionStatus = EXECUTION_STATUSES.UNRECOGNIZED
            humanReadableMessage = 'I could not process that request. Try a classroom device command.'
            executionDetails = { reason: parsed.reason || 'Unrecognized command' }
          }
        } catch (aiErr) {
          console.warn('[VoiceController] Conversational AI fallback warning:', aiErr.message)
          executionStatus = EXECUTION_STATUSES.UNRECOGNIZED
          humanReadableMessage = 'Command not recognized in classroom.'
          executionDetails = { reason: aiErr.message }
        }
      } else {
        executionStatus = EXECUTION_STATUSES.UNRECOGNIZED
        humanReadableMessage = 'Voice command not recognized or unsupported in classroom environment.'
        executionDetails = {
          reason: parsed.reason || 'Unrecognized command',
        }
      }
    }

    // 4. Store voice command in VoiceCommand model
    const voiceRecord = await VoiceCommand.create({
      user: currentUser ? currentUser._id : null,
      transcript,
      intent: parsed.intent,
      device: parsed.device || null,
      action: parsed.action || null,
      result: {
        executionStatus,
        message: humanReadableMessage,
        ...executionDetails,
      },
      createdAt: new Date(),
    })

    console.log(`[VoiceController] 💾 Voice command logged: [${voiceRecord._id}] -> Intent: ${parsed.intent}, Status: ${executionStatus}`)

    // 5. Return standardized response containing all required fields
    return res.status(200).json({
      status: 'success',
      data: {
        transcript,
        intent: parsed.intent,
        device: parsed.device || null,
        action: parsed.action || null,
        executionStatus,
        message: humanReadableMessage,
        humanReadableMessage, // Alias for compatibility
        confidence: parsed.confidence,
        voiceCommandId: voiceRecord._id,
        createdAt: voiceRecord.createdAt.toISOString(),
        details: executionDetails,
      },
    })
  } catch (err) {
    console.error('Error processing voice command:', err)
    return res.status(500).json({
      status: 'error',
      code: 'VOICE_COMMAND_ERROR',
      message: 'Failed to process voice command.',
    })
  }
}

/**
 * @desc    Get history of recent voice commands
 * @route   GET /api/voice/history
 * @access  Private (SUPER_ADMIN, TEACHER)
 */
async function getVoiceHistory(req, res) {
  try {
    const limit = parseInt(req.query.limit, 10) || 20
    const filter = {}

    if (req.query.intent) {
      filter.intent = req.query.intent.trim().toUpperCase()
    }

    const commands = await VoiceCommand.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('user', 'name email role')
      .lean()

    return res.status(200).json({
      status: 'success',
      count: commands.length,
      commands,
      data: commands,
    })
  } catch (err) {
    console.error('Error fetching voice history:', err)
    return res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve voice command history.',
    })
  }
}

module.exports = {
  handleVoiceCommand,
  getVoiceHistory,
}
