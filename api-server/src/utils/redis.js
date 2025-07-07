const redis = require('redis')
const logger = require('./logger')

let client = null

const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  db: process.env.REDIS_DB || 0,
  retryDelayOnFailover: 100,
  enableReadyCheck: true,
  maxRetriesPerRequest: 3
}

async function connectRedis() {
  try {
    client = redis.createClient({
      socket: {
        host: redisConfig.host,
        port: redisConfig.port
      },
      password: redisConfig.password,
      database: redisConfig.db
    })

    client.on('error', (err) => {
      logger.error('Redis Client Error:', err)
    })

    client.on('connect', () => {
      logger.info('Redis client connected')
    })

    client.on('ready', () => {
      logger.info('Redis client ready')
    })

    client.on('end', () => {
      logger.info('Redis client disconnected')
    })

    await client.connect()
    
    // 测试连接
    await client.ping()
    logger.info('Redis connection established successfully')
    
    return client
  } catch (error) {
    logger.error('Redis connection failed:', error)
    throw error
  }
}

function getClient() {
  if (!client) {
    throw new Error('Redis not connected. Call connectRedis() first.')
  }
  return client
}

async function closeRedis() {
  if (client) {
    await client.quit()
    client = null
    logger.info('Redis connection closed')
  }
}

// 缓存辅助函数
async function setCache(key, value, expireInSeconds = 3600) {
  try {
    const client = getClient()
    await client.setEx(key, expireInSeconds, JSON.stringify(value))
    return true
  } catch (error) {
    logger.error('Cache set error:', error)
    return false
  }
}

async function getCache(key) {
  try {
    const client = getClient()
    const value = await client.get(key)
    return value ? JSON.parse(value) : null
  } catch (error) {
    logger.error('Cache get error:', error)
    return null
  }
}

async function deleteCache(key) {
  try {
    const client = getClient()
    await client.del(key)
    return true
  } catch (error) {
    logger.error('Cache delete error:', error)
    return false
  }
}

module.exports = {
  connectRedis,
  getClient,
  closeRedis,
  setCache,
  getCache,
  deleteCache
}