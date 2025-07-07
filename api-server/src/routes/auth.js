const express = require('express')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { body, validationResult } = require('express-validator')
const router = express.Router()
const { getDB } = require('../database/connection')
const logger = require('../utils/logger')
const { setCache, deleteCache } = require('../utils/redis')

// 注册
router.post('/register', [
  body('username')
    .isLength({ min: 3, max: 30 })
    .withMessage('用户名长度必须在3-30个字符之间')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('用户名只能包含字母、数字和下划线'),
  body('email')
    .isEmail()
    .withMessage('请输入有效的邮箱地址'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('密码长度至少6个字符')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('密码必须包含至少一个小写字母、一个大写字母和一个数字')
], async (req, res) => {
  try {
    // 验证输入
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      })
    }

    const { username, email, password } = req.body
    const db = getDB()

    // 检查用户是否已存在
    const [existingUsers] = await db.execute(
      'SELECT id FROM users WHERE username = ? OR email = ?',
      [username, email]
    )

    if (existingUsers.length > 0) {
      return res.status(409).json({
        error: 'User already exists',
        message: '用户名或邮箱已被使用'
      })
    }

    // 加密密码
    const saltRounds = 12
    const hashedPassword = await bcrypt.hash(password, saltRounds)

    // 创建用户
    const [result] = await db.execute(
      'INSERT INTO users (username, email, password, created_at) VALUES (?, ?, ?, NOW())',
      [username, email, hashedPassword]
    )

    logger.audit('User registered', {
      userId: result.insertId,
      username,
      email,
      ip: req.ip
    })

    res.status(201).json({
      message: 'User registered successfully',
      userId: result.insertId
    })
  } catch (error) {
    logger.error('Registration error:', error)
    res.status(500).json({
      error: 'Registration failed',
      message: '注册失败，请稍后重试'
    })
  }
})

// 登录
router.post('/login', [
  body('username').notEmpty().withMessage('用户名不能为空'),
  body('password').notEmpty().withMessage('密码不能为空')
], async (req, res) => {
  try {
    // 验证输入
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      })
    }

    const { username, password } = req.body
    const db = getDB()

    // 查找用户
    const [users] = await db.execute(
      'SELECT id, username, email, password, role, status FROM users WHERE username = ? OR email = ?',
      [username, username]
    )

    if (users.length === 0) {
      logger.security('Login attempt with invalid username', {
        username,
        ip: req.ip
      })
      return res.status(401).json({
        error: 'Invalid credentials',
        message: '用户名或密码错误'
      })
    }

    const user = users[0]

    // 检查用户状态
    if (user.status !== 'active') {
      logger.security('Login attempt with inactive account', {
        userId: user.id,
        username: user.username,
        status: user.status,
        ip: req.ip
      })
      return res.status(403).json({
        error: 'Account inactive',
        message: '账户已被禁用'
      })
    }

    // 验证密码
    const isValidPassword = await bcrypt.compare(password, user.password)
    if (!isValidPassword) {
      logger.security('Login attempt with invalid password', {
        userId: user.id,
        username: user.username,
        ip: req.ip
      })
      return res.status(401).json({
        error: 'Invalid credentials',
        message: '用户名或密码错误'
      })
    }

    // 生成 JWT token
    const token = jwt.sign(
      {
        userId: user.id,
        username: user.username,
        role: user.role
      },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    )

    // 更新最后登录时间
    await db.execute(
      'UPDATE users SET last_login = NOW() WHERE id = ?',
      [user.id]
    )

    // 缓存用户信息
    await setCache(`user:${user.id}`, {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      status: user.status
    }, 3600) // 1小时

    logger.audit('User logged in', {
      userId: user.id,
      username: user.username,
      ip: req.ip
    })

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role
      }
    })
  } catch (error) {
    logger.error('Login error:', error)
    res.status(500).json({
      error: 'Login failed',
      message: '登录失败，请稍后重试'
    })
  }
})

// 登出
router.post('/logout', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '')
    
    if (token) {
      // 将 token 加入黑名单（可选）
      await setCache(`blacklist:${token}`, true, 24 * 3600) // 24小时
      
      // 清除用户缓存
      const decoded = jwt.decode(token)
      if (decoded?.userId) {
        await deleteCache(`user:${decoded.userId}`)
        
        logger.audit('User logged out', {
          userId: decoded.userId,
          username: decoded.username,
          ip: req.ip
        })
      }
    }

    res.json({
      message: 'Logout successful'
    })
  } catch (error) {
    logger.error('Logout error:', error)
    res.status(500).json({
      error: 'Logout failed',
      message: '登出失败'
    })
  }
})

// 刷新 token
router.post('/refresh', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '')
    
    if (!token) {
      return res.status(401).json({
        error: 'No token provided',
        message: '未提供认证令牌'
      })
    }

    // 验证 token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key')
    const db = getDB()

    // 检查用户是否仍然存在且活跃
    const [users] = await db.execute(
      'SELECT id, username, email, role, status FROM users WHERE id = ?',
      [decoded.userId]
    )

    if (users.length === 0 || users[0].status !== 'active') {
      return res.status(401).json({
        error: 'Invalid user',
        message: '用户不存在或已被禁用'
      })
    }

    const user = users[0]

    // 生成新的 token
    const newToken = jwt.sign(
      {
        userId: user.id,
        username: user.username,
        role: user.role
      },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    )

    res.json({
      message: 'Token refreshed successfully',
      token: newToken,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role
      }
    })
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Token expired',
        message: '认证令牌已过期'
      })
    }
    
    logger.error('Token refresh error:', error)
    res.status(401).json({
      error: 'Invalid token',
      message: '无效的认证令牌'
    })
  }
})

module.exports = router