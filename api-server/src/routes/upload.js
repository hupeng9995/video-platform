const express = require('express')
const multer = require('multer')
const path = require('path')
const fs = require('fs').promises
const { v4: uuidv4 } = require('uuid')
const ffmpeg = require('fluent-ffmpeg')
const ffmpegStatic = require('ffmpeg-static')
const router = express.Router()
const auth = require('../middleware/auth')
const logger = require('../utils/logger')
const { getDB } = require('../database/connection')

// 设置 FFmpeg 路径
ffmpeg.setFfmpegPath(ffmpegStatic)

// 确保上传目录存在
const uploadDir = path.join(__dirname, '../../uploads')
const tempDir = path.join(uploadDir, 'temp')
const videoDir = path.join(uploadDir, 'videos')
const thumbnailDir = path.join(uploadDir, 'thumbnails')

// 创建目录
Promise.all([
  fs.mkdir(uploadDir, { recursive: true }),
  fs.mkdir(tempDir, { recursive: true }),
  fs.mkdir(videoDir, { recursive: true }),
  fs.mkdir(thumbnailDir, { recursive: true })
]).catch(err => logger.error('Failed to create upload directories:', err))

// 配置 multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, tempDir)
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`
    cb(null, uniqueName)
  }
})

// 文件过滤器
const fileFilter = (req, file, cb) => {
  if (file.fieldname === 'video') {
    // 视频文件
    const allowedVideoTypes = ['video/mp4', 'video/avi', 'video/mov', 'video/wmv', 'video/flv', 'video/webm']
    if (allowedVideoTypes.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('Invalid video format. Allowed formats: MP4, AVI, MOV, WMV, FLV, WebM'), false)
    }
  } else if (file.fieldname === 'thumbnail') {
    // 缩略图文件
    const allowedImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
    if (allowedImageTypes.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('Invalid image format. Allowed formats: JPEG, PNG, WebP'), false)
    }
  } else {
    cb(new Error('Unexpected field'), false)
  }
}

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB
    files: 2 // 最多2个文件（视频+缩略图）
  }
})

// 视频处理函数
function processVideo(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .output(outputPath)
      .videoCodec('libx264')
      .audioCodec('aac')
      .format('mp4')
      .size('1280x720') // 720p
      .videoBitrate('2000k')
      .audioBitrate('128k')
      .on('start', (commandLine) => {
        logger.info('Video processing started:', { commandLine })
      })
      .on('progress', (progress) => {
        logger.info('Video processing progress:', { percent: progress.percent })
      })
      .on('end', () => {
        logger.info('Video processing completed:', { outputPath })
        resolve()
      })
      .on('error', (err) => {
        logger.error('Video processing error:', err)
        reject(err)
      })
      .run()
  })
}

// 生成缩略图
function generateThumbnail(videoPath, thumbnailPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .screenshots({
        timestamps: ['10%'],
        filename: path.basename(thumbnailPath),
        folder: path.dirname(thumbnailPath),
        size: '640x360'
      })
      .on('end', () => {
        logger.info('Thumbnail generated:', { thumbnailPath })
        resolve()
      })
      .on('error', (err) => {
        logger.error('Thumbnail generation error:', err)
        reject(err)
      })
  })
}

// 获取视频信息
function getVideoInfo(videoPath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) {
        reject(err)
      } else {
        const duration = metadata.format.duration
        const size = metadata.format.size
        const bitrate = metadata.format.bit_rate
        
        resolve({
          duration: Math.round(duration),
          size,
          bitrate
        })
      }
    })
  })
}

// 上传视频
router.post('/video', auth, upload.fields([
  { name: 'video', maxCount: 1 },
  { name: 'thumbnail', maxCount: 1 }
]), async (req, res) => {
  let tempVideoPath = null
  let tempThumbnailPath = null
  let finalVideoPath = null
  let finalThumbnailPath = null

  try {
    if (!req.files || !req.files.video) {
      return res.status(400).json({
        error: 'No video file provided',
        message: '请选择视频文件'
      })
    }

    const { title, description, category } = req.body
    
    if (!title || !category) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: '请提供标题和分类'
      })
    }

    const videoFile = req.files.video[0]
    const thumbnailFile = req.files.thumbnail ? req.files.thumbnail[0] : null
    
    tempVideoPath = videoFile.path
    if (thumbnailFile) {
      tempThumbnailPath = thumbnailFile.path
    }

    // 生成唯一文件名
    const videoId = uuidv4()
    const videoFileName = `${videoId}.mp4`
    const thumbnailFileName = `${videoId}.jpg`
    
    finalVideoPath = path.join(videoDir, videoFileName)
    finalThumbnailPath = path.join(thumbnailDir, thumbnailFileName)

    // 获取视频信息
    const videoInfo = await getVideoInfo(tempVideoPath)
    
    // 处理视频（转码）
    await processVideo(tempVideoPath, finalVideoPath)
    
    // 处理缩略图
    if (thumbnailFile) {
      // 如果用户上传了缩略图，直接移动
      await fs.rename(tempThumbnailPath, finalThumbnailPath)
    } else {
      // 如果没有上传缩略图，从视频生成
      await generateThumbnail(finalVideoPath, finalThumbnailPath)
    }

    // 保存到数据库
    const db = getDB()
    const [result] = await db.execute(
      `INSERT INTO videos (user_id, title, description, category, video_url, thumbnail_url, duration, file_size, status, created_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'published', NOW())`,
      [
        req.user.userId,
        title,
        description || '',
        category,
        `/uploads/videos/${videoFileName}`,
        `/uploads/thumbnails/${thumbnailFileName}`,
        videoInfo.duration,
        videoInfo.size
      ]
    )

    // 删除临时文件
    await fs.unlink(tempVideoPath).catch(() => {})
    if (tempThumbnailPath) {
      await fs.unlink(tempThumbnailPath).catch(() => {})
    }

    logger.audit('Video uploaded', {
      videoId: result.insertId,
      title,
      category,
      duration: videoInfo.duration,
      fileSize: videoInfo.size,
      userId: req.user.userId,
      ip: req.ip
    })

    res.status(201).json({
      message: 'Video uploaded successfully',
      video: {
        id: result.insertId,
        title,
        description,
        category,
        video_url: `/uploads/videos/${videoFileName}`,
        thumbnail_url: `/uploads/thumbnails/${thumbnailFileName}`,
        duration: videoInfo.duration,
        file_size: videoInfo.size,
        status: 'published'
      }
    })
  } catch (error) {
    logger.error('Video upload error:', error)
    
    // 清理文件
    const filesToClean = [tempVideoPath, tempThumbnailPath, finalVideoPath, finalThumbnailPath]
    for (const filePath of filesToClean) {
      if (filePath) {
        await fs.unlink(filePath).catch(() => {})
      }
    }

    res.status(500).json({
      error: 'Video upload failed',
      message: '视频上传失败，请稍后重试'
    })
  }
})

// 上传缩略图
router.post('/thumbnail', auth, upload.single('thumbnail'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'No thumbnail file provided',
        message: '请选择缩略图文件'
      })
    }

    const tempPath = req.file.path
    const fileName = `${uuidv4()}.jpg`
    const finalPath = path.join(thumbnailDir, fileName)

    // 移动文件到最终位置
    await fs.rename(tempPath, finalPath)

    logger.audit('Thumbnail uploaded', {
      fileName,
      userId: req.user.userId,
      ip: req.ip
    })

    res.json({
      message: 'Thumbnail uploaded successfully',
      thumbnail_url: `/uploads/thumbnails/${fileName}`
    })
  } catch (error) {
    logger.error('Thumbnail upload error:', error)
    
    // 清理临时文件
    if (req.file) {
      await fs.unlink(req.file.path).catch(() => {})
    }

    res.status(500).json({
      error: 'Thumbnail upload failed',
      message: '缩略图上传失败'
    })
  }
})

// 获取上传进度（WebSocket 或 Server-Sent Events 可以实现实时进度）
router.get('/progress/:uploadId', auth, (req, res) => {
  // 这里可以实现上传进度查询
  // 实际实现需要配合前端的分片上传或进度跟踪
  res.json({
    uploadId: req.params.uploadId,
    progress: 100,
    status: 'completed'
  })
})

// 删除上传的文件
router.delete('/file/:type/:filename', auth, async (req, res) => {
  try {
    const { type, filename } = req.params
    
    if (!['videos', 'thumbnails'].includes(type)) {
      return res.status(400).json({
        error: 'Invalid file type',
        message: '无效的文件类型'
      })
    }

    const filePath = path.join(uploadDir, type, filename)
    
    // 检查文件是否存在
    try {
      await fs.access(filePath)
    } catch {
      return res.status(404).json({
        error: 'File not found',
        message: '文件不存在'
      })
    }

    // 检查权限（只有文件所有者或管理员可以删除）
    const db = getDB()
    const urlPath = `/uploads/${type}/${filename}`
    
    const [videos] = await db.execute(
      'SELECT user_id FROM videos WHERE video_url = ? OR thumbnail_url = ?',
      [urlPath, urlPath]
    )

    if (videos.length > 0) {
      const video = videos[0]
      if (video.user_id !== req.user.userId && req.user.role !== 'admin') {
        return res.status(403).json({
          error: 'Forbidden',
          message: '权限不足'
        })
      }
    }

    // 删除文件
    await fs.unlink(filePath)

    logger.audit('File deleted', {
      type,
      filename,
      userId: req.user.userId,
      ip: req.ip
    })

    res.json({
      message: 'File deleted successfully'
    })
  } catch (error) {
    logger.error('Delete file error:', error)
    res.status(500).json({
      error: 'Failed to delete file',
      message: '删除文件失败'
    })
  }
})

module.exports = router