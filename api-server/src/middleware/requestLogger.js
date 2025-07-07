const logger = require('../utils/logger')

function requestLogger(req, res, next) {
  const startTime = Date.now()
  
  // 记录请求开始
  const requestInfo = {
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    contentType: req.get('Content-Type'),
    contentLength: req.get('Content-Length'),
    userId: req.user?.id,
    timestamp: new Date().toISOString()
  }

  // 监听响应完成
  res.on('finish', () => {
    const duration = Date.now() - startTime
    const responseInfo = {
      ...requestInfo,
      statusCode: res.statusCode,
      responseTime: duration,
      responseSize: res.get('Content-Length')
    }

    // 根据状态码选择日志级别
    if (res.statusCode >= 500) {
      logger.error('Request completed with server error', responseInfo)
    } else if (res.statusCode >= 400) {
      logger.warn('Request completed with client error', responseInfo)
    } else {
      logger.access('Request completed successfully', responseInfo)
    }
  })

  next()
}

module.exports = requestLogger