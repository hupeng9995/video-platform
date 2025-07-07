const express = require('express')
const router = express.Router()
const { getDB } = require('../database/connection')
const redis = require('../utils/redis')
const logger = require('../utils/logger')

// 健康检查端点
router.get('/', async (req, res) => {
  const startTime = Date.now()
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '1.0.0',
    services: {
      database: 'unknown',
      redis: 'unknown',
      memory: {
        used: process.memoryUsage().heapUsed,
        total: process.memoryUsage().heapTotal,
        external: process.memoryUsage().external
      },
      cpu: process.cpuUsage()
    }
  }

  // 检查数据库连接
  try {
    const db = getDB()
    await db.execute('SELECT 1')
    health.services.database = 'ok'
  } catch (error) {
    health.services.database = 'error'
    health.status = 'degraded'
    logger.error('Database health check failed:', error)
  }

  // 检查 Redis 连接
  try {
    const redisClient = redis.getClient()
    await redisClient.ping()
    health.services.redis = 'ok'
  } catch (error) {
    health.services.redis = 'error'
    health.status = 'degraded'
    logger.error('Redis health check failed:', error)
  }

  health.responseTime = Date.now() - startTime

  const statusCode = health.status === 'ok' ? 200 : 503
  res.status(statusCode).json(health)
})

// 详细健康检查
router.get('/detailed', async (req, res) => {
  const startTime = Date.now()
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    services: {},
    system: {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      loadAverage: process.platform !== 'win32' ? require('os').loadavg() : null
    }
  }

  // 数据库详细检查
  try {
    const db = getDB()
    const [rows] = await db.execute('SELECT COUNT(*) as count FROM users')
    health.services.database = {
      status: 'ok',
      userCount: rows[0].count,
      connectionPool: {
        total: db.pool.config.connectionLimit,
        active: db.pool._allConnections.length,
        idle: db.pool._freeConnections.length
      }
    }
  } catch (error) {
    health.services.database = {
      status: 'error',
      error: error.message
    }
    health.status = 'degraded'
  }

  // Redis 详细检查
  try {
    const redisClient = redis.getClient()
    const info = await redisClient.info('memory')
    health.services.redis = {
      status: 'ok',
      memory: info
    }
  } catch (error) {
    health.services.redis = {
      status: 'error',
      error: error.message
    }
    health.status = 'degraded'
  }

  health.responseTime = Date.now() - startTime

  const statusCode = health.status === 'ok' ? 200 : 503
  res.status(statusCode).json(health)
})

module.exports = router