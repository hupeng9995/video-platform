const jwt = require('jsonwebtoken')
const { getDB } = require('../database/connection')
const { getCache, setCache } = require('../utils/redis')
const logger = require('../utils/logger')

async function auth(req, res, next) {
  try {
    // 获取 token
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'No token provided',
        message: '未提供认证令牌'
      })
    }

    const token = authHeader.replace('Bearer ', '')

    // 检查 token 是否在黑名单中
    const isBlacklisted = await getCache(`blacklist:${token}`)
    if (isBlacklisted) {
      return res.status(401).json({
        error: 'Token blacklisted',
        message: '认证令牌已失效'
      })
    }

    // 验证 token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key')
    
    // 尝试从缓存获取用户信息
    let user = await getCache(`user:${decoded.userId}`)
    
    if (!user) {
      // 从数据库获取用户信息
      const db = getDB()
      const [users] = await db.execute(
        'SELECT id, username, email, role, status FROM users WHERE id = ?',
        [decoded.userId]
      )

      if (users.length === 0) {
        return res.status(401).json({
          error: 'User not found',
          message: '用户不存在'
        })
      }

      user = users[0]
      
      // 缓存用户信息
      await setCache(`user:${user.id}`, user, 3600) // 1小时
    }

    // 检查用户状态
    if (user.status !== 'active') {
      logger.security('Inactive user attempted access', {
        userId: user.id,
        username: user.username,
        status: user.status,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      })
      
      return res.status(403).json({
        error: 'Account inactive',
        message: '账户已被禁用'
      })
    }

    // 将用户信息添加到请求对象
    req.user = {
      userId: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      status: user.status
    }

    next()
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Token expired',
        message: '认证令牌已过期'
      })
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        error: 'Invalid token',
        message: '无效的认证令牌'
      })
    }

    logger.error('Authentication error:', error)
    res.status(500).json({
      error: 'Authentication failed',
      message: '认证失败'
    })
  }
}

// 角色检查中间件
function requireRole(roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Not authenticated',
        message: '未认证'
      })
    }

    const userRoles = Array.isArray(roles) ? roles : [roles]
    if (!userRoles.includes(req.user.role)) {
      logger.security('Insufficient permissions', {
        userId: req.user.userId,
        username: req.user.username,
        userRole: req.user.role,
        requiredRoles: userRoles,
        ip: req.ip,
        path: req.path
      })
      
      return res.status(403).json({
        error: 'Insufficient permissions',
        message: '权限不足'
      })
    }

    next()
  }
}

module.exports = auth
module.exports.requireRole = requireRole