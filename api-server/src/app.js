const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const rateLimit = require('express-rate-limit')
const path = require('path')
require('dotenv').config()

const logger = require('./utils/logger')
const { connectDB } = require('./database/connection')
const { connectRedis } = require('./utils/redis')
const errorHandler = require('./middleware/errorHandler')
const requestLogger = require('./middleware/requestLogger')

// 导入路由
const authRoutes = require('./routes/auth')
const userRoutes = require('./routes/users')
const videoRoutes = require('./routes/videos')
const uploadRoutes = require('./routes/upload')
const healthRoutes = require('./routes/health')

const app = express()
const PORT = process.env.PORT || 3000

// 安全中间件
app.use(helmet())

// CORS 配置
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}))

// 速率限制
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 分钟
  max: 100, // 限制每个 IP 15 分钟内最多 100 个请求
  message: {
    error: 'Too many requests from this IP, please try again later.'
  }
})
app.use('/api/', limiter)

// 解析 JSON 和 URL 编码的请求体
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// 请求日志中间件
app.use(requestLogger)

// 静态文件服务
app.use('/uploads', express.static(path.join(__dirname, '../uploads')))

// API 路由
app.use('/api/auth', authRoutes)
app.use('/api/users', userRoutes)
app.use('/api/videos', videoRoutes)
app.use('/api/upload', uploadRoutes)
app.use('/api/health', healthRoutes)

// 根路径
app.get('/', (req, res) => {
  res.json({
    message: 'Video Platform API Server',
    version: '1.0.0',
    status: 'running',
    timestamp: new Date().toISOString()
  })
})

// 404 处理
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl,
    method: req.method
  })
})

// 错误处理中间件
app.use(errorHandler)

// 启动服务器
async function startServer() {
  try {
    // 连接数据库
    await connectDB()
    logger.info('Database connected successfully')

    // 连接 Redis
    await connectRedis()
    logger.info('Redis connected successfully')

    // 启动服务器
    app.listen(PORT, () => {
      logger.info(`Server is running on port ${PORT}`)
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`)
      logger.info(`Health check: http://localhost:${PORT}/api/health`)
    })
  } catch (error) {
    logger.error('Failed to start server:', error)
    process.exit(1)
  }
}

// 优雅关闭
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully')
  process.exit(0)
})

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully')
  process.exit(0)
})

startServer()

module.exports = app