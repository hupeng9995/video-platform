const express = require('express')
const bcrypt = require('bcryptjs')
const { body, validationResult } = require('express-validator')
const router = express.Router()
const { getDB } = require('../database/connection')
const logger = require('../utils/logger')
const auth = require('../middleware/auth')
const { setCache, getCache, deleteCache } = require('../utils/redis')

// 获取用户列表（管理员）
router.get('/', auth, async (req, res) => {
  try {
    // 检查权限
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Forbidden',
        message: '权限不足'
      })
    }

    const page = parseInt(req.query.page) || 1
    const limit = parseInt(req.query.limit) || 10
    const offset = (page - 1) * limit
    const search = req.query.search || ''
    const status = req.query.status || ''
    const role = req.query.role || ''

    const db = getDB()
    let whereClause = 'WHERE 1=1'
    const params = []

    if (search) {
      whereClause += ' AND (username LIKE ? OR email LIKE ?)'
      params.push(`%${search}%`, `%${search}%`)
    }

    if (status) {
      whereClause += ' AND status = ?'
      params.push(status)
    }

    if (role) {
      whereClause += ' AND role = ?'
      params.push(role)
    }

    // 获取总数
    const [countResult] = await db.execute(
      `SELECT COUNT(*) as total FROM users ${whereClause}`,
      params
    )
    const total = countResult[0].total

    // 获取用户列表
    const [users] = await db.execute(
      `SELECT id, username, email, role, status, created_at, last_login 
       FROM users ${whereClause} 
       ORDER BY created_at DESC 
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    )

    res.json({
      users,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    })
  } catch (error) {
    logger.error('Get users error:', error)
    res.status(500).json({
      error: 'Failed to get users',
      message: '获取用户列表失败'
    })
  }
})

// 获取当前用户信息
router.get('/me', auth, async (req, res) => {
  try {
    // 先尝试从缓存获取
    let user = await getCache(`user:${req.user.userId}`)
    
    if (!user) {
      const db = getDB()
      const [users] = await db.execute(
        'SELECT id, username, email, role, status, created_at, last_login FROM users WHERE id = ?',
        [req.user.userId]
      )

      if (users.length === 0) {
        return res.status(404).json({
          error: 'User not found',
          message: '用户不存在'
        })
      }

      user = users[0]
      // 缓存用户信息
      await setCache(`user:${user.id}`, user, 3600)
    }

    res.json({ user })
  } catch (error) {
    logger.error('Get current user error:', error)
    res.status(500).json({
      error: 'Failed to get user info',
      message: '获取用户信息失败'
    })
  }
})

// 获取指定用户信息
router.get('/:id', auth, async (req, res) => {
  try {
    const userId = parseInt(req.params.id)
    
    // 检查权限：只能查看自己的信息或管理员可以查看所有
    if (req.user.userId !== userId && req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Forbidden',
        message: '权限不足'
      })
    }

    const db = getDB()
    const [users] = await db.execute(
      'SELECT id, username, email, role, status, created_at, last_login FROM users WHERE id = ?',
      [userId]
    )

    if (users.length === 0) {
      return res.status(404).json({
        error: 'User not found',
        message: '用户不存在'
      })
    }

    res.json({ user: users[0] })
  } catch (error) {
    logger.error('Get user error:', error)
    res.status(500).json({
      error: 'Failed to get user',
      message: '获取用户信息失败'
    })
  }
})

// 更新用户信息
router.put('/:id', auth, [
  body('email').optional().isEmail().withMessage('请输入有效的邮箱地址'),
  body('username').optional().isLength({ min: 3, max: 30 }).withMessage('用户名长度必须在3-30个字符之间')
], async (req, res) => {
  try {
    const userId = parseInt(req.params.id)
    
    // 检查权限
    if (req.user.userId !== userId && req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Forbidden',
        message: '权限不足'
      })
    }

    // 验证输入
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      })
    }

    const { username, email, role, status } = req.body
    const db = getDB()

    // 检查用户是否存在
    const [existingUsers] = await db.execute(
      'SELECT id FROM users WHERE id = ?',
      [userId]
    )

    if (existingUsers.length === 0) {
      return res.status(404).json({
        error: 'User not found',
        message: '用户不存在'
      })
    }

    // 构建更新字段
    const updateFields = []
    const updateValues = []

    if (username) {
      // 检查用户名是否已被使用
      const [duplicateUsers] = await db.execute(
        'SELECT id FROM users WHERE username = ? AND id != ?',
        [username, userId]
      )
      if (duplicateUsers.length > 0) {
        return res.status(409).json({
          error: 'Username already exists',
          message: '用户名已被使用'
        })
      }
      updateFields.push('username = ?')
      updateValues.push(username)
    }

    if (email) {
      // 检查邮箱是否已被使用
      const [duplicateEmails] = await db.execute(
        'SELECT id FROM users WHERE email = ? AND id != ?',
        [email, userId]
      )
      if (duplicateEmails.length > 0) {
        return res.status(409).json({
          error: 'Email already exists',
          message: '邮箱已被使用'
        })
      }
      updateFields.push('email = ?')
      updateValues.push(email)
    }

    // 只有管理员可以更新角色和状态
    if (req.user.role === 'admin') {
      if (role && ['user', 'admin'].includes(role)) {
        updateFields.push('role = ?')
        updateValues.push(role)
      }
      if (status && ['active', 'inactive', 'banned'].includes(status)) {
        updateFields.push('status = ?')
        updateValues.push(status)
      }
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        error: 'No valid fields to update',
        message: '没有有效的更新字段'
      })
    }

    updateFields.push('updated_at = NOW()')
    updateValues.push(userId)

    // 执行更新
    await db.execute(
      `UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`,
      updateValues
    )

    // 清除缓存
    await deleteCache(`user:${userId}`)

    logger.audit('User updated', {
      targetUserId: userId,
      updatedBy: req.user.userId,
      fields: updateFields,
      ip: req.ip
    })

    res.json({
      message: 'User updated successfully'
    })
  } catch (error) {
    logger.error('Update user error:', error)
    res.status(500).json({
      error: 'Failed to update user',
      message: '更新用户信息失败'
    })
  }
})

// 更改密码
router.put('/:id/password', auth, [
  body('currentPassword').notEmpty().withMessage('当前密码不能为空'),
  body('newPassword')
    .isLength({ min: 6 })
    .withMessage('新密码长度至少6个字符')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('新密码必须包含至少一个小写字母、一个大写字母和一个数字')
], async (req, res) => {
  try {
    const userId = parseInt(req.params.id)
    
    // 检查权限：只能修改自己的密码
    if (req.user.userId !== userId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: '只能修改自己的密码'
      })
    }

    // 验证输入
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      })
    }

    const { currentPassword, newPassword } = req.body
    const db = getDB()

    // 获取当前密码
    const [users] = await db.execute(
      'SELECT password FROM users WHERE id = ?',
      [userId]
    )

    if (users.length === 0) {
      return res.status(404).json({
        error: 'User not found',
        message: '用户不存在'
      })
    }

    // 验证当前密码
    const isValidPassword = await bcrypt.compare(currentPassword, users[0].password)
    if (!isValidPassword) {
      return res.status(400).json({
        error: 'Invalid current password',
        message: '当前密码错误'
      })
    }

    // 加密新密码
    const saltRounds = 12
    const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds)

    // 更新密码
    await db.execute(
      'UPDATE users SET password = ?, updated_at = NOW() WHERE id = ?',
      [hashedNewPassword, userId]
    )

    logger.audit('Password changed', {
      userId,
      ip: req.ip
    })

    res.json({
      message: 'Password updated successfully'
    })
  } catch (error) {
    logger.error('Change password error:', error)
    res.status(500).json({
      error: 'Failed to change password',
      message: '修改密码失败'
    })
  }
})

// 删除用户（管理员）
router.delete('/:id', auth, async (req, res) => {
  try {
    const userId = parseInt(req.params.id)
    
    // 检查权限
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Forbidden',
        message: '权限不足'
      })
    }

    // 不能删除自己
    if (req.user.userId === userId) {
      return res.status(400).json({
        error: 'Cannot delete yourself',
        message: '不能删除自己的账户'
      })
    }

    const db = getDB()
    
    // 检查用户是否存在
    const [users] = await db.execute(
      'SELECT username FROM users WHERE id = ?',
      [userId]
    )

    if (users.length === 0) {
      return res.status(404).json({
        error: 'User not found',
        message: '用户不存在'
      })
    }

    // 删除用户
    await db.execute('DELETE FROM users WHERE id = ?', [userId])

    // 清除缓存
    await deleteCache(`user:${userId}`)

    logger.audit('User deleted', {
      deletedUserId: userId,
      deletedUsername: users[0].username,
      deletedBy: req.user.userId,
      ip: req.ip
    })

    res.json({
      message: 'User deleted successfully'
    })
  } catch (error) {
    logger.error('Delete user error:', error)
    res.status(500).json({
      error: 'Failed to delete user',
      message: '删除用户失败'
    })
  }
})

module.exports = router