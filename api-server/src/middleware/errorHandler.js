const logger = require('../utils/logger')

function errorHandler(err, req, res, next) {
  // 记录错误
  logger.error('Error occurred:', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.user?.id
  })

  // 默认错误响应
  let statusCode = 500
  let message = 'Internal Server Error'
  let details = null

  // 根据错误类型设置响应
  if (err.name === 'ValidationError') {
    statusCode = 400
    message = 'Validation Error'
    details = err.details || err.message
  } else if (err.name === 'UnauthorizedError' || err.message.includes('unauthorized')) {
    statusCode = 401
    message = 'Unauthorized'
  } else if (err.name === 'ForbiddenError' || err.message.includes('forbidden')) {
    statusCode = 403
    message = 'Forbidden'
  } else if (err.name === 'NotFoundError' || err.message.includes('not found')) {
    statusCode = 404
    message = 'Not Found'
  } else if (err.name === 'ConflictError' || err.message.includes('conflict')) {
    statusCode = 409
    message = 'Conflict'
  } else if (err.code === 'LIMIT_FILE_SIZE') {
    statusCode = 413
    message = 'File too large'
  } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    statusCode = 400
    message = 'Unexpected file field'
  }

  // 构建错误响应
  const errorResponse = {
    error: {
      message,
      status: statusCode,
      timestamp: new Date().toISOString()
    }
  }

  // 在开发环境中包含更多错误信息
  if (process.env.NODE_ENV === 'development') {
    errorResponse.error.stack = err.stack
    errorResponse.error.details = details || err.message
  } else if (details) {
    errorResponse.error.details = details
  }

  res.status(statusCode).json(errorResponse)
}

module.exports = errorHandler