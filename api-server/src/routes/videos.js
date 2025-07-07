const express = require('express')
const { body, validationResult } = require('express-validator')
const router = express.Router()
const { getDB } = require('../database/connection')
const logger = require('../utils/logger')
const auth = require('../middleware/auth')
const { setCache, getCache, deleteCache } = require('../utils/redis')
const path = require('path')
const fs = require('fs').promises

// 获取视频列表
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1
    const limit = parseInt(req.query.limit) || 12
    const offset = (page - 1) * limit
    const category = req.query.category || ''
    const search = req.query.search || ''
    const sortBy = req.query.sortBy || 'created_at'
    const sortOrder = req.query.sortOrder || 'DESC'
    const status = req.query.status || 'published'

    // 构建缓存键
    const cacheKey = `videos:${page}:${limit}:${category}:${search}:${sortBy}:${sortOrder}:${status}`
    
    // 尝试从缓存获取
    let cachedResult = await getCache(cacheKey)
    if (cachedResult) {
      return res.json(cachedResult)
    }

    const db = getDB()
    let whereClause = 'WHERE v.status = ?'
    const params = [status]

    if (category) {
      whereClause += ' AND v.category = ?'
      params.push(category)
    }

    if (search) {
      whereClause += ' AND (v.title LIKE ? OR v.description LIKE ? OR u.username LIKE ?)'
      params.push(`%${search}%`, `%${search}%`, `%${search}%`)
    }

    // 验证排序字段
    const allowedSortFields = ['created_at', 'title', 'views', 'likes', 'duration']
    const validSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'created_at'
    const validSortOrder = ['ASC', 'DESC'].includes(sortOrder.toUpperCase()) ? sortOrder.toUpperCase() : 'DESC'

    // 获取总数
    const [countResult] = await db.execute(
      `SELECT COUNT(*) as total 
       FROM videos v 
       JOIN users u ON v.user_id = u.id 
       ${whereClause}`,
      params
    )
    const total = countResult[0].total

    // 获取视频列表
    const [videos] = await db.execute(
      `SELECT v.id, v.title, v.description, v.thumbnail_url, v.video_url, 
              v.duration, v.views, v.likes, v.category, v.status, v.created_at,
              u.id as user_id, u.username, u.email
       FROM videos v 
       JOIN users u ON v.user_id = u.id 
       ${whereClause} 
       ORDER BY v.${validSortBy} ${validSortOrder} 
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    )

    const result = {
      videos,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    }

    // 缓存结果（5分钟）
    await setCache(cacheKey, result, 300)

    res.json(result)
  } catch (error) {
    logger.error('Get videos error:', error)
    res.status(500).json({
      error: 'Failed to get videos',
      message: '获取视频列表失败'
    })
  }
})

// 获取单个视频详情
router.get('/:id', async (req, res) => {
  try {
    const videoId = parseInt(req.params.id)
    
    // 尝试从缓存获取
    let video = await getCache(`video:${videoId}`)
    
    if (!video) {
      const db = getDB()
      const [videos] = await db.execute(
        `SELECT v.*, u.username, u.email 
         FROM videos v 
         JOIN users u ON v.user_id = u.id 
         WHERE v.id = ? AND v.status = 'published'`,
        [videoId]
      )

      if (videos.length === 0) {
        return res.status(404).json({
          error: 'Video not found',
          message: '视频不存在'
        })
      }

      video = videos[0]
      
      // 缓存视频信息（10分钟）
      await setCache(`video:${videoId}`, video, 600)
    }

    // 增加观看次数
    const db = getDB()
    await db.execute(
      'UPDATE videos SET views = views + 1 WHERE id = ?',
      [videoId]
    )
    
    // 更新缓存中的观看次数
    video.views = (video.views || 0) + 1
    await setCache(`video:${videoId}`, video, 600)

    res.json({ video })
  } catch (error) {
    logger.error('Get video error:', error)
    res.status(500).json({
      error: 'Failed to get video',
      message: '获取视频详情失败'
    })
  }
})

// 创建视频记录
router.post('/', auth, [
  body('title')
    .isLength({ min: 1, max: 200 })
    .withMessage('标题长度必须在1-200个字符之间'),
  body('description')
    .optional()
    .isLength({ max: 2000 })
    .withMessage('描述长度不能超过2000个字符'),
  body('category')
    .isIn(['entertainment', 'education', 'music', 'sports', 'news', 'gaming', 'technology', 'other'])
    .withMessage('无效的分类'),
  body('video_url')
    .isURL()
    .withMessage('无效的视频URL'),
  body('thumbnail_url')
    .optional()
    .isURL()
    .withMessage('无效的缩略图URL')
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

    const { title, description, category, video_url, thumbnail_url, duration } = req.body
    const db = getDB()

    // 创建视频记录
    const [result] = await db.execute(
      `INSERT INTO videos (user_id, title, description, category, video_url, thumbnail_url, duration, status, created_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, 'processing', NOW())`,
      [req.user.userId, title, description || '', category, video_url, thumbnail_url || '', duration || 0]
    )

    const videoId = result.insertId

    logger.audit('Video created', {
      videoId,
      title,
      category,
      userId: req.user.userId,
      ip: req.ip
    })

    // 清除相关缓存
    await deleteCache('videos:*')

    res.status(201).json({
      message: 'Video created successfully',
      videoId,
      status: 'processing'
    })
  } catch (error) {
    logger.error('Create video error:', error)
    res.status(500).json({
      error: 'Failed to create video',
      message: '创建视频失败'
    })
  }
})

// 更新视频信息
router.put('/:id', auth, [
  body('title')
    .optional()
    .isLength({ min: 1, max: 200 })
    .withMessage('标题长度必须在1-200个字符之间'),
  body('description')
    .optional()
    .isLength({ max: 2000 })
    .withMessage('描述长度不能超过2000个字符'),
  body('category')
    .optional()
    .isIn(['entertainment', 'education', 'music', 'sports', 'news', 'gaming', 'technology', 'other'])
    .withMessage('无效的分类'),
  body('status')
    .optional()
    .isIn(['draft', 'processing', 'published', 'private'])
    .withMessage('无效的状态')
], async (req, res) => {
  try {
    const videoId = parseInt(req.params.id)
    
    // 验证输入
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      })
    }

    const db = getDB()
    
    // 检查视频是否存在且用户有权限
    const [videos] = await db.execute(
      'SELECT user_id, title FROM videos WHERE id = ?',
      [videoId]
    )

    if (videos.length === 0) {
      return res.status(404).json({
        error: 'Video not found',
        message: '视频不存在'
      })
    }

    const video = videos[0]
    
    // 检查权限：只有视频所有者或管理员可以修改
    if (video.user_id !== req.user.userId && req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Forbidden',
        message: '权限不足'
      })
    }

    const { title, description, category, status, thumbnail_url } = req.body
    
    // 构建更新字段
    const updateFields = []
    const updateValues = []

    if (title) {
      updateFields.push('title = ?')
      updateValues.push(title)
    }
    if (description !== undefined) {
      updateFields.push('description = ?')
      updateValues.push(description)
    }
    if (category) {
      updateFields.push('category = ?')
      updateValues.push(category)
    }
    if (status) {
      updateFields.push('status = ?')
      updateValues.push(status)
    }
    if (thumbnail_url !== undefined) {
      updateFields.push('thumbnail_url = ?')
      updateValues.push(thumbnail_url)
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        error: 'No valid fields to update',
        message: '没有有效的更新字段'
      })
    }

    updateFields.push('updated_at = NOW()')
    updateValues.push(videoId)

    // 执行更新
    await db.execute(
      `UPDATE videos SET ${updateFields.join(', ')} WHERE id = ?`,
      updateValues
    )

    // 清除缓存
    await deleteCache(`video:${videoId}`)
    await deleteCache('videos:*')

    logger.audit('Video updated', {
      videoId,
      originalTitle: video.title,
      updatedBy: req.user.userId,
      fields: updateFields,
      ip: req.ip
    })

    res.json({
      message: 'Video updated successfully'
    })
  } catch (error) {
    logger.error('Update video error:', error)
    res.status(500).json({
      error: 'Failed to update video',
      message: '更新视频失败'
    })
  }
})

// 删除视频
router.delete('/:id', auth, async (req, res) => {
  try {
    const videoId = parseInt(req.params.id)
    const db = getDB()
    
    // 检查视频是否存在且用户有权限
    const [videos] = await db.execute(
      'SELECT user_id, title, video_url, thumbnail_url FROM videos WHERE id = ?',
      [videoId]
    )

    if (videos.length === 0) {
      return res.status(404).json({
        error: 'Video not found',
        message: '视频不存在'
      })
    }

    const video = videos[0]
    
    // 检查权限：只有视频所有者或管理员可以删除
    if (video.user_id !== req.user.userId && req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Forbidden',
        message: '权限不足'
      })
    }

    // 删除视频记录
    await db.execute('DELETE FROM videos WHERE id = ?', [videoId])

    // 删除物理文件（异步处理，不阻塞响应）
    setImmediate(async () => {
      try {
        if (video.video_url && video.video_url.startsWith('/uploads/')) {
          const videoPath = path.join(__dirname, '../../uploads', path.basename(video.video_url))
          await fs.unlink(videoPath).catch(() => {}) // 忽略文件不存在的错误
        }
        if (video.thumbnail_url && video.thumbnail_url.startsWith('/uploads/')) {
          const thumbnailPath = path.join(__dirname, '../../uploads', path.basename(video.thumbnail_url))
          await fs.unlink(thumbnailPath).catch(() => {}) // 忽略文件不存在的错误
        }
      } catch (error) {
        logger.error('Failed to delete video files:', error)
      }
    })

    // 清除缓存
    await deleteCache(`video:${videoId}`)
    await deleteCache('videos:*')

    logger.audit('Video deleted', {
      videoId,
      title: video.title,
      deletedBy: req.user.userId,
      ip: req.ip
    })

    res.json({
      message: 'Video deleted successfully'
    })
  } catch (error) {
    logger.error('Delete video error:', error)
    res.status(500).json({
      error: 'Failed to delete video',
      message: '删除视频失败'
    })
  }
})

// 点赞视频
router.post('/:id/like', auth, async (req, res) => {
  try {
    const videoId = parseInt(req.params.id)
    const db = getDB()
    
    // 检查视频是否存在
    const [videos] = await db.execute(
      'SELECT id FROM videos WHERE id = ? AND status = "published"',
      [videoId]
    )

    if (videos.length === 0) {
      return res.status(404).json({
        error: 'Video not found',
        message: '视频不存在'
      })
    }

    // 检查是否已经点赞
    const [existingLikes] = await db.execute(
      'SELECT id FROM video_likes WHERE video_id = ? AND user_id = ?',
      [videoId, req.user.userId]
    )

    if (existingLikes.length > 0) {
      return res.status(409).json({
        error: 'Already liked',
        message: '已经点赞过了'
      })
    }

    // 添加点赞记录
    await db.execute(
      'INSERT INTO video_likes (video_id, user_id, created_at) VALUES (?, ?, NOW())',
      [videoId, req.user.userId]
    )

    // 更新视频点赞数
    await db.execute(
      'UPDATE videos SET likes = likes + 1 WHERE id = ?',
      [videoId]
    )

    // 清除缓存
    await deleteCache(`video:${videoId}`)

    res.json({
      message: 'Video liked successfully'
    })
  } catch (error) {
    logger.error('Like video error:', error)
    res.status(500).json({
      error: 'Failed to like video',
      message: '点赞失败'
    })
  }
})

// 取消点赞
router.delete('/:id/like', auth, async (req, res) => {
  try {
    const videoId = parseInt(req.params.id)
    const db = getDB()
    
    // 检查是否已经点赞
    const [existingLikes] = await db.execute(
      'SELECT id FROM video_likes WHERE video_id = ? AND user_id = ?',
      [videoId, req.user.userId]
    )

    if (existingLikes.length === 0) {
      return res.status(404).json({
        error: 'Like not found',
        message: '未找到点赞记录'
      })
    }

    // 删除点赞记录
    await db.execute(
      'DELETE FROM video_likes WHERE video_id = ? AND user_id = ?',
      [videoId, req.user.userId]
    )

    // 更新视频点赞数
    await db.execute(
      'UPDATE videos SET likes = GREATEST(likes - 1, 0) WHERE id = ?',
      [videoId]
    )

    // 清除缓存
    await deleteCache(`video:${videoId}`)

    res.json({
      message: 'Like removed successfully'
    })
  } catch (error) {
    logger.error('Unlike video error:', error)
    res.status(500).json({
      error: 'Failed to unlike video',
      message: '取消点赞失败'
    })
  }
})

// 获取用户的视频列表
router.get('/user/:userId', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId)
    const page = parseInt(req.query.page) || 1
    const limit = parseInt(req.query.limit) || 12
    const offset = (page - 1) * limit
    const status = req.query.status || 'published'

    const db = getDB()
    
    // 获取总数
    const [countResult] = await db.execute(
      'SELECT COUNT(*) as total FROM videos WHERE user_id = ? AND status = ?',
      [userId, status]
    )
    const total = countResult[0].total

    // 获取视频列表
    const [videos] = await db.execute(
      `SELECT v.*, u.username 
       FROM videos v 
       JOIN users u ON v.user_id = u.id 
       WHERE v.user_id = ? AND v.status = ? 
       ORDER BY v.created_at DESC 
       LIMIT ? OFFSET ?`,
      [userId, status, limit, offset]
    )

    res.json({
      videos,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    })
  } catch (error) {
    logger.error('Get user videos error:', error)
    res.status(500).json({
      error: 'Failed to get user videos',
      message: '获取用户视频失败'
    })
  }
})

module.exports = router