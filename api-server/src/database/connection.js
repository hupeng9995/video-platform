const mysql = require('mysql2/promise')
const logger = require('../utils/logger')

let pool = null

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'video_user',
  password: process.env.DB_PASSWORD || 'video_password',
  database: process.env.DB_NAME || 'video_platform',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  acquireTimeout: 60000,
  timeout: 60000,
  reconnect: true,
  charset: 'utf8mb4'
}

async function connectDB() {
  try {
    pool = mysql.createPool(dbConfig)
    
    // 测试连接
    const connection = await pool.getConnection()
    await connection.ping()
    connection.release()
    
    logger.info('Database connection pool created successfully')
    return pool
  } catch (error) {
    logger.error('Database connection failed:', error)
    throw error
  }
}

function getDB() {
  if (!pool) {
    throw new Error('Database not connected. Call connectDB() first.')
  }
  return pool
}

async function closeDB() {
  if (pool) {
    await pool.end()
    pool = null
    logger.info('Database connection pool closed')
  }
}

module.exports = {
  connectDB,
  getDB,
  closeDB
}