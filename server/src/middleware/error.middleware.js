const env = require('../config/env')

/**
 * Production-Safe Centralized Error Handler Middleware
 *
 * Requirements:
 * 1. Never expose stack traces or raw internal driver messages in production
 * 2. Sanitize error responses
 * 3. Handle CORS errors with 403
 * 4. Handle Mongoose CastError / ValidationError with 400
 * 5. Handle JSON parse SyntaxError with 400
 * 6. Never expose secrets or passwords
 */
function errorHandler(err, req, res, next) {
  // If response headers have already been transmitted, delegate to default express handler
  if (res.headersSent) {
    return next(err)
  }

  // 1. CORS Policy Violation
  if (err.status === 403 || (err.message && err.message.includes('CORS policy'))) {
    return res.status(403).json({
      status: 'error',
      code: 'CORS_FORBIDDEN',
      message: 'Access denied: Origin is not permitted by CORS policy.',
    })
  }

  // 2. Malformed JSON Body (Express built-in SyntaxError)
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      status: 'error',
      code: 'BAD_REQUEST',
      message: 'Malformed JSON payload in request body.',
    })
  }

  // 3. Mongoose Invalid ObjectId (CastError)
  if (err.name === 'CastError') {
    return res.status(400).json({
      status: 'error',
      code: 'INVALID_IDENTIFIER',
      message: `Invalid format for resource identifier.`,
    })
  }

  // 4. Mongoose Document Validation Error
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors || {}).map((e) => e.message)
    return res.status(400).json({
      status: 'error',
      code: 'VALIDATION_ERROR',
      message: messages.length > 0 ? messages.join('. ') : 'Database validation failed.',
    })
  }

  // 5. MongoDB Duplicate Key (E11000)
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0] || 'field'
    return res.status(409).json({
      status: 'error',
      code: 'DUPLICATE_KEY',
      message: `A record with this ${field} already exists.`,
    })
  }

  // 6. Generic/Operational Status Code
  const statusCode = err.status || err.statusCode || 500

  // Log full error details on the server side
  console.error(`[Server Error] HTTP ${statusCode} on ${req.method} ${req.originalUrl}:`, err.message)

  // In production, sanitize 500 Internal Server Errors to prevent leaking internal traces or file paths
  const isProduction = env.NODE_ENV === 'production'
  let safeMessage = err.message || 'Internal Server Error'

  if (isProduction && statusCode >= 500) {
    safeMessage = 'Internal Server Error. Please contact system administrator.'
  }

  const responsePayload = {
    status: 'error',
    code: err.code || (statusCode >= 500 ? 'INTERNAL_SERVER_ERROR' : 'REQUEST_FAILED'),
    message: safeMessage,
  }

  // Only attach stack trace in non-production environments
  if (!isProduction && err.stack) {
    responsePayload.stack = err.stack
  }

  return res.status(statusCode).json(responsePayload)
}

module.exports = {
  errorHandler,
}
