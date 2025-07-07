-- 创建数据库（如果不存在）
CREATE DATABASE IF NOT EXISTS video_platform CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE video_platform;

-- 用户表
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    role ENUM('user', 'admin') DEFAULT 'user',
    status ENUM('active', 'inactive', 'banned') DEFAULT 'active',
    avatar_url VARCHAR(255),
    bio TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_login TIMESTAMP NULL,
    INDEX idx_username (username),
    INDEX idx_email (email),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 视频表
CREATE TABLE IF NOT EXISTS videos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    video_url VARCHAR(500) NOT NULL,
    thumbnail_url VARCHAR(500),
    duration INT DEFAULT 0 COMMENT '视频时长（秒）',
    file_size BIGINT DEFAULT 0 COMMENT '文件大小（字节）',
    views INT DEFAULT 0,
    likes INT DEFAULT 0,
    category ENUM('entertainment', 'education', 'music', 'sports', 'news', 'gaming', 'technology', 'other') DEFAULT 'other',
    status ENUM('draft', 'processing', 'published', 'private') DEFAULT 'draft',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_category (category),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at),
    INDEX idx_views (views),
    INDEX idx_likes (likes),
    FULLTEXT idx_title_description (title, description)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 视频点赞表
CREATE TABLE IF NOT EXISTS video_likes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    video_id INT NOT NULL,
    user_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_like (video_id, user_id),
    INDEX idx_video_id (video_id),
    INDEX idx_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 评论表
CREATE TABLE IF NOT EXISTS comments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    video_id INT NOT NULL,
    user_id INT NOT NULL,
    parent_id INT NULL COMMENT '父评论ID，用于回复',
    content TEXT NOT NULL,
    likes INT DEFAULT 0,
    status ENUM('active', 'hidden', 'deleted') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES comments(id) ON DELETE CASCADE,
    INDEX idx_video_id (video_id),
    INDEX idx_user_id (user_id),
    INDEX idx_parent_id (parent_id),
    INDEX idx_created_at (created_at),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 评论点赞表
CREATE TABLE IF NOT EXISTS comment_likes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    comment_id INT NOT NULL,
    user_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_comment_like (comment_id, user_id),
    INDEX idx_comment_id (comment_id),
    INDEX idx_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 播放列表表
CREATE TABLE IF NOT EXISTS playlists (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    is_public BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_is_public (is_public),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 播放列表视频关联表
CREATE TABLE IF NOT EXISTS playlist_videos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    playlist_id INT NOT NULL,
    video_id INT NOT NULL,
    position INT NOT NULL DEFAULT 0,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
    FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE,
    UNIQUE KEY unique_playlist_video (playlist_id, video_id),
    INDEX idx_playlist_id (playlist_id),
    INDEX idx_video_id (video_id),
    INDEX idx_position (position)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 用户关注表
CREATE TABLE IF NOT EXISTS user_follows (
    id INT AUTO_INCREMENT PRIMARY KEY,
    follower_id INT NOT NULL COMMENT '关注者ID',
    following_id INT NOT NULL COMMENT '被关注者ID',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (follower_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (following_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_follow (follower_id, following_id),
    INDEX idx_follower_id (follower_id),
    INDEX idx_following_id (following_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 观看历史表
CREATE TABLE IF NOT EXISTS watch_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    video_id INT NOT NULL,
    watch_time INT DEFAULT 0 COMMENT '观看时长（秒）',
    progress DECIMAL(5,2) DEFAULT 0.00 COMMENT '观看进度（百分比）',
    last_watched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_video (user_id, video_id),
    INDEX idx_user_id (user_id),
    INDEX idx_video_id (video_id),
    INDEX idx_last_watched_at (last_watched_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 通知表
CREATE TABLE IF NOT EXISTS notifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    type ENUM('like', 'comment', 'follow', 'video_upload', 'system') NOT NULL,
    title VARCHAR(200) NOT NULL,
    content TEXT,
    related_id INT NULL COMMENT '相关内容ID（视频ID、评论ID等）',
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_type (type),
    INDEX idx_is_read (is_read),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 系统设置表
CREATE TABLE IF NOT EXISTS system_settings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    setting_key VARCHAR(100) NOT NULL UNIQUE,
    setting_value TEXT,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_setting_key (setting_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 插入默认管理员用户（密码：Admin123）
INSERT IGNORE INTO users (username, email, password, role, status) VALUES 
('admin', 'admin@videoplatform.com', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj6hsxq9w5KS', 'admin', 'active');

-- 插入默认系统设置
INSERT IGNORE INTO system_settings (setting_key, setting_value, description) VALUES 
('site_name', 'Video Platform', '网站名称'),
('site_description', 'A modern video sharing platform', '网站描述'),
('max_upload_size', '524288000', '最大上传文件大小（字节）'),
('allowed_video_formats', 'mp4,avi,mov,wmv,flv,webm', '允许的视频格式'),
('allowed_image_formats', 'jpg,jpeg,png,webp', '允许的图片格式'),
('video_processing_enabled', 'true', '是否启用视频处理'),
('thumbnail_generation_enabled', 'true', '是否启用缩略图生成'),
('registration_enabled', 'true', '是否允许用户注册'),
('comment_enabled', 'true', '是否启用评论功能'),
('like_enabled', 'true', '是否启用点赞功能');

-- 创建视图：用户统计
CREATE OR REPLACE VIEW user_stats AS
SELECT 
    u.id,
    u.username,
    u.email,
    u.created_at,
    COUNT(DISTINCT v.id) as video_count,
    COALESCE(SUM(v.views), 0) as total_views,
    COALESCE(SUM(v.likes), 0) as total_likes,
    COUNT(DISTINCT f.follower_id) as follower_count,
    COUNT(DISTINCT ff.following_id) as following_count
FROM users u
LEFT JOIN videos v ON u.id = v.user_id AND v.status = 'published'
LEFT JOIN user_follows f ON u.id = f.following_id
LEFT JOIN user_follows ff ON u.id = ff.follower_id
GROUP BY u.id, u.username, u.email, u.created_at;

-- 创建视图：视频统计
CREATE OR REPLACE VIEW video_stats AS
SELECT 
    v.id,
    v.title,
    v.user_id,
    u.username,
    v.category,
    v.views,
    v.likes,
    v.created_at,
    COUNT(DISTINCT c.id) as comment_count,
    COUNT(DISTINCT vl.id) as like_count
FROM videos v
JOIN users u ON v.user_id = u.id
LEFT JOIN comments c ON v.id = c.video_id AND c.status = 'active'
LEFT JOIN video_likes vl ON v.id = vl.video_id
WHERE v.status = 'published'
GROUP BY v.id, v.title, v.user_id, u.username, v.category, v.views, v.likes, v.created_at;

-- 创建存储过程：清理过期数据
DELIMITER //
CREATE PROCEDURE CleanupExpiredData()
BEGIN
    -- 清理30天前的观看历史
    DELETE FROM watch_history WHERE created_at < DATE_SUB(NOW(), INTERVAL 30 DAY);
    
    -- 清理90天前已读的通知
    DELETE FROM notifications WHERE is_read = TRUE AND created_at < DATE_SUB(NOW(), INTERVAL 90 DAY);
    
    -- 清理已删除的评论（保留30天）
    DELETE FROM comments WHERE status = 'deleted' AND updated_at < DATE_SUB(NOW(), INTERVAL 30 DAY);
END //
DELIMITER ;

-- 创建触发器：更新视频点赞数
DELIMITER //
CREATE TRIGGER update_video_likes_count_insert
AFTER INSERT ON video_likes
FOR EACH ROW
BEGIN
    UPDATE videos SET likes = likes + 1 WHERE id = NEW.video_id;
END //

CREATE TRIGGER update_video_likes_count_delete
AFTER DELETE ON video_likes
FOR EACH ROW
BEGIN
    UPDATE videos SET likes = GREATEST(likes - 1, 0) WHERE id = OLD.video_id;
END //
DELIMITER ;

-- 创建触发器：更新评论点赞数
DELIMITER //
CREATE TRIGGER update_comment_likes_count_insert
AFTER INSERT ON comment_likes
FOR EACH ROW
BEGIN
    UPDATE comments SET likes = likes + 1 WHERE id = NEW.comment_id;
END //

CREATE TRIGGER update_comment_likes_count_delete
AFTER DELETE ON comment_likes
FOR EACH ROW
BEGIN
    UPDATE comments SET likes = GREATEST(likes - 1, 0) WHERE id = OLD.comment_id;
END //
DELIMITER ;

-- 创建索引优化查询性能
CREATE INDEX idx_videos_user_status ON videos(user_id, status);
CREATE INDEX idx_videos_category_status ON videos(category, status);
CREATE INDEX idx_comments_video_status ON comments(video_id, status);
CREATE INDEX idx_notifications_user_read ON notifications(user_id, is_read);

-- 插入示例数据（可选）
-- 注意：在生产环境中应该删除这些示例数据

-- 示例用户
INSERT IGNORE INTO users (username, email, password, role, status, bio) VALUES 
('testuser1', 'user1@example.com', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj6hsxq9w5KS', 'user', 'active', '这是一个测试用户'),
('testuser2', 'user2@example.com', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj6hsxq9w5KS', 'user', 'active', '另一个测试用户'),
('creator1', 'creator1@example.com', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj6hsxq9w5KS', 'user', 'active', '内容创作者');

-- 示例视频
INSERT IGNORE INTO videos (user_id, title, description, video_url, thumbnail_url, duration, category, status, views, likes) VALUES 
(2, '示例视频1', '这是一个示例视频的描述', '/uploads/videos/sample1.mp4', '/uploads/thumbnails/sample1.jpg', 120, 'entertainment', 'published', 1500, 45),
(3, '教程视频', '学习如何使用我们的平台', '/uploads/videos/tutorial.mp4', '/uploads/thumbnails/tutorial.jpg', 300, 'education', 'published', 2300, 78),
(4, '音乐视频', '一首美妙的音乐', '/uploads/videos/music.mp4', '/uploads/thumbnails/music.jpg', 180, 'music', 'published', 890, 23);

-- 示例评论
INSERT IGNORE INTO comments (video_id, user_id, content, status) VALUES 
(1, 3, '很棒的视频！', 'active'),
(1, 4, '学到了很多东西', 'active'),
(2, 2, '教程很详细，谢谢分享', 'active'),
(2, 4, '期待更多教程', 'active');

-- 示例播放列表
INSERT IGNORE INTO playlists (user_id, name, description, is_public) VALUES 
(2, '我的收藏', '收藏的精彩视频', TRUE),
(3, '教程合集', '所有教程视频', TRUE),
(4, '私人列表', '私人收藏', FALSE);

-- 示例播放列表视频关联
INSERT IGNORE INTO playlist_videos (playlist_id, video_id, position) VALUES 
(1, 1, 1),
(1, 2, 2),
(2, 2, 1),
(3, 3, 1);

COMMIT;